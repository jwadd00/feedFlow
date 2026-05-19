from datetime import datetime, timedelta

from src.inventory import calculate_inventory_estimate
from src.models import BinReading, FeedBin


def test_calculate_inventory_estimate_decreases_with_time():
    feed_bin = FeedBin(
        id=1,
        farm_house_id=1,
        feed_type_id=1,
        bin_code="B1",
        capacity_tons=20,
        estimated_daily_consumption_tons=2,
        minimum_safe_tons=2,
        active=True,
    )
    now = datetime.utcnow()
    reading = BinReading(
        feed_bin_id=1,
        reading_datetime=now - timedelta(hours=24),
        source="Sensor",
        reading_tons=10,
    )
    estimate = calculate_inventory_estimate(feed_bin, reading, now=now)
    assert estimate["current_estimated_tons"] == 8.0
    assert estimate["days_remaining"] == 4.0
