from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select

from src.database import get_session, retry_database_operation
from src.inventory import STALE_READING_HOURS, get_latest_reading, refresh_inventory_estimates
from src.models import BinInventoryEstimate, BinReading, DataQualityIssue, DeliveryTicket, FeedBin, Load


def _upsert_open_issue(session, rule_code: str, entity_type: str, entity_id: int, severity: str, summary: str) -> None:
    existing = session.scalar(
        select(DataQualityIssue)
        .where(
            DataQualityIssue.rule_code == rule_code,
            DataQualityIssue.entity_type == entity_type,
            DataQualityIssue.entity_id == entity_id,
            DataQualityIssue.issue_status == "Open",
        )
        .limit(1)
    )
    now = datetime.utcnow()
    if existing:
        existing.severity = severity
        existing.issue_summary = summary
        existing.detected_at = now
    else:
        session.add(
            DataQualityIssue(
                rule_code=rule_code,
                entity_type=entity_type,
                entity_id=entity_id,
                severity=severity,
                issue_status="Open",
                detected_at=now,
                issue_summary=summary,
            )
        )


@retry_database_operation("run data quality checks")
def run_data_quality_checks() -> int:
    refresh_inventory_estimates()
    now = datetime.utcnow()

    with get_session() as session:
        feed_bins = session.scalars(select(FeedBin).where(FeedBin.active == True)).all()  # noqa: E712
        for feed_bin in feed_bins:
            latest = get_latest_reading(session, feed_bin.id)
            if latest is None:
                _upsert_open_issue(
                    session,
                    "MISSING_READING",
                    "FeedBin",
                    feed_bin.id,
                    "High",
                    f"No reading exists for bin {feed_bin.bin_code}.",
                )
                continue

            age_hours = (now - latest.reading_datetime).total_seconds() / 3600
            if age_hours > STALE_READING_HOURS:
                _upsert_open_issue(
                    session,
                    "STALE_READING",
                    "FeedBin",
                    feed_bin.id,
                    "Medium",
                    f"Latest reading is {age_hours:.1f} hours old; threshold is {STALE_READING_HOURS} hours.",
                )

            if latest.reading_tons > feed_bin.capacity_tons:
                _upsert_open_issue(
                    session,
                    "READING_OVER_CAPACITY",
                    "BinReading",
                    latest.id,
                    "High",
                    f"Reading of {latest.reading_tons:.1f} tons exceeds capacity of {feed_bin.capacity_tons:.1f} tons.",
                )

            if latest.reading_tons < 0:
                _upsert_open_issue(
                    session,
                    "NEGATIVE_READING",
                    "BinReading",
                    latest.id,
                    "Critical",
                    f"Reading of {latest.reading_tons:.1f} tons is negative.",
                )

        estimates = session.scalars(select(BinInventoryEstimate)).all()
        for estimate in estimates:
            if estimate.days_remaining is not None and estimate.days_remaining <= 1:
                _upsert_open_issue(
                    session,
                    "RUNOUT_RISK",
                    "FeedBin",
                    estimate.feed_bin_id,
                    "Critical" if estimate.days_remaining <= 0.5 else "High",
                    f"Bin projected to run out in {estimate.days_remaining:.1f} day(s).",
                )

        delivered_loads = session.scalars(select(Load).where(Load.status == "Delivered")).all()
        for load in delivered_loads:
            ticket = session.scalar(select(DeliveryTicket).where(DeliveryTicket.load_id == load.id).limit(1))
            if ticket is None:
                _upsert_open_issue(
                    session,
                    "DELIVERED_MISSING_TICKET",
                    "Load",
                    load.id,
                    "High",
                    f"Load {load.load_number} is delivered but has no delivery ticket.",
                )

        tickets = session.scalars(select(DeliveryTicket)).all()
        for ticket in tickets:
            load = session.get(Load, ticket.load_id)
            if not load:
                continue
            diff = abs((load.planned_tons or 0) - ticket.actual_tons)
            if diff > 1.0:
                _upsert_open_issue(
                    session,
                    "TONS_MISMATCH",
                    "DeliveryTicket",
                    ticket.id,
                    "Medium",
                    f"Ticket actual tons differ from planned tons by {diff:.1f} tons.",
                )
            if not ticket.reconciled and ticket.delivered_at < now - timedelta(hours=24):
                _upsert_open_issue(
                    session,
                    "UNRECONCILED_TICKET",
                    "DeliveryTicket",
                    ticket.id,
                    "Medium",
                    f"Ticket {ticket.ticket_number} has been unreconciled for more than 24 hours.",
                )

        session.commit()

        open_count = session.scalar(
            select(DataQualityIssue).where(DataQualityIssue.issue_status == "Open").count()
        ) if False else None

        open_issues = session.scalars(select(DataQualityIssue).where(DataQualityIssue.issue_status == "Open")).all()
        return len(open_issues)


@retry_database_operation("resolve data quality issue")
def resolve_issue(issue_id: int, resolution_notes: str | None = None) -> None:
    with get_session() as session:
        issue = session.get(DataQualityIssue, issue_id)
        if issue is None:
            raise ValueError(f"Data quality issue not found: {issue_id}")
        issue.issue_status = "Resolved"
        issue.resolution_notes = resolution_notes
        issue.resolved_at = datetime.utcnow()
        session.commit()


@retry_database_operation("ignore data quality issue")
def ignore_issue(issue_id: int, resolution_notes: str | None = None) -> None:
    with get_session() as session:
        issue = session.get(DataQualityIssue, issue_id)
        if issue is None:
            raise ValueError(f"Data quality issue not found: {issue_id}")
        issue.issue_status = "Ignored"
        issue.resolution_notes = resolution_notes
        issue.resolved_at = datetime.utcnow()
        session.commit()
