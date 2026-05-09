
import asyncio
from .rk_client import RKClient
from .mssql_client import MSSQLClient
from .db import DBManager
import logging
import time
import os
import pandas as pd
import sqlalchemy
from datetime import datetime, timedelta
from dotenv import load_dotenv
 
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path, override=False)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ETLWorker:
    def __init__(self):
        self.rk_client = RKClient()
        self.mssql_client = MSSQLClient()
        
        # Тот же PostgreSQL, что у FastAPI (env задаёт RKeeperService / docker-compose)
        self.db_manager = DBManager()
        self.is_running = False
        self.last_run_status = "Never ran"
        self.last_run_time = None
        self.last_sales_run_status = "Never ran"

    async def run_sync(self):
        if self.is_running:
            logger.warning("Sync already in progress")
            return "Busy"
        
        self.is_running = True
        self.last_run_status = "In Progress"
        start_time = time.time()
        
        try:
            logger.info("Starting dictionary synchronization...")
            refs = self.rk_client.get_ref_list()
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
            logger.info(f"Starting sales sync for period {date_from} to {date_to}...")
            
            df = self.mssql_client.fetch_sales_data(date_from, date_to)
            
            if df is None:
                self.last_sales_run_status = "Failed to fetch data from MSSQL"
                logger.error("Failed to fetch data from MSSQL")
                return "Failed"
            
            if df.empty:
                self.last_sales_run_status = "No data found for period"
                logger.info("No data found for period")
                return "No data"

            success, message = self.db_manager.save_sales_data(df)
            
            if success:
                self.last_sales_run_status = f"Success: {message}"
                logger.info(f"Sales sync success: {message}")
            else:
                self.last_sales_run_status = f"Failed to save DB: {message}"
                logger.error(f"Sales sync db error: {message}")
                
            return self.last_sales_run_status
            
        except Exception as e:
            self.last_sales_run_status = f"Crashed: {str(e)}"
            logger.error(f"Sales sync crashed: {e}")
            return str(e)
        finally:
            self.is_running = False

    def _get_interval_seconds(self):
        try:
            return int(os.getenv('ETL_INTERVAL_SECONDS', '3600'))
        except Exception:
            return 3600

    async def run_payments_sync(self, date_from: str, date_to: str):
        if self.is_running:
             logger.warning("Worker is busy")
             return "Busy"

        self.is_running = True
        self.last_sales_run_status = f"Payments Sync In Progress ({date_from} - {date_to})" # reusing status field or create new one
        
        try:
            logger.info(f"Starting payments sync for period {date_from} to {date_to}...")
            
            df = self.mssql_client.fetch_payments_data(date_from, date_to)
            
            if df is None:
                self.last_sales_run_status = "Failed to fetch payments from MSSQL"
                logger.error("Failed to fetch payments from MSSQL")
                return "Failed"
            
            if df.empty:
                self.last_sales_run_status = "No payments found for period"
                logger.info("No payments found for period")
                return "No data"

            success, message = self.db_manager.save_payments_data(df)
            
            if success:
                self.last_sales_run_status = f"Payments Success: {message}"
                logger.info(f"Payments sync success: {message}")
            else:
                self.last_sales_run_status = f"Failed to save DB: {message}"
                logger.error(f"Payments sync db error: {message}")
                
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
            logger.info(f"Starting operations sync for period {date_from} to {date_to}...")
            
            df = self.mssql_client.fetch_operations_data(date_from, date_to)
            
            if df is None:
                self.last_sales_run_status = "Failed to fetch operations from MSSQL"
                logger.error("Failed to fetch operations from MSSQL")
                return "Failed"
            
            if df.empty:
                self.last_sales_run_status = "No operations found for period"
                logger.info("No operations found for period")
                return "No data"

            success, message = self.db_manager.save_operations_data(df)
            
            if success:
                self.last_sales_run_status = f"Operations Success: {message}"
                logger.info(f"Operations sync success: {message}")
            else:
                self.last_sales_run_status = f"Failed to save DB: {message}"
                logger.error(f"Operations sync db error: {message}")
                
            return self.last_sales_run_status
            
        except Exception as e:
            self.last_sales_run_status = f"Crashed: {str(e)}"
            logger.error(f"Operations sync crashed: {e}")
            return str(e)
        finally:
            self.is_running = False

    def _save_bronze(self, table_name: str, df: pd.DataFrame):
        if df is None or df.empty:
            return False, "No data to save"
        try:
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

    def _upsert_by_shiftdate(self, table_name: str, df: pd.DataFrame):
        if df is None or df.empty:
            return False, "No data to save"
        try:
            if self.db_manager._has_table(table_name):
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

    def _transform_sales_gold(self, df: pd.DataFrame):
        if df is None or df.empty:
            return pd.DataFrame()
        x = df.copy()
        if 'SHIFTDATE' in x.columns:
            x['SHIFTDATE'] = pd.to_datetime(x['SHIFTDATE'], errors='coerce')
        group_cols = []
        for c in ['SHIFTDATE','CLOSESTATION','CURRENCY','CURRENCYTYPE','DISH','CATEGPATH']:
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

    async def run_all_etl(self, date_from: str, date_to: str):
        s = await self.run_sales_etl(date_from, date_to)
        p = await self.run_payments_etl(date_from, date_to)
        o = await self.run_operations_etl(date_from, date_to)
        return f"{s} | {p} | {o}"

    async def start_hourly_scheduler(self):
        while True:
            try:
                prev = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
                res = await self.run_all_etl(prev, prev)
                logger.info(res)
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
            await asyncio.sleep(self._get_interval_seconds())
