from __future__ import annotations

import json

import pandas as pd
from sqlalchemy import MetaData, create_engine, inspect, text

from .db_url import resolve_etl_database_url


class DBManager:
    def __init__(self, db_url: str | None = None):
        if db_url is None:
            db_url = resolve_etl_database_url()
        self.engine = create_engine(db_url)
        self.metadata = MetaData()
        self._dialect = self.engine.dialect.name

    @property
    def pandas_schema(self) -> str | None:
        return "public" if self._dialect == "postgresql" else None

    def _table_names(self) -> list[str]:
        inspector = inspect(self.engine)
        if self._dialect == "postgresql":
            return inspector.get_table_names(schema="public")
        return inspector.get_table_names()

    def _has_table(self, name: str) -> bool:
        inspector = inspect(self.engine)
        if self._dialect == "postgresql":
            return inspector.has_table(name, schema="public")
        return inspector.has_table(name)

    def _drop_table(self, table_name: str) -> None:
        with self.engine.begin() as conn:
            if self._dialect == "postgresql":
                conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))
            else:
                conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))

    def _delete_by_dates(self, table_name: str, date_column: str, unique_dates: list[str]) -> None:
        if not unique_dates:
            return
        with self.engine.begin() as conn:
            for date_value in unique_dates:
                if self._dialect == "postgresql":
                    conn.execute(
                        text(
                            f'DELETE FROM "{table_name}" '
                            f'WHERE CAST("{date_column}" AS DATE) = CAST(:d AS DATE)'
                        ),
                        {"d": date_value},
                    )
                else:
                    conn.execute(
                        text(
                            f"DELETE FROM {table_name} "
                            f"WHERE DATE({date_column}) = DATE(:d)"
                        ),
                        {"d": date_value},
                    )

    def _ensure_same_schema(self, table_name: str, df: pd.DataFrame) -> None:
        if not self._has_table(table_name):
            return

        inspector = inspect(self.engine)
        columns_kwargs = {"schema": "public"} if self._dialect == "postgresql" else {}
        existing_columns = [c["name"] for c in inspector.get_columns(table_name, **columns_kwargs)]
        new_columns = df.columns.tolist()
        if set(existing_columns) != set(new_columns):
            self._drop_table(table_name)

    def _write_df(self, table_name: str, df: pd.DataFrame, if_exists: str) -> tuple[bool, str]:
        if df is None or df.empty:
            return False, "No data to save"

        try:
            kwargs = {"schema": self.pandas_schema} if self.pandas_schema else {}
            df.to_sql(table_name, self.engine, if_exists=if_exists, index=False, **kwargs)
            return True, f"Saved {len(df)} rows into {table_name}"
        except Exception as error:
            return False, f"Database Error: {error}"

    def replace_table(self, table_name: str, df: pd.DataFrame) -> tuple[bool, str]:
        return self._write_df(table_name, df, if_exists="replace")

    def append_table(self, table_name: str, df: pd.DataFrame) -> tuple[bool, str]:
        return self._write_df(table_name, df, if_exists="append")

    def upsert_by_date(
        self, table_name: str, df: pd.DataFrame, date_column: str = "business_date"
    ) -> tuple[bool, str]:
        if df is None or df.empty:
            return False, "No data to save"
        if date_column not in df.columns:
            return False, f"Column {date_column} is missing"

        try:
            self._ensure_same_schema(table_name, df)
            unique_dates = (
                pd.to_datetime(df[date_column], errors="coerce")
                .dt.strftime("%Y-%m-%d")
                .dropna()
                .unique()
                .tolist()
            )
            if self._has_table(table_name):
                self._delete_by_dates(table_name, date_column, unique_dates)
            return self._write_df(table_name, df, if_exists="append")
        except Exception as error:
            return False, f"Database Error: {error}"

    def ensure_dashboard_settings_table(self) -> None:
        with self.engine.begin() as conn:
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

    def get_json_setting(self, key: str) -> dict | None:
        self.ensure_dashboard_settings_table()
        with self.engine.begin() as conn:
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
            ).mappings().first()

        if not row:
            return None

        raw = row.get("value")
        if not isinstance(raw, str) or raw.strip() == "":
            return None

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None

    def get_table_list(self) -> list[str]:
        return self._table_names()
