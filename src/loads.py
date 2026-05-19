from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select

from src.database import get_session, retry_database_operation
from src.models import DeliveryTicket, Farm, FarmHouse, FeedBin, Load, LoadForecast, LoadStatusHistory

VALID_LOAD_STATUSES = [
    "Planned",
    "Scheduled",
    "Released to Mill",
    "Loaded",
    "In Transit",
    "Delivered",
    "Ticket Reconciled",
    "Exception",
    "Cancelled",
]


def _next_load_number(session) -> str:
    count = session.scalar(select(func.count()).select_from(Load)) or 0
    return f"LD-{10001 + count}"


def _farm_for_bin(session, feed_bin_id: int) -> Farm:
    feed_bin = session.get(FeedBin, feed_bin_id)
    if feed_bin is None:
        raise ValueError(f"Feed bin not found: {feed_bin_id}")
    house = session.get(FarmHouse, feed_bin.farm_house_id)
    if house is None:
        raise ValueError(f"Farm house not found for bin: {feed_bin_id}")
    farm = session.get(Farm, house.farm_id)
    if farm is None:
        raise ValueError(f"Farm not found for bin: {feed_bin_id}")
    return farm


@retry_database_operation("create load from forecast")
def create_load_from_forecast(
    forecast_id: int,
    planned_tons: float | None = None,
    scheduled_delivery_datetime: datetime | None = None,
    created_by: str = "app",
    notes: str | None = None,
) -> int:
    with get_session() as session:
        forecast = session.get(LoadForecast, forecast_id)
        if forecast is None:
            raise ValueError(f"Forecast not found: {forecast_id}")
        feed_bin = session.get(FeedBin, forecast.feed_bin_id)
        if feed_bin is None:
            raise ValueError(f"Feed bin not found for forecast: {forecast_id}")
        farm = _farm_for_bin(session, feed_bin.id)

        load = Load(
            load_number=_next_load_number(session),
            farm_id=farm.id,
            feed_bin_id=feed_bin.id,
            feed_type_id=feed_bin.feed_type_id,
            created_from_forecast_id=forecast.id,
            planned_tons=planned_tons if planned_tons is not None else forecast.recommended_tons,
            scheduled_delivery_datetime=scheduled_delivery_datetime or forecast.recommended_delivery_datetime,
            priority=forecast.priority,
            status="Planned",
            route=farm.route,
            notes=notes or f"Created from forecast {forecast.id}",
            created_by=created_by,
        )
        session.add(load)
        session.flush()
        forecast.status = "Converted"
        session.add(
            LoadStatusHistory(
                load_id=load.id,
                old_status=None,
                new_status="Planned",
                changed_at=datetime.utcnow(),
                changed_by=created_by,
                notes="Load created from forecast.",
            )
        )
        session.commit()
        return load.id


@retry_database_operation("create manual load")
def create_manual_load(
    feed_bin_id: int,
    planned_tons: float,
    priority: str,
    scheduled_delivery_datetime: datetime | None = None,
    truck: str | None = None,
    driver: str | None = None,
    created_by: str = "app",
    notes: str | None = None,
) -> int:
    with get_session() as session:
        feed_bin = session.get(FeedBin, feed_bin_id)
        if feed_bin is None:
            raise ValueError(f"Feed bin not found: {feed_bin_id}")
        farm = _farm_for_bin(session, feed_bin.id)
        load = Load(
            load_number=_next_load_number(session),
            farm_id=farm.id,
            feed_bin_id=feed_bin.id,
            feed_type_id=feed_bin.feed_type_id,
            planned_tons=planned_tons,
            scheduled_delivery_datetime=scheduled_delivery_datetime,
            priority=priority,
            status="Planned",
            truck=truck,
            driver=driver,
            route=farm.route,
            notes=notes,
            created_by=created_by,
        )
        session.add(load)
        session.flush()
        session.add(
            LoadStatusHistory(
                load_id=load.id,
                old_status=None,
                new_status="Planned",
                changed_at=datetime.utcnow(),
                changed_by=created_by,
                notes="Manual load created.",
            )
        )
        session.commit()
        return load.id


@retry_database_operation("update load status")
def update_load_status(load_id: int, new_status: str, changed_by: str = "app", notes: str | None = None) -> None:
    if new_status not in VALID_LOAD_STATUSES:
        raise ValueError(f"Invalid status: {new_status}")

    with get_session() as session:
        load = session.get(Load, load_id)
        if load is None:
            raise ValueError(f"Load not found: {load_id}")
        old_status = load.status
        load.status = new_status
        session.add(
            LoadStatusHistory(
                load_id=load.id,
                old_status=old_status,
                new_status=new_status,
                changed_at=datetime.utcnow(),
                changed_by=changed_by,
                notes=notes,
            )
        )
        session.commit()


@retry_database_operation("update load assignment")
def update_load_assignment(load_id: int, truck: str | None, driver: str | None, scheduled_delivery_datetime: datetime | None) -> None:
    with get_session() as session:
        load = session.get(Load, load_id)
        if load is None:
            raise ValueError(f"Load not found: {load_id}")
        load.truck = truck
        load.driver = driver
        load.scheduled_delivery_datetime = scheduled_delivery_datetime
        session.commit()


@retry_database_operation("add delivery ticket")
def add_delivery_ticket(load_id: int, ticket_number: str, actual_tons: float, delivered_at: datetime | None = None, reconciled: bool = False) -> int:
    delivered_at = delivered_at or datetime.utcnow()
    with get_session() as session:
        load = session.get(Load, load_id)
        if load is None:
            raise ValueError(f"Load not found: {load_id}")
        ticket = DeliveryTicket(
            load_id=load.id,
            ticket_number=ticket_number,
            delivered_at=delivered_at,
            actual_tons=actual_tons,
            feed_type_id=load.feed_type_id,
            reconciled=reconciled,
        )
        session.add(ticket)
        old_status = load.status
        load.status = "Ticket Reconciled" if reconciled else "Delivered"
        session.flush()
        session.add(
            LoadStatusHistory(
                load_id=load.id,
                old_status=old_status,
                new_status=load.status,
                changed_at=datetime.utcnow(),
                changed_by="app",
                notes=f"Ticket {ticket_number} captured.",
            )
        )
        session.commit()
        return ticket.id


@retry_database_operation("reconcile ticket")
def reconcile_ticket(ticket_id: int, notes: str | None = None) -> None:
    with get_session() as session:
        ticket = session.get(DeliveryTicket, ticket_id)
        if ticket is None:
            raise ValueError(f"Ticket not found: {ticket_id}")
        ticket.reconciled = True
        ticket.reconciliation_notes = notes
        load = session.get(Load, ticket.load_id)
        if load:
            old_status = load.status
            load.status = "Ticket Reconciled"
            session.add(
                LoadStatusHistory(
                    load_id=load.id,
                    old_status=old_status,
                    new_status="Ticket Reconciled",
                    changed_at=datetime.utcnow(),
                    changed_by="app",
                    notes=notes or "Ticket reconciled.",
                )
            )
        session.commit()
