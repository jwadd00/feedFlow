from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select

from src.database import get_session, retry_database_operation
from src.formatting import classify_risk
from src.models import BinInventoryEstimate, BinReading, FeedBin


STALE_READING_HOURS = 36


def _confidence_score(source: str | None, hours_since_reading: float | None, suspicious: bool = False) -> float:
    score = 100.0

    if source in {"Manual", "Grower"}:
        score -= 5
    elif source == "Driver":
        score -= 3
    elif source == "Estimate":
        score -= 15

    if hours_since_reading is None:
        score -= 50
    elif hours_since_reading > STALE_READING_HOURS:
        score -= min(40, (hours_since_reading - STALE_READING_HOURS) * 1.5)
    elif hours_since_reading > 24:
        score -= 10

    if suspicious:
        score -= 30

    return max(0.0, round(score, 1))


def get_latest_reading(session, feed_bin_id: int) -> BinReading | None:
    return session.scalar(
        select(BinReading)
        .where(BinReading.feed_bin_id == feed_bin_id)
        .order_by(BinReading.reading_datetime.desc(), BinReading.id.desc())
        .limit(1)
    )


def calculate_inventory_estimate(feed_bin: FeedBin, latest_reading: BinReading | None, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()

    if not latest_reading:
        return {
            "last_reading_id": None,
            "estimated_at": now,
            "current_estimated_tons": 0.0,
            "percent_full": 0.0,
            "daily_consumption_tons": feed_bin.estimated_daily_consumption_tons,
            "projected_empty_datetime": None,
            "days_remaining": None,
            "risk_level": "Unknown",
            "confidence_score": 0.0,
        }

    hours_elapsed = max(0.0, (now - latest_reading.reading_datetime).total_seconds() / 3600)
    consumed_since_reading = feed_bin.estimated_daily_consumption_tons * (hours_elapsed / 24.0)
    current_tons = max(0.0, latest_reading.reading_tons - consumed_since_reading)
    percent_full = min(200.0, (current_tons / feed_bin.capacity_tons) * 100.0) if feed_bin.capacity_tons else 0.0

    if feed_bin.estimated_daily_consumption_tons > 0:
        days_remaining = current_tons / feed_bin.estimated_daily_consumption_tons
        projected_empty = now + timedelta(days=days_remaining)
    else:
        days_remaining = None
        projected_empty = None

    suspicious = latest_reading.reading_tons > feed_bin.capacity_tons or latest_reading.reading_tons < 0
    risk_level = classify_risk(days_remaining, current_tons, feed_bin.minimum_safe_tons)
    confidence = _confidence_score(latest_reading.source, hours_elapsed, suspicious=suspicious)

    return {
        "last_reading_id": latest_reading.id,
        "estimated_at": now,
        "current_estimated_tons": round(current_tons, 2),
        "percent_full": round(percent_full, 1),
        "daily_consumption_tons": round(feed_bin.estimated_daily_consumption_tons, 2),
        "projected_empty_datetime": projected_empty,
        "days_remaining": round(days_remaining, 2) if days_remaining is not None else None,
        "risk_level": risk_level,
        "confidence_score": confidence,
    }


@retry_database_operation("refresh inventory estimates")
def refresh_inventory_estimates() -> int:
    """Refresh one current inventory estimate per active feed bin."""
    now = datetime.utcnow()
    count = 0
    with get_session() as session:
        feed_bins = session.scalars(select(FeedBin).where(FeedBin.active == True)).all()  # noqa: E712
        for feed_bin in feed_bins:
            latest = get_latest_reading(session, feed_bin.id)
            values = calculate_inventory_estimate(feed_bin, latest, now=now)
            estimate = session.scalar(
                select(BinInventoryEstimate).where(BinInventoryEstimate.feed_bin_id == feed_bin.id)
            )
            if estimate is None:
                estimate = BinInventoryEstimate(feed_bin_id=feed_bin.id, **values)
                session.add(estimate)
            else:
                for key, value in values.items():
                    setattr(estimate, key, value)
            count += 1
        session.commit()
    return count


@retry_database_operation("add bin reading")
def add_bin_reading(feed_bin_id: int, reading_tons: float, source: str, reading_datetime: datetime | None = None, notes: str | None = None, created_by: str = "app") -> int:
    reading_datetime = reading_datetime or datetime.utcnow()
    with get_session() as session:
        feed_bin = session.get(FeedBin, feed_bin_id)
        if feed_bin is None:
            raise ValueError(f"Feed bin not found: {feed_bin_id}")
        reading = BinReading(
            feed_bin_id=feed_bin_id,
            reading_datetime=reading_datetime,
            source=source,
            reading_tons=reading_tons,
            reading_percent=round((reading_tons / feed_bin.capacity_tons) * 100, 1) if feed_bin.capacity_tons else None,
            notes=notes,
            created_by=created_by,
        )
        session.add(reading)
        session.commit()
        reading_id = reading.id

    refresh_inventory_estimates()
    return reading_id
