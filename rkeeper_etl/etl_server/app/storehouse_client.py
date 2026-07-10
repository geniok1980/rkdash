from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import pandas as pd
import requests


class StoreHouseError(Exception):
    """Raised when StoreHouse Web API returns an error."""


@dataclass(slots=True)
class StoreHouseClientConfig:
    api_url: str
    username: str
    password: str
    timeout_seconds: int = 30


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


def _parse_number(value: Any) -> float | None:
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


def _days_since_storehouse_epoch(value: str) -> int:
    return (date.fromisoformat(value) - date(1980, 1, 1)).days


def _normalize_code(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value)
    raw = str(value).strip()
    if raw.endswith(".0"):
        head = raw[:-2]
        if head.isdigit():
            return head
    return raw


class StoreHouseClient:
    """HTTP client for StoreHouse Pro Web API 2."""

    # RptSale flags on this StoreHouse:
    # 1 = external requests, 64 = goods, 128 = services.
    # For food-cost we need goods only, and without the external bit the report is empty.
    RPTSALE_FLAGS = 65
    RPTSALE_SHOW_ZERO = 0
    RPTSALE_GROUP_BY = 3
    RPTSALE_SECONDARY_MODE = 0
    GOODS_P_COST_USE_LINKED_KIT = 1

    def __init__(self, config: StoreHouseClientConfig):
        self.config = config
        self.base_url = config.api_url.rstrip("/")

    def _post(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = requests.post(
            f"{self.base_url}{endpoint}",
            json=payload,
            timeout=self.config.timeout_seconds,
        )
        response.raise_for_status()
        data = response.json()

        error_code = int(data.get("errorCode", 0) or 0)
        if error_code != 0:
            raise StoreHouseError(
                f"StoreHouse API error ({error_code}): {data.get('errMessage', 'Unknown error')}"
            )

        return data

    def exec_proc(
        self,
        proc_name: str,
        input_tables: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "UserName": self.config.username,
            "Password": self.config.password,
            "procName": proc_name,
        }
        if input_tables:
            payload["Input"] = input_tables
        return self._post("/api/sh5exec", payload)

    def _normalize_table_rows(self, table: dict[str, Any]) -> list[dict[str, Any]]:
        original_fields = table.get("original") or []
        fields = original_fields or table.get("fields") or []
        values = table.get("values") or []
        if not fields or not values:
            return []

        if isinstance(fields[0], dict):
            field_names = [str(field.get("path", "")) for field in fields]
        else:
            field_names = [str(field) for field in fields]

        if len(values) == len(field_names):
            row_count = max((len(column) for column in values), default=0)
            rows: list[dict[str, Any]] = []
            for row_index in range(row_count):
                row: dict[str, Any] = {}
                for column_index, field_name in enumerate(field_names):
                    column = values[column_index] if column_index < len(values) else []
                    row[field_name] = column[row_index] if row_index < len(column) else None
                rows.append(row)
            return rows

        rows = []
        for value_row in values:
            row: dict[str, Any] = {}
            for index, field_name in enumerate(field_names):
                row[field_name] = value_row[index] if index < len(value_row) else None
            rows.append(row)
        return rows

    def _find_table_rows(self, tables: list[dict[str, Any]], head: str) -> list[dict[str, Any]]:
        for table in tables:
            if str(table.get("head")) == str(head):
                return self._normalize_table_rows(table)
        return []

    def _lookup_map(
        self,
        tables: list[dict[str, Any]],
        head: str,
        key_field: str = "1",
        value_field: str = "3",
    ) -> dict[str, str]:
        lookup: dict[str, str] = {}
        for row in self._find_table_rows(tables, head):
            key = row.get(key_field)
            value = row.get(value_field)
            if key in (None, ""):
                continue
            lookup[str(key)] = "" if value is None else str(value)
        return lookup

    def _build_rptsale_input(self, business_date: str, flags: int | None = None) -> list[dict[str, Any]]:
        selected_flags = self.RPTSALE_FLAGS if flags is None else int(flags)
        return [
            {
                "head": "108",
                "original": ["1", "2", "30", "11", "3", "16"],
                "values": [
                    [business_date],
                    [business_date],
                    [selected_flags],
                    [self.RPTSALE_SHOW_ZERO],
                    [self.RPTSALE_GROUP_BY],
                    [self.RPTSALE_SECONDARY_MODE],
                ],
            }
        ]

    def _build_goods_input(self, group_rid: int) -> list[dict[str, Any]]:
        return [
            {
                "head": "209",
                "original": ["1"],
                "values": [[group_rid]],
            }
        ]

    def _build_goodspcost_input(
        self,
        goods_rid: int,
        quantity: float,
        business_date: str,
        unit_rid: int,
        division_rid: int | None = None,
        use_linked_kit: bool = False,
    ) -> list[dict[str, Any]]:
        original = ["1", "9", "61", "206\\1"]
        values: list[list[Any]] = [
            [goods_rid],
            [quantity],
            [_days_since_storehouse_epoch(business_date)],
            [unit_rid],
        ]
        if division_rid not in (None, 0):
            original.append("106\\1")
            values.append([division_rid])
        original.append("42")
        values.append([self.GOODS_P_COST_USE_LINKED_KIT if use_linked_kit else 0])
        return [{"head": "210", "original": original, "values": values}]

    def _empty_goods_catalog(self) -> pd.DataFrame:
        return pd.DataFrame(
            columns=[
                "GOODS_RID",
                "GOODS_GUID",
                "CODE",
                "CODE_NORMALIZED",
                "DISH",
                "GOODS_GROUP_RID",
                "GOODS_GROUP_NAME",
                "BASE_UNIT_RID",
                "BASE_UNIT_NAME",
                "REPORT_UNIT_RID",
                "REPORT_UNIT_NAME",
                "DEFAULT_DIVISION_RID",
                "DEFAULT_DIVISION_NAME",
                "LINKED_KIT_RID",
                "LINKED_KIT_NAME",
            ]
        )

    def _empty_cost_data(self) -> pd.DataFrame:
        return pd.DataFrame(
            columns=[
                "SHIFTDATE",
                "CODE",
                "DISH",
                "GOODS_RID",
                "QUANTITY",
                "cost_per_unit",
                "cost_per_unit_with_tax",
                "sale_price_per_unit",
                "COST_SUM",
                "COST_SUM_VAT",
                "COST_SUM_SALES_TAX",
                "COST_SUM_WITH_TAX",
                "SALE_SUM",
                "SALE_SUM_VAT",
                "SALE_SUM_SALES_TAX",
                "SALE_SUM_WITH_TAX",
                "PLACE_RID",
                "PLACE_NAME",
                "GOODS_GROUP_RID",
                "GOODS_GROUP_NAME",
                "SECONDARY_GROUP_RID",
                "UNIT_RID",
                "UNIT_NAME",
                "synced_at",
            ]
        )

    def _empty_unmatched_sales(self) -> pd.DataFrame:
        return pd.DataFrame(
            columns=[
                "SHIFTDATE",
                "CODE",
                "CODE_NORMALIZED",
                "DISH",
                "RESTAURANTNAME",
                "QUANTITY",
                "PAYSUM",
                "reason",
            ]
        )

    def fetch_goods_catalog(self) -> pd.DataFrame:
        response = self.exec_proc("GGroups")
        group_rows = self._find_table_rows(response.get("shTable") or [], "209")
        if not group_rows:
            return self._empty_goods_catalog()

        records: list[dict[str, Any]] = []
        seen_goods: set[str] = set()

        for group in group_rows:
            group_rid_raw = group.get("1") or group.get("Rid")
            if group_rid_raw in (None, ""):
                continue

            goods_response = self.exec_proc("Goods", self._build_goods_input(int(group_rid_raw)))
            goods_rows = self._find_table_rows(goods_response.get("shTable") or [], "210")
            for row in goods_rows:
                goods_rid = row.get("1") or row.get("Rid")
                if goods_rid in (None, ""):
                    continue
                goods_rid_key = str(goods_rid)
                if goods_rid_key in seen_goods:
                    continue
                seen_goods.add(goods_rid_key)

                code = _normalize_code(
                    row.get("242")
                    or row.get("210\\242")
                    or row.get("241")
                    or row.get("210\\241")
                )
                records.append(
                    {
                        "GOODS_RID": int(goods_rid),
                        "GOODS_GUID": row.get("4"),
                        "CODE": code,
                        "CODE_NORMALIZED": code,
                        "DISH": row.get("3") or row.get("210\\3"),
                        "GOODS_GROUP_RID": row.get("209\\1") or group_rid_raw,
                        "GOODS_GROUP_NAME": row.get("209\\3") or group.get("3"),
                        "BASE_UNIT_RID": row.get("206\\1"),
                        "BASE_UNIT_NAME": row.get("206\\3"),
                        "REPORT_UNIT_RID": row.get("206#1\\1") or row.get("206\\1"),
                        "REPORT_UNIT_NAME": row.get("206#1\\3") or row.get("206\\3"),
                        "DEFAULT_DIVISION_RID": (
                            row.get("106#1\\1")
                            or row.get("210\\106#1\\1")
                            or row.get("106\\1")
                            or row.get("210\\106\\1")
                        ),
                        "DEFAULT_DIVISION_NAME": (
                            row.get("106#1\\3")
                            or row.get("210\\106#1\\3")
                            or row.get("106\\3")
                            or row.get("210\\106\\3")
                        ),
                        "LINKED_KIT_RID": row.get("215#1\\1") or row.get("215\\1"),
                        "LINKED_KIT_NAME": row.get("215#1\\3") or row.get("215\\3"),
                    }
                )

        if not records:
            return self._empty_goods_catalog()

        frame = pd.DataFrame(records)
        frame = frame.drop_duplicates(subset=["GOODS_RID"], keep="first")
        frame["CODE_NORMALIZED"] = frame["CODE_NORMALIZED"].fillna("").map(_normalize_code)
        return frame

    def build_cost_data_from_sales(
        self,
        sales_df: pd.DataFrame,
    ) -> dict[str, pd.DataFrame]:
        goods_catalog = self.fetch_goods_catalog()
        unmatched = self._empty_unmatched_sales()
        if sales_df is None or sales_df.empty:
            return {
                "goods_catalog": goods_catalog,
                "costs": self._empty_cost_data(),
                "unmatched_sales": unmatched,
            }

        sales = sales_df.copy()
        sales["SHIFTDATE"] = pd.to_datetime(sales.get("SHIFTDATE"), errors="coerce")
        sales["QUANTITY"] = sales.get("QUANTITY").map(_parse_number)
        if "PAYSUM" in sales.columns:
            sales["PAYSUM"] = sales.get("PAYSUM").map(_parse_number)
        else:
            sales["PAYSUM"] = 0.0
        if "RESTAURANTNAME" not in sales.columns:
            sales["RESTAURANTNAME"] = None
        code_source = "RKID" if "RKID" in sales.columns else "CODE"
        sales["CODE"] = sales.get(code_source).map(_normalize_code)
        sales["CODE_NORMALIZED"] = sales["CODE"].map(_normalize_code)
        sales = sales[
            sales["SHIFTDATE"].notna()
            & sales["CODE_NORMALIZED"].ne("")
            & sales["QUANTITY"].notna()
            & sales["QUANTITY"].ne(0)
        ].copy()
        if sales.empty:
            return {
                "goods_catalog": goods_catalog,
                "costs": self._empty_cost_data(),
                "unmatched_sales": unmatched,
            }

        grouped_sales = (
            sales.groupby(
                ["SHIFTDATE", "CODE", "CODE_NORMALIZED", "DISH", "RESTAURANTNAME"],
                dropna=False,
                as_index=False,
            )
            .agg({"QUANTITY": "sum", "PAYSUM": "sum"})
            .reset_index(drop=True)
        )

        goods_match = goods_catalog.copy()
        goods_match = goods_match[goods_match["CODE_NORMALIZED"].ne("")].copy()
        if not goods_match.empty:
            goods_match = goods_match.sort_values(
                by=["CODE_NORMALIZED", "LINKED_KIT_RID", "DEFAULT_DIVISION_RID"],
                ascending=[True, False, False],
                na_position="last",
            )
            goods_match = goods_match.drop_duplicates(subset=["CODE_NORMALIZED"], keep="first")

        merged = grouped_sales.merge(goods_match, on="CODE_NORMALIZED", how="left")

        unmatched_rows: list[dict[str, Any]] = []
        cost_rows: list[dict[str, Any]] = []
        synced_at = pd.Timestamp.utcnow().isoformat()

        for row in merged.to_dict(orient="records"):
            shiftdate = row.get("SHIFTDATE")
            goods_rid = row.get("GOODS_RID")
            unit_rid = row.get("REPORT_UNIT_RID") or row.get("BASE_UNIT_RID")
            quantity = _parse_number(row.get("QUANTITY"))

            if goods_rid in (None, ""):
                unmatched_rows.append(
                    {
                        "SHIFTDATE": shiftdate,
                        "CODE": row.get("CODE"),
                        "CODE_NORMALIZED": row.get("CODE_NORMALIZED"),
                        "DISH": row.get("DISH"),
                        "RESTAURANTNAME": row.get("RESTAURANTNAME"),
                        "QUANTITY": quantity,
                        "PAYSUM": _parse_number(row.get("PAYSUM")),
                        "reason": "No Goods match for RK code",
                    }
                )
                continue

            if unit_rid in (None, "", 0):
                unmatched_rows.append(
                    {
                        "SHIFTDATE": shiftdate,
                        "CODE": row.get("CODE"),
                        "CODE_NORMALIZED": row.get("CODE_NORMALIZED"),
                        "DISH": row.get("DISH"),
                        "RESTAURANTNAME": row.get("RESTAURANTNAME"),
                        "QUANTITY": quantity,
                        "PAYSUM": _parse_number(row.get("PAYSUM")),
                        "reason": "Goods has no measurement unit",
                    }
                )
                continue

            shiftdate_value = pd.Timestamp(shiftdate)
            business_date = shiftdate_value.date().isoformat()
            division_rid = row.get("DEFAULT_DIVISION_RID")
            use_linked_kit = row.get("LINKED_KIT_RID") not in (None, "", 0)

            try:
                response = self.exec_proc(
                    "GoodsPCost",
                    self._build_goodspcost_input(
                        goods_rid=int(goods_rid),
                        quantity=float(quantity),
                        business_date=business_date,
                        unit_rid=int(unit_rid),
                        division_rid=int(division_rid) if division_rid not in (None, "", 0) else None,
                        use_linked_kit=use_linked_kit,
                    ),
                )
                cost_data_rows = self._find_table_rows(response.get("shTable") or [], "210#1")
                cost_data = cost_data_rows[0] if cost_data_rows else {}
            except Exception as exc:
                unmatched_rows.append(
                    {
                        "SHIFTDATE": shiftdate_value,
                        "CODE": row.get("CODE"),
                        "CODE_NORMALIZED": row.get("CODE_NORMALIZED"),
                        "DISH": row.get("DISH"),
                        "RESTAURANTNAME": row.get("RESTAURANTNAME"),
                        "QUANTITY": quantity,
                        "PAYSUM": _parse_number(row.get("PAYSUM")),
                        "reason": str(exc),
                    }
                )
                continue

            cost_sum = _parse_number(cost_data.get("80"))
            cost_sum_vat = _parse_number(cost_data.get("81"))
            cost_sum_sales_tax = _parse_number(cost_data.get("82"))
            cost_sum_with_tax = _parse_number(cost_data.get("83"))
            cost_per_unit = _parse_number(cost_data.get("84"))
            cost_per_unit_with_tax = _parse_number(cost_data.get("94"))
            sale_sum = _parse_number(row.get("PAYSUM"))

            if cost_per_unit is None and quantity not in (None, 0) and cost_sum is not None:
                cost_per_unit = cost_sum / quantity
            if (
                cost_per_unit_with_tax is None
                and quantity not in (None, 0)
                and cost_sum_with_tax is not None
            ):
                cost_per_unit_with_tax = cost_sum_with_tax / quantity

            sale_price_per_unit = None
            if sale_sum is not None and quantity not in (None, 0):
                sale_price_per_unit = sale_sum / quantity

            cost_rows.append(
                {
                    "SHIFTDATE": shiftdate_value,
                    "CODE": row.get("CODE"),
                    "DISH": row.get("DISH") or row.get("DISH_goods"),
                    "GOODS_RID": goods_rid,
                    "QUANTITY": quantity,
                    "cost_per_unit": cost_per_unit,
                    "cost_per_unit_with_tax": cost_per_unit_with_tax,
                    "sale_price_per_unit": sale_price_per_unit,
                    "COST_SUM": cost_sum,
                    "COST_SUM_VAT": cost_sum_vat,
                    "COST_SUM_SALES_TAX": cost_sum_sales_tax,
                    "COST_SUM_WITH_TAX": cost_sum_with_tax,
                    "SALE_SUM": sale_sum,
                    "SALE_SUM_VAT": None,
                    "SALE_SUM_SALES_TAX": None,
                    "SALE_SUM_WITH_TAX": sale_sum,
                    "PLACE_RID": division_rid,
                    "PLACE_NAME": row.get("RESTAURANTNAME") or row.get("DEFAULT_DIVISION_NAME"),
                    "GOODS_GROUP_RID": row.get("GOODS_GROUP_RID"),
                    "GOODS_GROUP_NAME": row.get("GOODS_GROUP_NAME"),
                    "SECONDARY_GROUP_RID": None,
                    "UNIT_RID": unit_rid,
                    "UNIT_NAME": row.get("REPORT_UNIT_NAME") or row.get("BASE_UNIT_NAME"),
                    "synced_at": synced_at,
                }
            )

        costs = pd.DataFrame(cost_rows) if cost_rows else self._empty_cost_data()
        unmatched = (
            pd.DataFrame(unmatched_rows) if unmatched_rows else self._empty_unmatched_sales()
        )
        if not costs.empty:
            costs["SHIFTDATE"] = pd.to_datetime(costs["SHIFTDATE"], errors="coerce")
        if not unmatched.empty:
            unmatched["SHIFTDATE"] = pd.to_datetime(unmatched["SHIFTDATE"], errors="coerce")

        return {
            "goods_catalog": goods_catalog,
            "costs": costs,
            "unmatched_sales": unmatched,
        }

    def build_cost_data_from_sales_with_rptsale_map(
        self,
        sales_df: pd.DataFrame,
        rptsale_df: pd.DataFrame,
    ) -> dict[str, pd.DataFrame]:
        goods_catalog = self.fetch_goods_catalog()
        unmatched = self._empty_unmatched_sales()

        if sales_df is None or sales_df.empty or rptsale_df is None or rptsale_df.empty:
            return {
                "goods_catalog": goods_catalog,
                "costs": self._empty_cost_data(),
                "unmatched_sales": unmatched,
            }

        map_df = rptsale_df.copy()
        map_df["SHIFTDATE"] = pd.to_datetime(map_df.get("SHIFTDATE"), errors="coerce")
        map_df["CODE"] = map_df.get("CODE").map(_normalize_code)
        map_df["CODE_NORMALIZED"] = map_df["CODE"].map(_normalize_code)
        map_df = map_df[
            map_df["SHIFTDATE"].notna()
            & map_df["CODE_NORMALIZED"].ne("")
            & map_df.get("GOODS_RID").notna()
        ].copy()
        if map_df.empty:
            return {
                "goods_catalog": goods_catalog,
                "costs": self._empty_cost_data(),
                "unmatched_sales": unmatched,
            }

        map_df = map_df.sort_values(by=["CODE_NORMALIZED"], ascending=True, na_position="last")
        map_df = map_df.drop_duplicates(subset=["CODE_NORMALIZED"], keep="first")
        map_df = map_df[
            [
                "CODE",
                "CODE_NORMALIZED",
                "DISH",
                "GOODS_RID",
                "UNIT_RID",
                "UNIT_NAME",
                "PLACE_RID",
                "PLACE_NAME",
                "GOODS_GROUP_RID",
                "GOODS_GROUP_NAME",
            ]
        ].copy()
        if goods_catalog is not None and not goods_catalog.empty:
            map_df = map_df.merge(
                goods_catalog[
                    [
                        "GOODS_RID",
                        "BASE_UNIT_RID",
                        "BASE_UNIT_NAME",
                        "REPORT_UNIT_RID",
                        "REPORT_UNIT_NAME",
                        "DEFAULT_DIVISION_RID",
                        "DEFAULT_DIVISION_NAME",
                        "LINKED_KIT_RID",
                        "LINKED_KIT_NAME",
                    ]
                ],
                on="GOODS_RID",
                how="left",
            )

        sales = sales_df.copy()
        sales["SHIFTDATE"] = pd.to_datetime(sales.get("SHIFTDATE"), errors="coerce")
        sales["QUANTITY"] = sales.get("QUANTITY").map(_parse_number)
        if "PAYSUM" in sales.columns:
            sales["PAYSUM"] = sales.get("PAYSUM").map(_parse_number)
        else:
            sales["PAYSUM"] = 0.0
        if "RESTAURANTNAME" not in sales.columns:
            sales["RESTAURANTNAME"] = None

        code_source = "RKID" if "RKID" in sales.columns else "CODE"
        sales["CODE"] = sales.get(code_source).map(_normalize_code)
        sales["CODE_NORMALIZED"] = sales["CODE"].map(_normalize_code)
        sales = sales[
            sales["SHIFTDATE"].notna()
            & sales["CODE_NORMALIZED"].ne("")
            & sales["QUANTITY"].notna()
            & sales["QUANTITY"].ne(0)
        ].copy()

        if sales.empty:
            return {
                "goods_catalog": goods_catalog,
                "costs": self._empty_cost_data(),
                "unmatched_sales": unmatched,
            }

        grouped_sales = (
            sales.groupby(
                ["SHIFTDATE", "CODE", "CODE_NORMALIZED", "DISH", "RESTAURANTNAME"],
                dropna=False,
                as_index=False,
            )
            .agg({"QUANTITY": "sum", "PAYSUM": "sum"})
            .reset_index(drop=True)
        )

        merged = grouped_sales.merge(map_df, on="CODE_NORMALIZED", how="left", suffixes=("", "_map"))

        unmatched_rows: list[dict[str, Any]] = []
        cost_rows: list[dict[str, Any]] = []
        synced_at = pd.Timestamp.utcnow().isoformat()

        for row in merged.to_dict(orient="records"):
            shiftdate = row.get("SHIFTDATE")
            goods_rid = row.get("GOODS_RID")
            unit_rid = row.get("REPORT_UNIT_RID") or row.get("BASE_UNIT_RID") or row.get("UNIT_RID")
            unit_name = row.get("REPORT_UNIT_NAME") or row.get("BASE_UNIT_NAME") or row.get("UNIT_NAME")
            quantity = _parse_number(row.get("QUANTITY"))
            division_rid = row.get("DEFAULT_DIVISION_RID") or row.get("PLACE_RID")
            use_linked_kit = row.get("LINKED_KIT_RID") not in (None, "", 0)

            if goods_rid in (None, ""):
                unmatched_rows.append(
                    {
                        "SHIFTDATE": shiftdate,
                        "CODE": row.get("CODE"),
                        "CODE_NORMALIZED": row.get("CODE_NORMALIZED"),
                        "DISH": row.get("DISH"),
                        "RESTAURANTNAME": row.get("RESTAURANTNAME"),
                        "QUANTITY": quantity,
                        "PAYSUM": _parse_number(row.get("PAYSUM")),
                        "reason": "No Goods match for RKID via RptSale",
                    }
                )
                continue

            if unit_rid in (None, "", 0):
                unmatched_rows.append(
                    {
                        "SHIFTDATE": shiftdate,
                        "CODE": row.get("CODE"),
                        "CODE_NORMALIZED": row.get("CODE_NORMALIZED"),
                        "DISH": row.get("DISH"),
                        "RESTAURANTNAME": row.get("RESTAURANTNAME"),
                        "QUANTITY": quantity,
                        "PAYSUM": _parse_number(row.get("PAYSUM")),
                        "reason": "Goods has no measurement unit (RptSale)",
                    }
                )
                continue

            if division_rid in (None, "", 0):
                division_rid = None

            shiftdate_value = pd.Timestamp(shiftdate)
            business_date = shiftdate_value.date().isoformat()

            try:
                response = self.exec_proc(
                    "GoodsPCost",
                    self._build_goodspcost_input(
                        goods_rid=int(goods_rid),
                        quantity=float(quantity),
                        business_date=business_date,
                        unit_rid=int(unit_rid),
                        division_rid=int(division_rid) if division_rid is not None else None,
                        use_linked_kit=use_linked_kit,
                    ),
                )
                cost_data_rows = self._find_table_rows(response.get("shTable") or [], "210#1")
                cost_data = cost_data_rows[0] if cost_data_rows else {}
            except Exception as exc:
                unmatched_rows.append(
                    {
                        "SHIFTDATE": shiftdate_value,
                        "CODE": row.get("CODE"),
                        "CODE_NORMALIZED": row.get("CODE_NORMALIZED"),
                        "DISH": row.get("DISH"),
                        "RESTAURANTNAME": row.get("RESTAURANTNAME"),
                        "QUANTITY": quantity,
                        "PAYSUM": _parse_number(row.get("PAYSUM")),
                        "reason": str(exc),
                    }
                )
                continue

            cost_sum = _parse_number(cost_data.get("80"))
            cost_sum_vat = _parse_number(cost_data.get("81"))
            cost_sum_sales_tax = _parse_number(cost_data.get("82"))
            cost_sum_with_tax = _parse_number(cost_data.get("83"))
            cost_per_unit = _parse_number(cost_data.get("84"))
            cost_per_unit_with_tax = _parse_number(cost_data.get("94"))
            sale_sum = _parse_number(row.get("PAYSUM"))

            if cost_per_unit is None and quantity not in (None, 0) and cost_sum is not None:
                cost_per_unit = cost_sum / quantity
            if (
                cost_per_unit_with_tax is None
                and quantity not in (None, 0)
                and cost_sum_with_tax is not None
            ):
                cost_per_unit_with_tax = cost_sum_with_tax / quantity

            sale_price_per_unit = None
            if sale_sum is not None and quantity not in (None, 0):
                sale_price_per_unit = sale_sum / quantity

            cost_rows.append(
                {
                    "SHIFTDATE": shiftdate_value,
                    "CODE": row.get("CODE"),
                    "DISH": row.get("DISH") or row.get("DISH_map"),
                    "GOODS_RID": goods_rid,
                    "QUANTITY": quantity,
                    "cost_per_unit": cost_per_unit,
                    "cost_per_unit_with_tax": cost_per_unit_with_tax,
                    "sale_price_per_unit": sale_price_per_unit,
                    "COST_SUM": cost_sum,
                    "COST_SUM_VAT": cost_sum_vat,
                    "COST_SUM_SALES_TAX": cost_sum_sales_tax,
                    "COST_SUM_WITH_TAX": cost_sum_with_tax,
                    "SALE_SUM": sale_sum,
                    "SALE_SUM_VAT": None,
                    "SALE_SUM_SALES_TAX": None,
                    "SALE_SUM_WITH_TAX": sale_sum,
                    "PLACE_RID": division_rid,
                    "PLACE_NAME": row.get("RESTAURANTNAME")
                    or row.get("DEFAULT_DIVISION_NAME")
                    or row.get("PLACE_NAME"),
                    "GOODS_GROUP_RID": row.get("GOODS_GROUP_RID"),
                    "GOODS_GROUP_NAME": row.get("GOODS_GROUP_NAME"),
                    "SECONDARY_GROUP_RID": None,
                    "UNIT_RID": unit_rid,
                    "UNIT_NAME": unit_name,
                    "synced_at": synced_at,
                }
            )

        costs = pd.DataFrame(cost_rows) if cost_rows else self._empty_cost_data()
        unmatched = (
            pd.DataFrame(unmatched_rows) if unmatched_rows else self._empty_unmatched_sales()
        )
        if not costs.empty:
            costs["SHIFTDATE"] = pd.to_datetime(costs["SHIFTDATE"], errors="coerce")
        if not unmatched.empty:
            unmatched["SHIFTDATE"] = pd.to_datetime(unmatched["SHIFTDATE"], errors="coerce")

        return {
            "goods_catalog": goods_catalog,
            "costs": costs,
            "unmatched_sales": unmatched,
        }

    def fetch_cost_data(self, date_from: str, date_to: str) -> pd.DataFrame:
        records: list[dict[str, Any]] = []

        for business_date in _iso_dates(date_from, date_to):
            candidates = [self.RPTSALE_FLAGS, 65, 193, 64, 320, 321, 577, 833]
            report_rows: list[dict[str, Any]] = []
            tables: list[dict[str, Any]] = []
            fallback_rows: list[dict[str, Any]] = []
            fallback_tables: list[dict[str, Any]] = []
            for flags in candidates:
                response = self.exec_proc("RptSale", self._build_rptsale_input(business_date, flags=flags))
                tables = response.get("shTable") or []
                report_rows = self._find_table_rows(tables, "300")
                if not report_rows:
                    continue
                if not fallback_rows:
                    fallback_rows = report_rows
                    fallback_tables = tables
                has_nonzero_cost = any(
                    (_parse_number(r.get("40")) not in (None, 0)) for r in report_rows
                )
                if has_nonzero_cost:
                    break

            if not report_rows and fallback_rows:
                report_rows = fallback_rows
                tables = fallback_tables

            if not report_rows:
                continue

            place_lookup = self._lookup_map(tables, "226")
            group_lookup = self._lookup_map(tables, "209")

            for row in report_rows:
                quantity = _parse_number(row.get("9"))
                cost_sum = _parse_number(row.get("40"))
                cost_sum_vat = _parse_number(row.get("41"))
                cost_sum_sales_tax = _parse_number(row.get("42"))
                cost_sum_with_tax = _parse_number(row.get("43"))
                sale_sum = _parse_number(row.get("45"))
                sale_sum_vat = _parse_number(row.get("46"))
                sale_sum_sales_tax = _parse_number(row.get("47"))
                sale_sum_with_tax = _parse_number(row.get("48"))
                place_rid = row.get("54")
                goods_group_rid = row.get("52")

                cost_per_unit = None
                cost_per_unit_with_tax = None
                sale_price_per_unit = None
                if quantity not in (None, 0):
                    if cost_sum is not None:
                        cost_per_unit = cost_sum / quantity
                    if cost_sum_with_tax is not None:
                        cost_per_unit_with_tax = cost_sum_with_tax / quantity
                    if sale_sum is not None:
                        sale_price_per_unit = sale_sum / quantity

                records.append(
                    {
                        "SHIFTDATE": business_date,
                        "CODE": row.get("210\\242"),
                        "DISH": row.get("210\\3"),
                        "GOODS_RID": row.get("210\\1"),
                        "QUANTITY": quantity,
                        "cost_per_unit": cost_per_unit,
                        "cost_per_unit_with_tax": cost_per_unit_with_tax,
                        "sale_price_per_unit": sale_price_per_unit,
                        "COST_SUM": cost_sum,
                        "COST_SUM_VAT": cost_sum_vat,
                        "COST_SUM_SALES_TAX": cost_sum_sales_tax,
                        "COST_SUM_WITH_TAX": cost_sum_with_tax,
                        "SALE_SUM": sale_sum,
                        "SALE_SUM_VAT": sale_sum_vat,
                        "SALE_SUM_SALES_TAX": sale_sum_sales_tax,
                        "SALE_SUM_WITH_TAX": sale_sum_with_tax,
                        "PLACE_RID": place_rid,
                        "PLACE_NAME": place_lookup.get("" if place_rid is None else str(place_rid)),
                        "GOODS_GROUP_RID": goods_group_rid,
                        "GOODS_GROUP_NAME": group_lookup.get(
                            "" if goods_group_rid is None else str(goods_group_rid)
                        ),
                        "SECONDARY_GROUP_RID": row.get("53"),
                        "UNIT_RID": row.get("210\\206#2\\1"),
                        "UNIT_NAME": row.get("210\\206#2\\3"),
                    }
                )

        if not records:
            return pd.DataFrame(
                columns=[
                    "SHIFTDATE",
                    "CODE",
                    "DISH",
                    "GOODS_RID",
                    "QUANTITY",
                    "cost_per_unit",
                    "cost_per_unit_with_tax",
                    "sale_price_per_unit",
                    "COST_SUM",
                    "COST_SUM_VAT",
                    "COST_SUM_SALES_TAX",
                    "COST_SUM_WITH_TAX",
                    "SALE_SUM",
                    "SALE_SUM_VAT",
                    "SALE_SUM_SALES_TAX",
                    "SALE_SUM_WITH_TAX",
                    "PLACE_RID",
                    "PLACE_NAME",
                    "GOODS_GROUP_RID",
                    "GOODS_GROUP_NAME",
                    "SECONDARY_GROUP_RID",
                    "UNIT_RID",
                    "UNIT_NAME",
                ]
            )

        frame = pd.DataFrame(records)
        frame["SHIFTDATE"] = pd.to_datetime(frame["SHIFTDATE"], errors="coerce")
        return frame
