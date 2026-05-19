from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select

from src.database import get_session, retry_database_operation
from src.formatting import forecast_priority
from src.inventory import refresh_inventory_estimates
from src.models import BinInventoryEstimate, FeedBin, LoadForecast

FORECAST_WINDOW_DAYS = 5
TARGET_FILL_PERCENT = 0.92
DELIVERY_BUFFER_DAYS = 1.0


def recommend_tons(feed_bin: FeedBin, current_estimated_tons: float) -> float:
    target_tons = feed_bin.capacity_tons * TARGET_FILL_PERCENT
    return round(max(0.0, target_tons - current_estimated_tons), 1)


def build_forecast_reason(estimate: BinInventoryEstimate, recommended_tons: float) -> str:
    days = estimate.days_remaining
    if days is None:
        return "No projected empty date available because current inventory confidence is too low or consumption is missing."
    return (
        f"Projected to run out in {days:.1f} day(s). "
        f"Current estimate is {estimate.current_estimated_tons:.1f} tons. "
        f"Recommended delivery is {recommended_tons:.1f} tons. "
        f"Inventory confidence score is {estimate.confidence_score:.0f}."
    )


@retry_database_operation("generate load forecasts")
def generate_load_forecasts() -> int:
    """Create/update open forecasts for bins projected to need feed within the forecast window."""
    refresh_inventory_estimates()
    now = datetime.utcnow()
    updated_count = 0

    with get_session() as session:
        estimates = session.scalars(select(BinInventoryEstimate)).all()
        for estimate in estimates:
            feed_bin = session.get(FeedBin, estimate.feed_bin_id)
            if feed_bin is None or not feed_bin.active:
                continue

            if estimate.days_remaining is None:
                should_forecast = True
            else:
                should_forecast = estimate.days_remaining <= FORECAST_WINDOW_DAYS

            if not should_forecast:
                continue

            priority = forecast_priority(estimate.days_remaining)
            recommended_delivery = None
            if estimate.projected_empty_datetime:
                recommended_delivery = estimate.projected_empty_datetime - timedelta(days=DELIVERY_BUFFER_DAYS)
                if recommended_delivery < now:
                    recommended_delivery = now + timedelta(hours=2)

            recommended_tons = recommend_tons(feed_bin, estimate.current_estimated_tons)
            if recommended_tons <= 0 and estimate.risk_level not in {"Critical", "High"}:
                continue

            reason = build_forecast_reason(estimate, recommended_tons)

            forecast = session.scalar(
                select(LoadForecast)
                .where(LoadForecast.feed_bin_id == feed_bin.id, LoadForecast.status == "Open")
                .order_by(LoadForecast.generated_at.desc())
                .limit(1)
            )
            if forecast is None:
                forecast = LoadForecast(
                    feed_bin_id=feed_bin.id,
                    generated_at=now,
                    current_estimated_tons=estimate.current_estimated_tons,
                    days_remaining=estimate.days_remaining,
                    recommended_delivery_datetime=recommended_delivery,
                    recommended_tons=recommended_tons,
                    priority=priority,
                    confidence_score=estimate.confidence_score,
                    reason=reason,
                    status="Open",
                )
                session.add(forecast)
            else:
                forecast.generated_at = now
                forecast.current_estimated_tons = estimate.current_estimated_tons
                forecast.days_remaining = estimate.days_remaining
                forecast.recommended_delivery_datetime = recommended_delivery
                forecast.recommended_tons = recommended_tons
                forecast.priority = priority
                forecast.confidence_score = estimate.confidence_score
                forecast.reason = reason
            updated_count += 1

        session.commit()

    return updated_count


@retry_database_operation("defer forecast")
def defer_forecast(forecast_id: int, note: str | None = None) -> None:
    with get_session() as session:
        forecast = session.get(LoadForecast, forecast_id)
        if forecast is None:
            raise ValueError(f"Forecast not found: {forecast_id}")
        forecast.status = "Deferred"
        forecast.reason = f"{forecast.reason}\nDeferred note: {note or 'No note provided.'}"
        session.commit()
