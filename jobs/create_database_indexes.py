from __future__ import annotations

from src.database import execute_sql, get_engine


INDEX_STATEMENTS = [
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_farm_houses_farm_id' AND object_id = OBJECT_ID(N'dbo.farm_houses'))
    CREATE INDEX ix_farm_houses_farm_id ON dbo.farm_houses(farm_id)
    """,
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_feed_bins_active' AND object_id = OBJECT_ID(N'dbo.feed_bins'))
    CREATE INDEX ix_feed_bins_active ON dbo.feed_bins(active)
    """,
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_feed_bins_farm_house_id' AND object_id = OBJECT_ID(N'dbo.feed_bins'))
    CREATE INDEX ix_feed_bins_farm_house_id ON dbo.feed_bins(farm_house_id)
    """,
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_feed_bins_feed_type_id' AND object_id = OBJECT_ID(N'dbo.feed_bins'))
    CREATE INDEX ix_feed_bins_feed_type_id ON dbo.feed_bins(feed_type_id)
    """,
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_bin_readings_feed_bin_datetime' AND object_id = OBJECT_ID(N'dbo.bin_readings'))
    CREATE INDEX ix_bin_readings_feed_bin_datetime ON dbo.bin_readings(feed_bin_id, reading_datetime DESC)
    """,
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_load_forecasts_status' AND object_id = OBJECT_ID(N'dbo.load_forecasts'))
    CREATE INDEX ix_load_forecasts_status ON dbo.load_forecasts(status)
    """,
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_loads_status' AND object_id = OBJECT_ID(N'dbo.loads'))
    CREATE INDEX ix_loads_status ON dbo.loads(status)
    """,
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_loads_scheduled_created' AND object_id = OBJECT_ID(N'dbo.loads'))
    CREATE INDEX ix_loads_scheduled_created ON dbo.loads(scheduled_delivery_datetime, created_at DESC)
    """,
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_delivery_tickets_delivered_at' AND object_id = OBJECT_ID(N'dbo.delivery_tickets'))
    CREATE INDEX ix_delivery_tickets_delivered_at ON dbo.delivery_tickets(delivered_at DESC)
    """,
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_data_quality_issues_status' AND object_id = OBJECT_ID(N'dbo.data_quality_issues'))
    CREATE INDEX ix_data_quality_issues_status ON dbo.data_quality_issues(issue_status, detected_at DESC)
    """,
]


def main() -> None:
    engine = get_engine()
    if engine.dialect.name != "mssql":
        print(f"Skipping index creation for {engine.dialect.name}.")
        return

    for statement in INDEX_STATEMENTS:
        execute_sql(statement)

    print(f"Created or verified {len(INDEX_STATEMENTS)} Azure SQL indexes.")


if __name__ == "__main__":
    main()
