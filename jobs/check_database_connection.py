from __future__ import annotations

import re

from sqlalchemy import text

from src.database import get_database_url, get_engine, with_database_retry


def main() -> None:
    url = get_database_url()
    engine = get_engine()

    def _check() -> int:
        with engine.connect() as conn:
            return conn.execute(text("SELECT 1 AS ok")).scalar_one()

    result = with_database_retry(_check, operation_name="check database connection")

    print(f"Connected to {engine.dialect.name}: {result == 1}")
    print(f"DATABASE_URL={_redact_url(url)}")


def _redact_url(url: str) -> str:
    if url.strip().lower().startswith("driver="):
        return re.sub(r"(Pwd=)[^;]*", r"\1***", url, flags=re.IGNORECASE)

    if "://" not in url or "@" not in url:
        return url

    scheme, rest = url.split("://", 1)
    credentials, location = rest.rsplit("@", 1)
    if ":" not in credentials:
        return f"{scheme}://***@{location}"

    username, _password = credentials.split(":", 1)
    return f"{scheme}://{username}:***@{location}"


if __name__ == "__main__":
    main()
