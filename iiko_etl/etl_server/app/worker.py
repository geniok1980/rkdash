from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
import json
import logging
import os
from pathlib import Path
import re
import time
import xml.etree.ElementTree as ET

from dotenv import load_dotenv
import pandas as pd

from .db import DBManager
from .iiko_client import IikoClient, IikoClientConfig

app_env_path = Path(__file__).with_name(".env")
root_env_path = Path(__file__).resolve().parents[3] / ".env"

for env_path in (app_env_path, root_env_path):
    if env_path.exists():
        load_dotenv(env_path, override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

IIKO_SETTINGS_KEY = "iiko_etl_config"


@dataclass(slots=True)
class EffectiveIikoConfig:
    etl_service_url: str
    server_url: str
    login: str
    password: str
    interval_seconds: int
    request_timeout_seconds: int
    verify_ssl: bool


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if raw == "":
        return default
    return raw in {"1", "true", "yes", "on"}


def _coerce_bool(value, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


def _coerce_int(value, default: int, minimum: int) -> int:
    try:
        parsed = int(value)
        return max(minimum, parsed)
    except Exception:
        return max(minimum, default)


def _iso_dates(date_from: str, date_to: str) -> list[str]:
    start = date.fromisoformat(date_from)
    end = date.fromisoformat(date_to)
    if end < start:
        raise ValueError("date_to must be greater than or equal to date_from")

    days: list[str] = []
    current = start
    while current <= end:
        days.append(current.isoformat())
        current += timedelta(days=1)
    return days


def _safe_key(value: str) -> str:
    normalized = re.sub(r"[^0-9a-zA-Z]+", "_", value).strip("_").lower()
    return normalized or "value"


def _parse_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        raw = value.strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
        if raw == "":
            return None
        try:
            return float(raw)
        except ValueError:
            return None
    return None


def _flatten_xml_item(node: ET.Element, prefix: str = "") -> dict[str, str]:
    result: dict[str, str] = {}

    for attr_name, attr_value in node.attrib.items():
        key = _safe_key(f"{prefix}{attr_name}")
        result[key] = attr_value

    children = list(node)
    if not children:
        text_value = (node.text or "").strip()
        if text_value:
            key = _safe_key(prefix[:-1] if prefix.endswith("_") else prefix or node.tag)
            result[key] = text_value
        return result

    grouped: dict[str, list[ET.Element]] = {}
    for child in children:
        grouped.setdefault(_safe_key(child.tag), []).append(child)

    for child_key, child_nodes in grouped.items():
        if len(child_nodes) == 1:
            child = child_nodes[0]
            child_children = list(child)
            child_text = (child.text or "").strip()
            if not child_children and child.attrib == {} and child_text:
                result[_safe_key(f"{prefix}{child_key}")] = child_text
            else:
                nested = _flatten_xml_item(child, prefix=f"{prefix}{child_key}_")
                result.update(nested)
        else:
            for index, child in enumerate(child_nodes, start=1):
                nested = _flatten_xml_item(child, prefix=f"{prefix}{child_key}_{index}_")
                result.update(nested)

    return result


def _parse_xml_collection(xml_content: bytes | str, item_tag: str | None = None) -> list[dict[str, str]]:
    raw = xml_content.decode("utf-8", "ignore") if isinstance(xml_content, bytes) else xml_content
    raw = raw.strip()
    if raw == "":
        return []

    root = ET.fromstring(raw)

    if item_tag:
        nodes = root.findall(f".//{item_tag}")
    else:
        direct_children = list(root)
        if direct_children:
            first_tag = direct_children[0].tag
            if all(child.tag == first_tag for child in direct_children):
                nodes = direct_children
            else:
                nodes = root.findall(".//*")
        else:
            nodes = [root]

    rows: list[dict[str, str]] = []
    for node in nodes:
        row = _flatten_xml_item(node)
        if row:
            rows.append(row)
    return rows


def _first_value(row: dict, candidates: list[str]):
    for key in candidates:
        value = row.get(key)
        if value not in (None, "", "None"):
            return value
    return None


def _detect_revenue(row: dict) -> float | None:
    for key in (
        "sum",
        "amount",
        "revenue",
        "result_sum",
        "dish_sum",
        "product_sum",
        "sales_sum",
        "cost",
    ):
        value = row.get(key)
        number = _parse_number(value)
        if number is not None:
            return number
    return None


def _detect_quantity(row: dict) -> float | None:
    for key in ("quantity", "qty", "count", "dish_amount", "dish_quantity"):
        value = row.get(key)
        number = _parse_number(value)
        if number is not None:
            return number
    return None


class ETLWorker:
    def __init__(self):
        self.db_manager = DBManager()
        self.is_running = False
        self.last_dict_status = "Never ran"
        self.last_products_status = "Never ran"
        self.last_sales_status = "Never ran"
        self.last_run_time: float | None = None

    def get_effective_config(self) -> EffectiveIikoConfig:
        settings = self.db_manager.get_json_setting(IIKO_SETTINGS_KEY) or {}

        return EffectiveIikoConfig(
            etl_service_url=str(
                settings.get("etlServiceUrl")
                or os.getenv("IIKO_ETL_SERVICE_URL")
                or "http://127.0.0.1:8791"
            ),
            server_url=str(
                settings.get("serverUrl")
                or os.getenv("IIKO_SERVER_URL")
                or "https://403-115-825.iiko.it"
            ),
            login=str(settings.get("login") or os.getenv("IIKO_LOGIN") or ""),
            password=str(settings.get("password") or os.getenv("IIKO_PASSWORD") or ""),
            interval_seconds=_coerce_int(
                settings.get("intervalSeconds") or os.getenv("IIKO_ETL_INTERVAL_SECONDS") or 3600,
                3600,
                60,
            ),
            request_timeout_seconds=_coerce_int(
                settings.get("requestTimeoutSeconds")
                or os.getenv("IIKO_REQUEST_TIMEOUT_SECONDS")
                or 60,
                60,
                5,
            ),
            verify_ssl=_coerce_bool(
                settings.get("verifySsl"),
                _env_bool("IIKO_VERIFY_SSL", False),
            ),
        )

    def _create_client(self, config: EffectiveIikoConfig) -> IikoClient:
        if config.login.strip() == "" or config.password.strip() == "":
            raise RuntimeError("IIKO login/password are not configured")

        return IikoClient(
            IikoClientConfig(
                server_url=config.server_url,
                login=config.login,
                password=config.password,
                verify_ssl=config.verify_ssl,
                timeout_seconds=config.request_timeout_seconds,
                retry_count=12,
            )
        )

    def _extract_departments(self, xml_content: bytes) -> list[dict]:
        rows = _parse_xml_collection(xml_content, "corporateItemDto")
        return [row for row in rows if row.get("type") == "DEPARTMENT" and row.get("id")]

    def _save_xml_table(
        self, table_name: str, xml_content: bytes | str, item_tag: str | None = None
    ) -> tuple[bool, str]:
        rows = _parse_xml_collection(xml_content, item_tag=item_tag)
        if not rows:
            return self.db_manager.replace_table(table_name, pd.DataFrame())

        df = pd.DataFrame(rows)
        if "synced_at" not in df.columns:
            df["synced_at"] = datetime.utcnow().isoformat()
        return self.db_manager.replace_table(table_name, df)

    def _transform_sales_gold(self, df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return pd.DataFrame()

        working = df.copy()
        working["revenue"] = working.apply(
            lambda row: _detect_revenue(row.to_dict()),
            axis=1,
        )
        working["quantity"] = working.apply(
            lambda row: _detect_quantity(row.to_dict()),
            axis=1,
        )
        working["dish_name"] = working.apply(
            lambda row: _first_value(
                row.to_dict(),
                [
                    "dish",
                    "dish_name",
                    "product",
                    "product_name",
                    "name",
                    "dish_1_name",
                ],
            ),
            axis=1,
        )

        group_columns = ["business_date", "source_department_id", "source_department_name"]
        if "dish_name" in working.columns:
            group_columns.append("dish_name")

        gold = (
            working.groupby(group_columns, dropna=False)
            .agg(
                revenue=("revenue", "sum"),
                quantity=("quantity", "sum"),
                rows_count=("business_date", "size"),
            )
            .reset_index()
        )
        return gold

    async def run_sync(self):
        if self.is_running:
            logger.warning("IIKO dictionary sync already in progress")
            return "Busy"

        self.is_running = True
        self.last_dict_status = "In Progress"
        started_at = time.time()

        config = self.get_effective_config()
        client = self._create_client(config)

        try:
            departments_xml = client.get_departments()
            groups_xml = client.get_groups()
            terminals_xml = client.get_terminals()
            stores_xml = client.get_stores()

            results = [
                self._save_xml_table("iiko_departments", departments_xml, item_tag="corporateItemDto"),
                self._save_xml_table("iiko_groups", groups_xml, item_tag="corporateItemDto"),
                self._save_xml_table("iiko_terminals", terminals_xml, item_tag="terminalDto"),
                self._save_xml_table("iiko_stores", stores_xml),
            ]

            messages = [message for _, message in results]
            duration = time.time() - started_at
            self.last_dict_status = f"Completed in {duration:.2f}s. " + " | ".join(messages)
            self.last_run_time = time.time()
            return self.last_dict_status
        except Exception as error:
            self.last_dict_status = f"Failed: {error}"
            raise
        finally:
            client.quit_token()
            self.is_running = False

    async def run_products_sync(self):
        if self.is_running:
            logger.warning("IIKO worker is busy")
            return "Busy"

        self.is_running = True
        self.last_products_status = "In Progress"
        config = self.get_effective_config()

        try:
            last_error: Exception | None = None
            for attempt in range(1, 7):
                client = self._create_client(config)
                try:
                    products_xml = client.get_products(include_deleted=False)
                    ok, message = self._save_xml_table(
                        "iiko_products",
                        products_xml,
                        item_tag="productDto",
                    )
                    self.last_products_status = message if ok else f"Failed: {message}"
                    self.last_run_time = time.time()
                    return self.last_products_status
                except Exception as error:
                    last_error = error
                    self.last_products_status = f"Failed (attempt {attempt}): {error}"
                    logger.warning("IIKO products sync attempt %s failed: %s", attempt, error)
                    await asyncio.sleep(min(10, attempt * 2))
                finally:
                    client.quit_token()

            raise RuntimeError(str(last_error) if last_error else "Unknown IIKO products error")
        except Exception as error:
            self.last_products_status = f"Failed: {error}"
            raise
        finally:
            self.is_running = False

    async def run_sales_sync(self, date_from: str, date_to: str):
        if self.is_running:
            logger.warning("IIKO worker is busy")
            return "Busy"

        self.is_running = True
        self.last_sales_status = f"In Progress ({date_from} - {date_to})"
        config = self.get_effective_config()
        client = self._create_client(config)

        try:
            departments = self._extract_departments(client.get_departments())
            if not departments:
                raise RuntimeError("No IIKO departments found")

            total_rows = 0
            for business_date in _iso_dates(date_from, date_to):
                day_rows: list[dict] = []
                for department in departments:
                    xml_content = client.get_sales_report(department["id"], business_date)
                    rows = _parse_xml_collection(xml_content, item_tag="dayDishValue")
                    for row in rows:
                        row["business_date"] = business_date
                        row["source_department_id"] = department.get("id")
                        row["source_department_name"] = department.get("name")
                        row["requested_date_from"] = business_date
                        row["requested_date_to"] = business_date
                        row["synced_at"] = datetime.utcnow().isoformat()
                    day_rows.extend(rows)

                if not day_rows:
                    logger.info("IIKO sales report is empty for %s", business_date)
                    continue

                day_df = pd.DataFrame(day_rows).drop_duplicates()
                total_rows += len(day_df)

                bronze_ok, bronze_message = self.db_manager.append_table("iiko_sales_bronze", day_df)
                silver_ok, silver_message = self.db_manager.upsert_by_date(
                    "iiko_sales",
                    day_df,
                    date_column="business_date",
                )
                gold_df = self._transform_sales_gold(day_df)
                gold_ok, gold_message = self.db_manager.upsert_by_date(
                    "iiko_sales_gold",
                    gold_df,
                    date_column="business_date",
                )

                logger.info(
                    "IIKO sales sync %s: bronze=%s (%s), silver=%s (%s), gold=%s (%s)",
                    business_date,
                    bronze_ok,
                    bronze_message,
                    silver_ok,
                    silver_message,
                    gold_ok,
                    gold_message,
                )

            self.last_sales_status = (
                f"Completed for {date_from} - {date_to}. Saved {total_rows} sales rows"
            )
            self.last_run_time = time.time()
            return self.last_sales_status
        except Exception as error:
            self.last_sales_status = f"Failed: {error}"
            raise
        finally:
            client.quit_token()
            self.is_running = False

    async def run_all_sync(self, date_from: str, date_to: str):
        dict_message = await self.run_sync()
        products_message = await self.run_products_sync()
        sales_message = await self.run_sales_sync(date_from, date_to)
        return " | ".join([dict_message, products_message, sales_message])

    async def start_hourly_scheduler(self):
        while True:
            try:
                interval = self.get_effective_config().interval_seconds
            except Exception:
                interval = 3600

            await asyncio.sleep(interval)

            try:
                previous_day = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
                result = await self.run_all_sync(previous_day, previous_day)
                logger.info("IIKO scheduler completed: %s", result)
            except Exception as error:
                logger.error("IIKO scheduler error: %s", error)

    def get_status(self) -> dict:
        config = self.get_effective_config()
        safe_config = asdict(config)
        if safe_config.get("password"):
            safe_config["password"] = "***"

        return {
            "is_running": self.is_running,
            "last_dict_status": self.last_dict_status,
            "last_products_status": self.last_products_status,
            "last_sales_status": self.last_sales_status,
            "last_run_time": self.last_run_time,
            "effective_config": safe_config,
            "tables": self.db_manager.get_table_list(),
        }
