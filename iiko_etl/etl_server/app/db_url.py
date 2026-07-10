"""Resolve the shared ETL SQLite database used by the dashboard."""

from pathlib import Path
import os


def _to_sqlite_url(db_path: str) -> str:
    normalized = db_path.replace("\\", "/")
    if normalized.startswith("sqlite:"):
        return normalized
    if normalized.startswith("file:"):
        normalized = normalized[len("file:") :]
    return f"sqlite:///{normalized}"


def resolve_etl_database_url() -> str:
    raw_db_path = (os.getenv("IIKO_DB_PATH") or os.getenv("RKEEPER_DB_PATH") or "").strip()
    if raw_db_path:
        return _to_sqlite_url(raw_db_path)

    explicit_url = (
        os.getenv("IIKO_ETL_DATABASE_URL")
        or os.getenv("RKEEPER_ETL_DATABASE_URL")
        or os.getenv("SQLALCHEMY_DATABASE_URI")
        or ""
    ).strip()
    if explicit_url:
        if explicit_url.startswith("sqlite:") or explicit_url.startswith("file:"):
            return _to_sqlite_url(explicit_url)
        raise RuntimeError(
            "IIKO ETL in this project must write to SQLite. "
            "Use IIKO_DB_PATH, RKEEPER_DB_PATH, or a sqlite/file URL."
        )

    default_db_path = Path(__file__).resolve().parents[3] / "rkeeper_etl" / "rkeeper_data.db"
    return _to_sqlite_url(str(default_db_path))
