"""Единый URL для ETL: тот же PostgreSQL, что и у приложения (sync + psycopg)."""

import os


def resolve_etl_database_url() -> str:
    raw = (
        os.getenv("RKEEPER_ETL_DATABASE_URL")
        or os.getenv("SQLALCHEMY_DATABASE_URI")
        or ""
    ).strip()
    if not raw:
        raise RuntimeError(
            "Задайте SQLALCHEMY_DATABASE_URI или RKEEPER_ETL_DATABASE_URL для RKeeper ETL (PostgreSQL)."
        )
    if raw.startswith("sqlite"):
        return raw.replace("\\", "/")
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    if "+asyncpg" in raw:
        raw = raw.replace("+asyncpg", "+psycopg")
    elif raw.startswith("postgresql://") and "+psycopg" not in raw:
        raw = raw.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw
