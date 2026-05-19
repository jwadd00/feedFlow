from __future__ import annotations

import os
import time
from functools import lru_cache, wraps
from pathlib import Path
from typing import Callable, TypeVar

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.engine import Engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker

from src.models import Base

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_DATABASE_URL = "sqlite:///data/feedflow.db"
T = TypeVar("T")


def _env_flag(name: str, default: bool = False) -> bool:
    value = _get_setting(name)
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def _get_setting(name: str, default: str | None = None) -> str | bool | int | float | None:
    value = os.getenv(name)
    if value is not None:
        return value

    try:
        import streamlit as st

        if name in st.secrets:
            return st.secrets[name]
        if "database" in st.secrets and name in st.secrets["database"]:
            return st.secrets["database"][name]
    except Exception:
        pass

    return default


@lru_cache(maxsize=1)
def get_database_url() -> str:
    return str(_get_setting("DATABASE_URL", DEFAULT_DATABASE_URL))


def get_engine_url() -> str | URL:
    url = get_database_url()
    if _is_raw_odbc_connection_string(url):
        return URL.create("mssql+pyodbc", query={"odbc_connect": url})
    return url


def _is_raw_odbc_connection_string(url: str) -> bool:
    return url.strip().lower().startswith("driver=")


def should_seed_sample_data() -> bool:
    return _env_flag("SEED_SAMPLE_DATA", default=get_database_url().startswith("sqlite"))


def should_create_tables_on_startup() -> bool:
    return _env_flag("CREATE_TABLES_ON_STARTUP", default=True)


def should_run_startup_jobs() -> bool:
    return _env_flag("RUN_STARTUP_JOBS", default=get_database_url().startswith("sqlite"))


def get_db_connect_timeout_seconds() -> int:
    return int(_get_setting("DB_CONNECT_TIMEOUT_SECONDS", "5"))


def get_db_retry_attempts() -> int:
    return int(_get_setting("DB_RETRY_ATTEMPTS", "8"))


def get_db_retry_initial_delay_seconds() -> float:
    return float(_get_setting("DB_RETRY_INITIAL_DELAY_SECONDS", "2"))


def get_db_retry_max_delay_seconds() -> float:
    return float(_get_setting("DB_RETRY_MAX_DELAY_SECONDS", "20"))


def should_pool_pre_ping() -> bool:
    return _env_flag("DB_POOL_PRE_PING", default=get_database_url().startswith("sqlite"))


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    DATA_DIR.mkdir(exist_ok=True)
    url = get_database_url()
    engine_url = get_engine_url()

    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    elif url.startswith("mssql") or _is_raw_odbc_connection_string(url):
        connect_args = {"timeout": get_db_connect_timeout_seconds()}

    engine_kwargs = {
        "echo": False,
        "future": True,
        "connect_args": connect_args,
        "pool_pre_ping": should_pool_pre_ping(),
    }
    if url.startswith("mssql"):
        engine_kwargs["fast_executemany"] = True
    if _is_raw_odbc_connection_string(url):
        engine_kwargs["fast_executemany"] = True

    return create_engine(engine_url, **engine_kwargs)


@lru_cache(maxsize=1)
def get_session_factory():
    return sessionmaker(bind=get_engine(), autoflush=False, autocommit=False, future=True)


def get_session() -> Session:
    return get_session_factory()()


def run_with_session(operation: Callable[[Session], T], operation_name: str = "database operation") -> T:
    def _run() -> T:
        with get_session() as session:
            return operation(session)

    return with_database_retry(_run, operation_name=operation_name)


def retry_database_operation(operation_name: str) -> Callable[[Callable[..., T]], Callable[..., T]]:
    def _decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def _wrapped(*args, **kwargs) -> T:
            return with_database_retry(lambda: func(*args, **kwargs), operation_name=operation_name)

        return _wrapped

    return _decorator


def create_tables() -> None:
    with_database_retry(lambda: Base.metadata.create_all(bind=get_engine()), operation_name="create tables")


def read_sql(query: str, params: dict | None = None) -> pd.DataFrame:
    def _read() -> pd.DataFrame:
        with get_engine().connect() as conn:
            return pd.read_sql(text(query), conn, params=params or {})

    return with_database_retry(_read, operation_name="read data")


def execute_sql(statement: str, params: dict | None = None) -> None:
    def _execute() -> None:
        with get_engine().begin() as conn:
            conn.execute(text(statement), params or {})

    with_database_retry(_execute, operation_name="write data")


def with_database_retry(operation: Callable[[], T], operation_name: str = "database operation") -> T:
    attempts = max(1, get_db_retry_attempts())
    delay = max(0.0, get_db_retry_initial_delay_seconds())
    max_delay = max(delay, get_db_retry_max_delay_seconds())
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except (OperationalError, DBAPIError) as exc:
            last_error = exc
            if not _is_retryable_database_error(exc) or attempt == attempts:
                raise

            _show_retry_message(operation_name, attempt, attempts, delay)
            time.sleep(delay)
            delay = min(max_delay, delay * 1.8 if delay else 1.0)
            get_engine().dispose()

    if last_error:
        raise last_error
    raise RuntimeError(f"{operation_name} failed without an exception.")


def _is_retryable_database_error(exc: Exception) -> bool:
    message = str(exc).lower()
    retry_markers = [
        "timeout",
        "timed out",
        "temporarily unavailable",
        "server is not found",
        "not accessible",
        "connection refused",
        "connection reset",
        "login timeout",
        "transport-level error",
        "communication link failure",
        "service is busy",
        "40613",
        "40197",
        "40501",
        "4060",
        "10054",
        "10060",
    ]
    return any(marker in message for marker in retry_markers)


def _show_retry_message(operation_name: str, attempt: int, attempts: int, delay: float) -> None:
    message = (
        f"Database is waking up or temporarily unavailable while trying to {operation_name}. "
        f"Retry {attempt + 1} of {attempts} in {delay:.0f}s."
    )
    try:
        import streamlit as st

        st.info(message)
    except Exception:
        print(message)


def ensure_database_ready() -> None:
    """Create and seed the database if needed."""
    if should_create_tables_on_startup():
        create_tables()

    if should_seed_sample_data():
        from src.seed import seed_if_empty

        seed_if_empty()

    if not should_run_startup_jobs():
        return

    from src.inventory import refresh_inventory_estimates
    from src.forecasting import generate_load_forecasts
    from src.data_quality import run_data_quality_checks

    refresh_inventory_estimates()
    generate_load_forecasts()
    run_data_quality_checks()
