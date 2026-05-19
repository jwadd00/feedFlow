from __future__ import annotations

from sqlalchemy import inspect, text

from src.database import get_engine, with_database_retry


FEEDFLOW_TABLES = [
    "farms",
    "farm_houses",
    "feed_types",
    "feed_bins",
    "bin_readings",
    "bin_inventory_estimates",
    "load_forecasts",
    "loads",
    "load_status_history",
    "delivery_tickets",
    "data_quality_issues",
]


def main() -> None:
    with_database_retry(_inspect, operation_name="inspect database")


def _inspect() -> None:
    engine = get_engine()
    inspector = inspect(engine)
    tables = set(inspector.get_table_names(schema="dbo") if engine.dialect.name == "mssql" else inspector.get_table_names())

    with engine.connect() as conn:
        database_name = _database_name(conn, engine.dialect.name)
        print(f"Dialect: {engine.dialect.name}")
        print(f"Database: {database_name}")
        print("")
        print("FeedFlow table row counts:")
        for table in FEEDFLOW_TABLES:
            if table not in tables:
                print(f"- {table}: missing")
                continue
            count = conn.execute(text(f"SELECT COUNT(*) FROM {_qualified_table(table, engine.dialect.name)}")).scalar_one()
            print(f"- {table}: {count}")

        other_tables = sorted(tables.difference(FEEDFLOW_TABLES))
        if other_tables:
            print("")
            print("Other tables in this database:")
            for table in other_tables[:50]:
                print(f"- {table}")
            if len(other_tables) > 50:
                print(f"... plus {len(other_tables) - 50} more")


def _database_name(conn, dialect_name: str) -> str:
    if dialect_name == "mssql":
        return conn.execute(text("SELECT DB_NAME()")).scalar_one()
    if dialect_name == "sqlite":
        return "SQLite"
    return conn.execute(text("SELECT current_database()")).scalar_one()


def _qualified_table(table: str, dialect_name: str) -> str:
    if dialect_name == "mssql":
        return f"dbo.{table}"
    return table


if __name__ == "__main__":
    main()
