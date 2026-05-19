from __future__ import annotations

from datetime import datetime

RISK_ORDER = {"Critical": 0, "High": 1, "Watch": 2, "Normal": 3, "Unknown": 4}


def format_tons(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:,.1f} tons"


def format_percent(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:,.0f}%"


def format_datetime(value: datetime | str | None) -> str:
    if value is None:
        return "—"
    if isinstance(value, str):
        return value
    return value.strftime("%Y-%m-%d %I:%M %p")


def classify_risk(days_remaining: float | None, current_tons: float | None, min_safe_tons: float | None) -> str:
    if days_remaining is None or current_tons is None:
        return "Unknown"
    if current_tons <= 0 or days_remaining <= 0.5:
        return "Critical"
    if current_tons <= (min_safe_tons or 0) or days_remaining <= 1.5:
        return "High"
    if days_remaining <= 3:
        return "Watch"
    return "Normal"


def forecast_priority(days_remaining: float | None) -> str:
    if days_remaining is None:
        return "Medium"
    if days_remaining <= 1:
        return "Critical"
    if days_remaining <= 2:
        return "High"
    if days_remaining <= 4:
        return "Medium"
    return "Low"


def sort_risk_key(risk_level: str) -> int:
    return RISK_ORDER.get(risk_level, 99)
