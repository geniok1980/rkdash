import os
import json
import sqlalchemy
from sqlalchemy import create_engine, event, MetaData, inspect, text
from sqlalchemy.pool import NullPool
import pandas as pd

from .db_url import resolve_etl_database_url


class DBManager:
    def __init__(self, db_url: str | None = None):
        if db_url is None:
            db_url = resolve_etl_database_url()
        if db_url.startswith("sqlite:"):
            self.engine = create_engine(
                db_url,
                connect_args={
                    "timeout": 30,
                    "check_same_thread": False,
                },
                poolclass=NullPool,
            )

            @event.listens_for(self.engine, "connect")
            def _configure_sqlite_connection(dbapi_connection, _connection_record):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
                cursor.execute("PRAGMA busy_timeout=30000")
                cursor.close()
        else:
            self.engine = create_engine(db_url)
        self.metadata = MetaData()
        self._dialect = self.engine.dialect.name

    @property
    def pandas_schema(self) -> str | None:
        """Схема для pandas.to_sql (только PostgreSQL)."""
        return "public" if self._dialect == "postgresql" else None

    def _table_names(self) -> list[str]:
        insp = inspect(self.engine)
        if self._dialect == "postgresql":
            return insp.get_table_names(schema="public")
        return insp.get_table_names()

    def _has_table(self, name: str) -> bool:
        insp = inspect(self.engine)
        if self._dialect == "postgresql":
            return insp.has_table(name, schema="public")
        return insp.has_table(name)

    def _delete_by_shiftdates(self, conn, table_name: str, unique_dates) -> None:
        for date_val in unique_dates:
            d_str = str(date_val).split(" ")[0]
            if self._dialect == "postgresql":
                conn.execute(
                    text(
                        f'DELETE FROM "{table_name}" '
                        'WHERE CAST("SHIFTDATE" AS DATE) = CAST(:d AS DATE)'
                    ),
                    {"d": d_str},
                )
            else:
                conn.execute(
                    text(
                        f"DELETE FROM {table_name} "
                        "WHERE DATE(SHIFTDATE) = DATE(:d)"
                    ),
                    {"d": d_str},
                )

    def ensure_dashboard_settings_table(self) -> None:
        with self.engine.begin() as conn:
            if self._dialect == "postgresql":
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS dashboard_settings (
                          key TEXT PRIMARY KEY,
                          value TEXT NOT NULL,
                          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS dashboard_settings (
                          key TEXT PRIMARY KEY,
                          value TEXT NOT NULL,
                          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )

    def get_json_setting(self, key: str):
        self.ensure_dashboard_settings_table()
        with self.engine.connect() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT value
                    FROM dashboard_settings
                    WHERE key = :key
                    LIMIT 1
                    """
                ),
                {"key": key},
            ).fetchone()

        raw = row[0] if row else None
        if not raw:
            return None

        try:
            return json.loads(raw)
        except Exception:
            return None

    def save_ref_data(self, ref_name, xml_content):
        """
        Parses XML content for a specific reference and saves it to a table named ref_name.
        This function dynamically determines columns based on XML attributes.
        """
        import xml.etree.ElementTree as ET

        if not xml_content:
            return False, "Empty XML content"

        try:
            root = ET.fromstring(xml_content)

            ref_node = root.find(".//RK7Reference")
            if ref_node is None:
                return False, "No RK7Reference node found"

            items_node = ref_node.find("Items")
            if items_node is not None:
                items = list(items_node)
            else:
                items = list(ref_node)

            if not items:
                print(f"Dictionary {ref_name} is empty.")
                return True, "Empty dictionary"

            data_rows = []

            for item in items:
                row = item.attrib.copy()
                data_rows.append(row)

            if not data_rows:
                return True, "No data rows found"

            df = pd.DataFrame(data_rows)

            safe_table_name = "".join(c for c in ref_name if c.isalnum() or c == "_")

            ts_kw = {}
            if self.pandas_schema:
                ts_kw["schema"] = self.pandas_schema
            df.to_sql(safe_table_name, self.engine, if_exists="replace", index=False, **ts_kw)

            return True, f"Saved {len(data_rows)} rows to {safe_table_name}"

        except ET.ParseError as e:
            return False, f"XML Parse Error: {e}"
        except Exception as e:
            return False, f"Database Error: {e}"

    def save_sales_data(self, df: pd.DataFrame):
        if df is None or df.empty:
            return False, "No data to save"

        table_name = "rkeeper_sales"

        try:
            if self._has_table(table_name):
                inspector = inspect(self.engine)
                cols_kw = {"schema": "public"} if self._dialect == "postgresql" else {}
                existing_columns = [
                    c["name"] for c in inspector.get_columns(table_name, **cols_kw)
                ]
                new_columns = df.columns.tolist()

                if set(existing_columns) != set(new_columns):
                    print(f"Schema mismatch for {table_name}. Dropping and recreating.")
                    with self.engine.connect() as conn:
                        if self._dialect == "postgresql":
                            conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))
                        else:
                            conn.execute(text(f"DROP TABLE {table_name}"))
                        conn.commit()
                else:
                    if "SHIFTDATE" in df.columns:
                        unique_dates = df["SHIFTDATE"].unique()
                        with self.engine.connect() as conn:
                            self._delete_by_shiftdates(conn, table_name, unique_dates)
                            conn.commit()

            ts_kw = {}
            if self.pandas_schema:
                ts_kw["schema"] = self.pandas_schema
            df.to_sql(
                table_name,
                self.engine,
                if_exists="append",
                index=False,
                **ts_kw,
            )
            return True, f"Saved {len(df)} sales records"
        except Exception as e:
            return False, f"Database Error: {e}"

    def save_payments_data(self, df: pd.DataFrame):
        if df is None or df.empty:
            return False, "No data to save"

        table_name = "rkeeper_payments"

        try:
            if self._has_table(table_name):
                inspector = inspect(self.engine)
                cols_kw = {"schema": "public"} if self._dialect == "postgresql" else {}
                existing_columns = [
                    c["name"] for c in inspector.get_columns(table_name, **cols_kw)
                ]
                new_columns = df.columns.tolist()

                if set(existing_columns) != set(new_columns):
                    print(f"Schema mismatch for {table_name}. Dropping and recreating.")
                    with self.engine.connect() as conn:
                        if self._dialect == "postgresql":
                            conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))
                        else:
                            conn.execute(text(f"DROP TABLE {table_name}"))
                        conn.commit()
                else:
                    if "SHIFTDATE" in df.columns:
                        unique_dates = df["SHIFTDATE"].unique()
                        with self.engine.connect() as conn:
                            self._delete_by_shiftdates(conn, table_name, unique_dates)
                            conn.commit()

            ts_kw = {}
            if self.pandas_schema:
                ts_kw["schema"] = self.pandas_schema
            df.to_sql(
                table_name,
                self.engine,
                if_exists="append",
                index=False,
                **ts_kw,
            )
            return True, f"Saved {len(df)} payment records"
        except Exception as e:
            return False, f"Database Error: {e}"

    def save_operations_data(self, df: pd.DataFrame):
        if df is None or df.empty:
            return False, "No data to save"

        table_name = "rkeeper_operations"

        try:
            if self._has_table(table_name):
                inspector = inspect(self.engine)
                cols_kw = {"schema": "public"} if self._dialect == "postgresql" else {}
                existing_columns = [
                    c["name"] for c in inspector.get_columns(table_name, **cols_kw)
                ]
                new_columns = df.columns.tolist()

                if set(existing_columns) != set(new_columns):
                    print(f"Schema mismatch for {table_name}. Dropping and recreating.")
                    with self.engine.connect() as conn:
                        if self._dialect == "postgresql":
                            conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))
                        else:
                            conn.execute(text(f"DROP TABLE {table_name}"))
                        conn.commit()
                else:
                    if "SHIFTDATE" in df.columns:
                        unique_dates = df["SHIFTDATE"].unique()
                        with self.engine.connect() as conn:
                            self._delete_by_shiftdates(conn, table_name, unique_dates)
                            conn.commit()

            ts_kw = {}
            if self.pandas_schema:
                ts_kw["schema"] = self.pandas_schema
            df.to_sql(
                table_name,
                self.engine,
                if_exists="append",
                index=False,
                **ts_kw,
            )
            return True, f"Saved {len(df)} operations records"
        except Exception as e:
            return False, f"Database Error: {e}"

    def get_table_list(self):
        return self._table_names()
