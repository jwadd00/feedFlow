from __future__ import annotations

from datetime import datetime
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Farm(Base, TimestampMixin):
    __tablename__ = "farms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farm_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    farm_name: Mapped[str] = mapped_column(String(200), nullable=False)
    grower_name: Mapped[str | None] = mapped_column(String(200))
    region: Mapped[str | None] = mapped_column(String(100))
    route: Mapped[str | None] = mapped_column(String(100))
    address: Mapped[str | None] = mapped_column(String(300))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    houses: Mapped[list[FarmHouse]] = relationship(back_populates="farm")


class FarmHouse(Base, TimestampMixin):
    __tablename__ = "farm_houses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), nullable=False)
    house_code: Mapped[str] = mapped_column(String(50), nullable=False)
    bird_count: Mapped[int | None] = mapped_column(Integer)
    flock_age_days: Mapped[int | None] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    farm: Mapped[Farm] = relationship(back_populates="houses")
    bins: Mapped[list[FeedBin]] = relationship(back_populates="house")

    __table_args__ = (UniqueConstraint("farm_id", "house_code", name="uq_farm_house"),)


class FeedType(Base, TimestampMixin):
    __tablename__ = "feed_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feed_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    feed_name: Mapped[str] = mapped_column(String(200), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class FeedBin(Base, TimestampMixin):
    __tablename__ = "feed_bins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farm_house_id: Mapped[int] = mapped_column(ForeignKey("farm_houses.id"), nullable=False)
    feed_type_id: Mapped[int] = mapped_column(ForeignKey("feed_types.id"), nullable=False)
    bin_code: Mapped[str] = mapped_column(String(50), nullable=False)
    capacity_tons: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_daily_consumption_tons: Mapped[float] = mapped_column(Float, nullable=False)
    minimum_safe_tons: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    house: Mapped[FarmHouse] = relationship(back_populates="bins")
    feed_type: Mapped[FeedType] = relationship()

    __table_args__ = (UniqueConstraint("farm_house_id", "bin_code", name="uq_house_bin"),)


class BinReading(Base, TimestampMixin):
    __tablename__ = "bin_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feed_bin_id: Mapped[int] = mapped_column(ForeignKey("feed_bins.id"), nullable=False)
    reading_datetime: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)  # Grower, Driver, Sensor, Manual, Estimate
    reading_tons: Mapped[float] = mapped_column(Float, nullable=False)
    reading_percent: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(100))

    feed_bin: Mapped[FeedBin] = relationship()


class BinInventoryEstimate(Base, TimestampMixin):
    __tablename__ = "bin_inventory_estimates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feed_bin_id: Mapped[int] = mapped_column(ForeignKey("feed_bins.id"), nullable=False, unique=True)
    last_reading_id: Mapped[int | None] = mapped_column(ForeignKey("bin_readings.id"))
    estimated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    current_estimated_tons: Mapped[float] = mapped_column(Float, nullable=False)
    percent_full: Mapped[float] = mapped_column(Float, nullable=False)
    daily_consumption_tons: Mapped[float] = mapped_column(Float, nullable=False)
    projected_empty_datetime: Mapped[datetime | None] = mapped_column(DateTime)
    days_remaining: Mapped[float | None] = mapped_column(Float)
    risk_level: Mapped[str] = mapped_column(String(50), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)


class LoadForecast(Base, TimestampMixin):
    __tablename__ = "load_forecasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feed_bin_id: Mapped[int] = mapped_column(ForeignKey("feed_bins.id"), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    current_estimated_tons: Mapped[float] = mapped_column(Float, nullable=False)
    days_remaining: Mapped[float | None] = mapped_column(Float)
    recommended_delivery_datetime: Mapped[datetime | None] = mapped_column(DateTime)
    recommended_tons: Mapped[float] = mapped_column(Float, nullable=False)
    priority: Mapped[str] = mapped_column(String(50), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="Open", nullable=False)  # Open, Converted, Deferred, Cancelled

    feed_bin: Mapped[FeedBin] = relationship()


class Load(Base, TimestampMixin):
    __tablename__ = "loads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    load_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), nullable=False)
    feed_bin_id: Mapped[int] = mapped_column(ForeignKey("feed_bins.id"), nullable=False)
    feed_type_id: Mapped[int] = mapped_column(ForeignKey("feed_types.id"), nullable=False)
    created_from_forecast_id: Mapped[int | None] = mapped_column(ForeignKey("load_forecasts.id"))
    planned_tons: Mapped[float] = mapped_column(Float, nullable=False)
    scheduled_delivery_datetime: Mapped[datetime | None] = mapped_column(DateTime)
    priority: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="Planned", nullable=False)
    truck: Mapped[str | None] = mapped_column(String(100))
    driver: Mapped[str | None] = mapped_column(String(100))
    route: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(100))


class LoadStatusHistory(Base, TimestampMixin):
    __tablename__ = "load_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    load_id: Mapped[int] = mapped_column(ForeignKey("loads.id"), nullable=False)
    old_status: Mapped[str | None] = mapped_column(String(50))
    new_status: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    changed_by: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)


class DeliveryTicket(Base, TimestampMixin):
    __tablename__ = "delivery_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    load_id: Mapped[int] = mapped_column(ForeignKey("loads.id"), nullable=False)
    ticket_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    delivered_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    actual_tons: Mapped[float] = mapped_column(Float, nullable=False)
    feed_type_id: Mapped[int] = mapped_column(ForeignKey("feed_types.id"), nullable=False)
    reconciled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reconciliation_notes: Mapped[str | None] = mapped_column(Text)


class DataQualityIssue(Base, TimestampMixin):
    __tablename__ = "data_quality_issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_code: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    severity: Mapped[str] = mapped_column(String(50), nullable=False)  # Low, Medium, High, Critical
    issue_status: Mapped[str] = mapped_column(String(50), default="Open", nullable=False)  # Open, Resolved, Ignored
    detected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    assigned_to: Mapped[str | None] = mapped_column(String(100))
    issue_summary: Mapped[str] = mapped_column(Text, nullable=False)
    resolution_notes: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (
        UniqueConstraint("rule_code", "entity_type", "entity_id", "issue_status", name="uq_open_issue"),
    )
