"""Резолвит целевую БД ETL в SQLite, ту же `rkeeper_data.db`, что читает dashboard."""

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
    raw_db_path = (os.getenv("RKEEPER_DB_PATH") or "").strip()
    if raw_db_path:
        return _to_sqlite_url(raw_db_path)

    explicit_url = (
        os.getenv("RKEEPER_ETL_DATABASE_URL")
        or os.getenv("SQLALCHEMY_DATABASE_URI")
        or ""
    ).strip()
    if explicit_url:
        if explicit_url.startswith("sqlite:") or explicit_url.startswith("file:"):
            return _to_sqlite_url(explicit_url)
        raise RuntimeError(
            "RKeeper ETL в этом проекте должен писать в SQLite. "
            "Используйте RKEEPER_DB_PATH или sqlite/file URL."
        )

    default_db_path = Path(__file__).resolve().parents[2] / "rkeeper_data.db"
    return _to_sqlite_url(str(default_db_path))
