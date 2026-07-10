
import asyncio
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
import logging
import os
from pathlib import Path
import time

from dotenv import load_dotenv
import pandas as pd
import sqlalchemy

from .db import DBManager
from .mssql_client import MSSQLClient
from .rk_client import RKClient
from .storehouse_client import StoreHouseClient, StoreHouseClientConfig
 
app_env_path = Path(__file__).with_name('.env')
root_env_path = Path(__file__).resolve().parents[3] / '.env'

for env_path in (app_env_path, root_env_path):
    if env_path.exists():
        load_dotenv(env_path, override=False)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

RKEEPER_SETTINGS_KEY = "rkeeper_etl_config"


def _coerce_int(value, default: int, minimum: int = 1) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = default
    return max(minimum, parsed)


def _clean_text(value) -> str:
    return str(value or "").strip()


def _clean_url(value) -> str:
    return _clean_text(value).strip("`'\" ").rstrip("/")


@dataclass
class EffectiveRkeeperConfig:
    etl_service_url: str
    rk_server_ip: str
    rk_http_port: int
    rk_username: str
    rk_password: str
    mssql_server: str
    mssql_database: str
    mssql_user: str
    mssql_password: str
    mssql_port: int
    storehouse_api_url: str
    storehouse_username: str
    storehouse_password: str
    storehouse_request_timeout_seconds: int
    storehouse_rptsale_period_days: int
    interval_seconds: int
    write_mode: str

class ETLWorker:
    def __init__(self):
        # Целевая БД ETL: тот же SQLite-файл `rkeeper_data.db`, что читает dashboard.
        self.db_manager = DBManager()
        self.rk_client = None
        self.mssql_client = None
        self.storehouse_client = None
        self.is_running = False
        self.last_run_status = "Never ran"
        self.last_run_time = None
        self.last_sales_run_status = "Never ran"
        self.last_storehouse_run_status = "Never ran"

    def _get_existing_dictionary_tables(self) -> list[str]:
        technical_prefixes = ("rkeeper_", "iiko_", "dashboard_")
        technical_tables = {"sqlite_sequence"}
        tables = self.db_manager.get_table_list()
        return [
            table_name
            for table_name in tables
            if table_name not in technical_tables
            and not table_name.lower().startswith(technical_prefixes)
            and table_name.upper() == table_name
        ]

    def get_effective_config(self) -> EffectiveRkeeperConfig:
        settings = self.db_manager.get_json_setting(RKEEPER_SETTINGS_KEY) or {}
        return EffectiveRkeeperConfig(
            etl_service_url=_clean_url(
                settings.get("etlServiceUrl")
                or os.getenv("RKEEPER_ETL_SERVICE_URL")
                or "http://127.0.0.1:8690"
            ),
            rk_server_ip=_clean_text(settings.get("rkServerIp") or os.getenv("RK_SERVER_IP") or ""),
            rk_http_port=_coerce_int(
                settings.get("rkHttpPort") or os.getenv("RK_HTTP_PORT") or 16058,
                16058,
                1,
            ),
            rk_username=_clean_text(settings.get("rkUsername") or os.getenv("RK_USERNAME") or ""),
            rk_password=str(settings.get("rkPassword") or os.getenv("RK_PASSWORD") or ""),
            mssql_server=_clean_text(settings.get("mssqlServer") or os.getenv("MSSQL_SERVER") or ""),
            mssql_database=_clean_text(settings.get("mssqlDatabase") or os.getenv("MSSQL_DATABASE") or ""),
            mssql_user=_clean_text(settings.get("mssqlUser") or os.getenv("MSSQL_USER") or ""),
            mssql_password=str(settings.get("mssqlPassword") or os.getenv("MSSQL_PASSWORD") or ""),
            mssql_port=_coerce_int(
                settings.get("mssqlPort") or os.getenv("MSSQL_PORT") or 1433,
                1433,
                1,
            ),
            storehouse_api_url=_clean_url(
                settings.get("storehouseApiUrl") or os.getenv("STOREHOUSE_API_URL") or ""
            ),
            storehouse_username=_clean_text(
                settings.get("storehouseUsername") or os.getenv("STOREHOUSE_USERNAME") or ""
            ),
            storehouse_password=str(
                settings.get("storehousePassword") or os.getenv("STOREHOUSE_PASSWORD") or ""
            ),
            storehouse_request_timeout_seconds=_coerce_int(
                settings.get("storehouseRequestTimeoutSeconds")
                or os.getenv("STOREHOUSE_REQUEST_TIMEOUT_SECONDS")
                or 30,
                30,
                5,
            ),
            storehouse_rptsale_period_days=_coerce_int(
                settings.get("storehouseRptSalePeriodDays")
                or os.getenv("STOREHOUSE_RPTSALE_PERIOD_DAYS")
                or 1,
                1,
                1,
            ),
            interval_seconds=_coerce_int(
                settings.get("intervalSeconds") or os.getenv("ETL_INTERVAL_SECONDS") or 3600,
                3600,
                60,
            ),
            write_mode=str(settings.get("writeMode") or os.getenv("RKEEPER_ETL_WRITE_MODE") or "overwrite"),
        )

    def _refresh_clients(self, config: EffectiveRkeeperConfig):
        self.rk_client = RKClient(
            {
                "server": config.rk_server_ip,
                "port": str(config.rk_http_port),
                "user": config.rk_username,
                "password": config.rk_password,
            }
        )
        self.mssql_client = MSSQLClient(
            {
                "server": config.mssql_server,
                "database": config.mssql_database,
                "user": config.mssql_user,
                "password": config.mssql_password,
                "port": config.mssql_port,
            }
        )
        if config.storehouse_api_url and config.storehouse_username:
            self.storehouse_client = StoreHouseClient(
                StoreHouseClientConfig(
                    api_url=config.storehouse_api_url,
                    username=config.storehouse_username,
                    password=config.storehouse_password,
                    timeout_seconds=config.storehouse_request_timeout_seconds,
                )
            )
        else:
            self.storehouse_client = None

    async def run_sync(self):
        if self.is_running:
            logger.warning("Sync already in progress")
            return "Busy"
        
        self.is_running = True
        self.last_run_status = "In Progress"
        start_time = time.time()
        
        try:
            config = self.get_effective_config()
            self._refresh_clients(config)
            logger.info("Starting dictionary synchronization...")
            refs = self.rk_client.get_ref_list()
            if refs is None:
                rk_error = self.rk_client.last_error or "Не удалось получить список справочников RK7"
                existing_dictionary_tables = self._get_existing_dictionary_tables()
                if existing_dictionary_tables:
                    self.last_run_time = time.time()
                    self.last_run_status = (
                        f"Skipped: {rk_error}. Использую уже загруженные справочники "
                        f"({len(existing_dictionary_tables)} таблиц)"
                    )
                    logger.warning(self.last_run_status)
                    return self.last_run_status

                self.last_run_status = f"Failed: {rk_error}"
                logger.error(self.last_run_status)
                return rk_error

            logger.info(f"Found {len(refs)} dictionaries.")
            
            if not refs:
                self.last_run_status = "Failed: No refs found"
                return "No refs found"

            success_count = 0
            error_count = 0
            
            for ref_name in refs:
                logger.info(f"Processing {ref_name}...")
                try:
                    xml_data = self.rk_client.get_ref_data(ref_name)
                    if xml_data:
                        success, message = self.db_manager.save_ref_data(ref_name, xml_data)
                        if success:
                            success_count += 1
                        else:
                            # It's okay if it's empty, not really an error for the log summary unless needed
                            if "Empty dictionary" not in message:
                                error_count += 1
                                logger.error(f"Failed to save {ref_name}: {message}")
                            else:
                                logger.info(f"Skipped {ref_name}: Empty")
                    else:
                        error_count += 1
                        logger.error(f"Failed to fetch data for {ref_name}")
                except Exception as e:
                    error_count += 1
                    logger.error(f"Error processing {ref_name}: {e}")
                
                await asyncio.sleep(0.1)

            duration = time.time() - start_time
            self.last_run_status = f"Completed in {duration:.2f}s. Success: {success_count}, Errors: {error_count}"
            self.last_run_time = time.time()
            logger.info(self.last_run_status)
            return self.last_run_status

        except Exception as e:
            self.last_run_status = f"Crashed: {str(e)}"
            logger.error(f"Sync crashed: {e}")
            return str(e)
        finally:
            self.is_running = False

    async def run_sales_sync(self, date_from: str, date_to: str):
        if self.is_running:
             logger.warning("Worker is busy")
             return "Busy"

        self.is_running = True
        self.last_sales_run_status = f"Sales Sync In Progress ({date_from} - {date_to})"
        
        try:
            config = self.get_effective_config()
            self._refresh_clients(config)
            logger.info(f"Starting full sales ETL for period {date_from} to {date_to}...")
            message = await self.run_sales_etl(date_from, date_to)
            if message == "No sales data":
                self.last_sales_run_status = "No sales data found for period"
                logger.info(self.last_sales_run_status)
            else:
                self.last_sales_run_status = f"Success: {message}"
                logger.info(f"Sales sync success: {message}")
            return self.last_sales_run_status
            
        except Exception as e:
            self.last_sales_run_status = f"Crashed: {str(e)}"
            logger.error(f"Sales sync crashed: {e}")
            return str(e)
        finally:
            self.is_running = False

    def _get_interval_seconds(self):
        return self.get_effective_config().interval_seconds

    def _get_storehouse_period_range(self) -> tuple[str, str]:
        config = self.get_effective_config()
        date_to = datetime.now().date()
        date_from = date_to - timedelta(days=max(1, config.storehouse_rptsale_period_days) - 1)
        return date_from.isoformat(), date_to.isoformat()

    async def run_payments_sync(self, date_from: str, date_to: str):
        if self.is_running:
             logger.warning("Worker is busy")
             return "Busy"

        self.is_running = True
        self.last_sales_run_status = f"Payments Sync In Progress ({date_from} - {date_to})" # reusing status field or create new one
        
        try:
            config = self.get_effective_config()
            self._refresh_clients(config)
            logger.info(f"Starting full payments ETL for period {date_from} to {date_to}...")
            message = await self.run_payments_etl(date_from, date_to)
            if message == "No payments data":
                self.last_sales_run_status = "No payments found for period"
                logger.info(self.last_sales_run_status)
            else:
                self.last_sales_run_status = f"Payments Success: {message}"
                logger.info(f"Payments sync success: {message}")
            return self.last_sales_run_status
            
        except Exception as e:
            self.last_sales_run_status = f"Crashed: {str(e)}"
            logger.error(f"Payments sync crashed: {e}")
            return str(e)
        finally:
            self.is_running = False

    async def run_operations_sync(self, date_from: str, date_to: str):
        if self.is_running:
             logger.warning("Worker is busy")
             return "Busy"

        self.is_running = True
        self.last_sales_run_status = f"Operations Sync In Progress ({date_from} - {date_to})" 
        
        try:
            config = self.get_effective_config()
            self._refresh_clients(config)
            logger.info(f"Starting full operations ETL for period {date_from} to {date_to}...")
            message = await self.run_operations_etl(date_from, date_to)
            if message == "No operations data":
                self.last_sales_run_status = "No operations found for period"
                logger.info(self.last_sales_run_status)
            else:
                self.last_sales_run_status = f"Operations Success: {message}"
                logger.info(f"Operations sync success: {message}")
            return self.last_sales_run_status
            
        except Exception as e:
            self.last_sales_run_status = f"Crashed: {str(e)}"
            logger.error(f"Operations sync crashed: {e}")
            return str(e)
        finally:
            self.is_running = False

    async def run_storehouse_sync(self, date_from: str, date_to: str):
        if self.is_running:
             logger.warning("Worker is busy")
             return "Busy"

        self.is_running = True
        self.last_storehouse_run_status = f"StoreHouse Sync In Progress ({date_from} - {date_to})"

        try:
            config = self.get_effective_config()
            self._refresh_clients(config)
            if self.storehouse_client is None:
                self.last_storehouse_run_status = (
                    "Skipped: StoreHouse API URL or login is not configured"
                )
                logger.info(self.last_storehouse_run_status)
                return self.last_storehouse_run_status

            logger.info(
                "Starting StoreHouse cost ETL for period %s to %s...",
                date_from,
                date_to,
            )
            message = await self.run_storehouse_cost_etl(date_from, date_to)
            self.last_storehouse_run_status = f"StoreHouse Success: {message}"
            logger.info("StoreHouse sync success: %s", message)
            return self.last_storehouse_run_status
        except Exception as e:
            self.last_storehouse_run_status = f"Crashed: {str(e)}"
            logger.error(f"StoreHouse sync crashed: {e}")
            return str(e)
        finally:
            self.is_running = False

    def _save_bronze(self, table_name: str, df: pd.DataFrame):
        if df is None or df.empty:
            return False, "No data to save"
        try:
            if self.db_manager._has_table(table_name):
                existing_columns = self._get_table_columns(table_name)
                new_columns = df.columns.tolist()
                if set(existing_columns) != set(new_columns):
                    logger.warning(
                        "Schema mismatch for %s. Recreating table. existing=%s new=%s",
                        table_name,
                        existing_columns,
                        new_columns,
                    )
                    self._drop_table(table_name)

            sch = self.db_manager.pandas_schema
            kw = {"schema": sch} if sch else {}
            df.to_sql(
                table_name,
                self.db_manager.engine,
                if_exists="append",
                index=False,
                **kw,
            )
            return True, f"Appended {len(df)} rows to {table_name}"
        except Exception as e:
            return False, str(e)

    def _replace_table(self, table_name: str, df: pd.DataFrame):
        if df is None:
            return False, "No data frame provided"
        try:
            sch = self.db_manager.pandas_schema
            kw = {"schema": sch} if sch else {}
            df.to_sql(
                table_name,
                self.db_manager.engine,
                if_exists="replace",
                index=False,
                **kw,
            )
            return True, f"Replaced {table_name} with {len(df)} rows"
        except Exception as e:
            return False, str(e)

    def _drop_table(self, table_name: str) -> None:
        with self.db_manager.engine.connect() as conn:
            if self.db_manager._dialect == "postgresql":
                conn.execute(sqlalchemy.text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))
            else:
                conn.execute(sqlalchemy.text(f"DROP TABLE IF EXISTS {table_name}"))
            conn.commit()

    def _get_table_columns(self, table_name: str) -> list[str]:
        inspector = sqlalchemy.inspect(self.db_manager.engine)
        cols_kw = {"schema": "public"} if self.db_manager._dialect == "postgresql" else {}
        return [column["name"] for column in inspector.get_columns(table_name, **cols_kw)]

    def _upsert_by_shiftdate(self, table_name: str, df: pd.DataFrame):
        if df is None or df.empty:
            return False, "No data to save"
        try:
            if self.db_manager._has_table(table_name):
                existing_columns = self._get_table_columns(table_name)
                new_columns = df.columns.tolist()

                if set(existing_columns) != set(new_columns):
                    logger.warning(
                        "Schema mismatch for %s. Recreating table. existing=%s new=%s",
                        table_name,
                        existing_columns,
                        new_columns,
                    )
                    self._drop_table(table_name)
                else:
                    with self.db_manager.engine.connect() as conn:
                        if "SHIFTDATE" in df.columns:
                            dates = (
                                pd.to_datetime(df["SHIFTDATE"], errors="coerce")
                                .dt.date.unique()
                                .tolist()
                            )
                            self.db_manager._delete_by_shiftdates(conn, table_name, dates)
                            conn.commit()

            sch = self.db_manager.pandas_schema
            kw = {"schema": sch} if sch else {}
            df.to_sql(
                table_name,
                self.db_manager.engine,
                if_exists="append",
                index=False,
                **kw,
            )
            return True, f"Upserted {len(df)} rows into {table_name}"
        except Exception as e:
            return False, str(e)

    def _load_sales_for_costing(self, date_from: str, date_to: str) -> pd.DataFrame:
        columns = ["SHIFTDATE", "RESTAURANTNAME", "RKID", "CODE", "DISH", "QUANTITY", "PAYSUM"]
        local_df = pd.DataFrame(columns=columns)

        if self.db_manager._has_table("rkeeper_sales"):
            sales_columns = set(self._get_table_columns("rkeeper_sales"))
            rkid_select = '"RKID"' if self.db_manager._dialect == "postgresql" else "RKID"
            if "RKID" not in sales_columns:
                rkid_select = "NULL AS RKID"

            if self.db_manager._dialect == "postgresql":
                sql = sqlalchemy.text(
                    """
                    SELECT "SHIFTDATE", "RESTAURANTNAME", {rkid_select}, "CODE", "DISH", "QUANTITY", "PAYSUM"
                    FROM "rkeeper_sales"
                    WHERE CAST("SHIFTDATE" AS DATE) BETWEEN CAST(:date_from AS DATE) AND CAST(:date_to AS DATE)
                    """
                    .format(rkid_select=rkid_select)
                )
            else:
                sql = sqlalchemy.text(
                    """
                    SELECT SHIFTDATE, RESTAURANTNAME, {rkid_select}, CODE, DISH, QUANTITY, PAYSUM
                    FROM rkeeper_sales
                    WHERE DATE(SHIFTDATE) BETWEEN DATE(:date_from) AND DATE(:date_to)
                    """
                    .format(rkid_select=rkid_select)
                )
            local_df = pd.read_sql_query(
                sql,
                self.db_manager.engine,
                params={"date_from": date_from, "date_to": date_to},
            )

        if (local_df is None or local_df.empty) and self.mssql_client is not None:
            live_df = self.mssql_client.fetch_sales_data(date_from, date_to)
            if live_df is not None and not live_df.empty:
                available_columns = [column for column in columns if column in live_df.columns]
                local_df = live_df[available_columns].copy()

        for column in columns:
            if column not in local_df.columns:
                local_df[column] = None

        return local_df[columns].copy()

    def _transform_sales_gold(self, df: pd.DataFrame):
        if df is None or df.empty:
            return pd.DataFrame()
        x = df.copy()
        if 'SHIFTDATE' in x.columns:
            x['SHIFTDATE'] = pd.to_datetime(x['SHIFTDATE'], errors='coerce')
        group_cols = []
        for c in ['SHIFTDATE','RESTAURANTNAME','CLOSESTATION','CURRENCY','CURRENCYTYPE','DISH','CATEGPATH']:
            if c in x.columns:
                group_cols.append(c)
        
        agg = {}
        if 'PAYSUM' in x.columns:
            agg['PAYSUM'] = ('PAYSUM', 'sum')
        if 'QUANTITY' in x.columns:
            agg['QUANTITY'] = ('QUANTITY', 'sum')
        if 'CHECKNUM' in x.columns:
            agg['CHECKS_COUNT'] = ('CHECKNUM','nunique')
        
        row_count_col = 'SHIFTDATE' if 'SHIFTDATE' in x.columns else 'CLOSESTATION'
        agg['ROWS_COUNT'] = (row_count_col, 'size')

        if not group_cols:
            return pd.DataFrame()
        
        # Using named aggregation via kwargs
        g = x.groupby(group_cols).agg(**agg)
        g = g.reset_index()
        return g

    def _transform_payments_gold(self, df: pd.DataFrame):
        if df is None or df.empty:
            return pd.DataFrame()
        x = df.copy()
        if 'SHIFTDATE' in x.columns:
            x['SHIFTDATE'] = pd.to_datetime(x['SHIFTDATE'], errors='coerce')
        group_cols = []
        for c in ['SHIFTDATE','CLOSESTATION','CURRENCY','CURRENCYTYPE','PAYLINETYPE']:
            if c in x.columns:
                group_cols.append(c)
        
        agg = {}
        if 'BASICSUM' in x.columns:
            agg['BASICSUM'] = ('BASICSUM', 'sum')
        if 'ORIGINALSUM' in x.columns:
            agg['ORIGINALSUM'] = ('ORIGINALSUM', 'sum')
        if 'CHECKNUM' in x.columns:
            agg['CHECKS_COUNT'] = ('CHECKNUM','nunique')
        
        row_count_col = 'SHIFTDATE' if 'SHIFTDATE' in x.columns else 'CLOSESTATION'
        agg['ROWS_COUNT'] = (row_count_col, 'size')

        if not group_cols:
            return pd.DataFrame()
        
        g = x.groupby(group_cols).agg(**agg)
        g = g.reset_index()
        return g

    def _transform_operations_gold(self, df: pd.DataFrame):
        if df is None or df.empty:
            return pd.DataFrame()
        x = df.copy()
        if 'SHIFTDATE' in x.columns:
            x['SHIFTDATE'] = pd.to_datetime(x['SHIFTDATE'], errors='coerce')
        group_cols = []
        for c in ['SHIFTDATE','OPERATION','DISH','CLOSESTATION']:
            if c in x.columns:
                group_cols.append(c)
        
        agg = {}
        if 'QNT' in x.columns:
            agg['QNT'] = ('QNT', 'sum')
        
        row_count_col = 'SHIFTDATE' if 'SHIFTDATE' in x.columns else 'OPERATION'
        agg['ROWS_COUNT'] = (row_count_col, 'size')

        if not group_cols:
            return pd.DataFrame()
        
        g = x.groupby(group_cols).agg(**agg)
        g = g.reset_index()
        return g

    async def run_sales_etl(self, date_from: str, date_to: str):
        df_raw = self.mssql_client.fetch_sales_data(date_from, date_to)
        if df_raw is None or df_raw.empty:
            return "No sales data"
        bronze_ok, bronze_msg = self._save_bronze('rkeeper_sales_bronze', df_raw)
        df_silver = df_raw.drop_duplicates()
        silver_ok, silver_msg = self.db_manager.save_sales_data(df_silver)
        df_gold = self._transform_sales_gold(df_silver)
        gold_ok, gold_msg = self._upsert_by_shiftdate('rkeeper_sales_gold', df_gold)
        return f"Sales ETL: {bronze_msg}; {silver_msg}; {gold_msg}"

    async def run_payments_etl(self, date_from: str, date_to: str):
        df_raw = self.mssql_client.fetch_payments_data(date_from, date_to)
        if df_raw is None or df_raw.empty:
            return "No payments data"
        bronze_ok, bronze_msg = self._save_bronze('rkeeper_payments_bronze', df_raw)
        df_silver = df_raw.drop_duplicates()
        silver_ok, silver_msg = self.db_manager.save_payments_data(df_silver)
        df_gold = self._transform_payments_gold(df_silver)
        gold_ok, gold_msg = self._upsert_by_shiftdate('rkeeper_payments_gold', df_gold)
        return f"Payments ETL: {bronze_msg}; {silver_msg}; {gold_msg}"

    async def run_operations_etl(self, date_from: str, date_to: str):
        df_raw = self.mssql_client.fetch_operations_data(date_from, date_to)
        if df_raw is None or df_raw.empty:
            return "No operations data"
        bronze_ok, bronze_msg = self._save_bronze('rkeeper_operations_bronze', df_raw)
        df_silver = df_raw.drop_duplicates()
        silver_ok, silver_msg = self.db_manager.save_operations_data(df_silver)
        df_gold = self._transform_operations_gold(df_silver)
        gold_ok, gold_msg = self._upsert_by_shiftdate('rkeeper_operations_gold', df_gold)
        return f"Operations ETL: {bronze_msg}; {silver_msg}; {gold_msg}"

    async def run_storehouse_cost_etl(self, date_from: str, date_to: str):
        if self.storehouse_client is None:
            return "Skipped: StoreHouse is not configured"

        df_rptsale = self.storehouse_client.fetch_cost_data(date_from, date_to)
        if df_rptsale is None or df_rptsale.empty:
            return "No StoreHouse cost data via RptSale"

        df_raw = df_rptsale

        if "synced_at" not in df_raw.columns:
            df_raw["synced_at"] = datetime.utcnow().isoformat()

        bronze_ok, bronze_msg = self._save_bronze('rkeeper_storehouse_cost_bronze', df_raw)
        df_silver = df_raw.drop_duplicates()
        silver_ok, silver_msg = self._upsert_by_shiftdate('rkeeper_menu_item_cost', df_silver)
        return f"StoreHouse ETL (RptSale): {bronze_msg}; {silver_msg}"

    async def run_all_etl(self, date_from: str, date_to: str):
        s = await self.run_sales_etl(date_from, date_to)
        p = await self.run_payments_etl(date_from, date_to)
        o = await self.run_operations_etl(date_from, date_to)
        sh = await self.run_storehouse_cost_etl(date_from, date_to)
        return f"{s} | {p} | {o} | {sh}"

    async def start_hourly_scheduler(self):
        # Даем API подняться сразу; первый плановый прогон идет после интервала.
        await asyncio.sleep(self._get_interval_seconds())
        while True:
            try:
                prev = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
                storehouse_from, storehouse_to = self._get_storehouse_period_range()
                dicts = await self.run_sync()
                sales = await self.run_sales_etl(prev, prev)
                payments = await self.run_payments_etl(prev, prev)
                operations = await self.run_operations_etl(prev, prev)
                storehouse = await self.run_storehouse_cost_etl(storehouse_from, storehouse_to)
                logger.info("%s | %s | %s | %s | %s", dicts, sales, payments, operations, storehouse)
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
            await asyncio.sleep(self._get_interval_seconds())

    def get_status(self):
        config = asdict(self.get_effective_config())
        if config.get("rk_password"):
            config["rk_password"] = "***"
        if config.get("mssql_password"):
            config["mssql_password"] = "***"
        if config.get("storehouse_password"):
            config["storehouse_password"] = "***"

        return {
            "is_running": self.is_running,
            "last_dict_status": self.last_run_status,
            "last_sales_status": self.last_sales_run_status,
            "last_storehouse_status": self.last_storehouse_run_status,
            "last_run_time": self.last_run_time,
            "effective_config": config,
            "tables": self.db_manager.get_table_list(),
        }
