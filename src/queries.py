from __future__ import annotations

import os

import pandas as pd
import streamlit as st

from src.database import get_engine, read_sql


READ_CACHE_TTL_SECONDS = int(os.getenv("READ_CACHE_TTL_SECONDS", "300"))
READ_CACHE_PERSIST = os.getenv("READ_CACHE_PERSIST", "true").strip().lower() in {"1", "true", "yes", "y"}
READ_CACHE_PERSIST_MODE = "disk" if READ_CACHE_PERSIST else None


def _is_mssql() -> bool:
    return get_engine().dialect.name == "mssql"


def _bin_label_expression() -> str:
    if _is_mssql():
        return "CONCAT(f.farm_code, N' - ', f.farm_name, N' / ', fh.house_code, N' / ', fb.bin_code)"
    return "f.farm_code || ' - ' || f.farm_name || ' / ' || fh.house_code || ' / ' || fb.bin_code"


def _select_clause(limit: int | None = None) -> str:
    if limit is not None and _is_mssql():
        return f"SELECT TOP ({int(limit)})"
    return "SELECT"


def _limit_clause(limit: int | None = None) -> str:
    if limit is not None and not _is_mssql():
        return f"LIMIT {int(limit)}"
    return ""


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_operations_hub_metrics() -> dict:
    row = read_sql(
        """
        SELECT
            (SELECT COUNT(*) FROM farms WHERE active = 1) AS active_farms,
            (SELECT COUNT(*) FROM feed_bins WHERE active = 1) AS active_bins,
            (SELECT COUNT(*) FROM bin_inventory_estimates WHERE risk_level IN ('Critical','High')) AS critical_bins,
            (SELECT COUNT(*) FROM load_forecasts WHERE status = 'Open') AS open_forecasts,
            (SELECT COUNT(*) FROM data_quality_issues WHERE issue_status = 'Open') AS open_data_issues
        """
    ).iloc[0]
    return {key: int(row[key]) for key in row.index}


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_bin_options() -> pd.DataFrame:
    return read_sql(
        f"""
        SELECT
            fb.id AS feed_bin_id,
            {_bin_label_expression()} AS bin_label,
            f.farm_name,
            fh.house_code,
            fb.bin_code,
            ft.feed_name,
            fb.capacity_tons
        FROM feed_bins fb
        JOIN farm_houses fh ON fh.id = fb.farm_house_id
        JOIN farms f ON f.id = fh.farm_id
        JOIN feed_types ft ON ft.id = fb.feed_type_id
        WHERE fb.active = 1
        ORDER BY f.farm_code, fh.house_code, fb.bin_code
        """
    )


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_bin_surveillance() -> pd.DataFrame:
    return read_sql(
        """
        SELECT
            f.farm_code AS farm_code,
            f.farm_name AS farm,
            f.region AS region,
            f.route AS route,
            fh.house_code AS house,
            fb.id AS feed_bin_id,
            fb.bin_code AS bin,
            ft.feed_name AS feed_type,
            ROUND(fb.capacity_tons, 1) AS capacity_tons,
            ROUND(e.current_estimated_tons, 1) AS current_estimated_tons,
            ROUND(e.percent_full, 0) AS percent_full,
            ROUND(e.daily_consumption_tons, 1) AS daily_consumption_tons,
            ROUND(e.days_remaining, 1) AS days_remaining,
            e.projected_empty_datetime AS projected_empty_datetime,
            e.risk_level AS risk_level,
            ROUND(e.confidence_score, 0) AS confidence_score,
            br.reading_datetime AS last_reading_datetime,
            br.source AS last_reading_source,
            ROUND(br.reading_tons, 1) AS last_reading_tons
        FROM feed_bins fb
        JOIN farm_houses fh ON fh.id = fb.farm_house_id
        JOIN farms f ON f.id = fh.farm_id
        JOIN feed_types ft ON ft.id = fb.feed_type_id
        LEFT JOIN bin_inventory_estimates e ON e.feed_bin_id = fb.id
        LEFT JOIN bin_readings br ON br.id = e.last_reading_id
        WHERE fb.active = 1
        ORDER BY
            CASE e.risk_level
                WHEN 'Critical' THEN 1
                WHEN 'High' THEN 2
                WHEN 'Watch' THEN 3
                WHEN 'Normal' THEN 4
                ELSE 5
            END,
            e.days_remaining ASC
        """
    )


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_critical_bins(limit: int = 20) -> pd.DataFrame:
    return read_sql(
        f"""
        {_select_clause(limit)}
            f.farm_code AS farm_code,
            f.farm_name AS farm,
            f.region AS region,
            f.route AS route,
            fh.house_code AS house,
            fb.id AS feed_bin_id,
            fb.bin_code AS bin,
            ft.feed_name AS feed_type,
            ROUND(fb.capacity_tons, 1) AS capacity_tons,
            ROUND(e.current_estimated_tons, 1) AS current_estimated_tons,
            ROUND(e.percent_full, 0) AS percent_full,
            ROUND(e.daily_consumption_tons, 1) AS daily_consumption_tons,
            ROUND(e.days_remaining, 1) AS days_remaining,
            e.projected_empty_datetime AS projected_empty_datetime,
            e.risk_level AS risk_level,
            ROUND(e.confidence_score, 0) AS confidence_score
        FROM feed_bins fb
        JOIN farm_houses fh ON fh.id = fb.farm_house_id
        JOIN farms f ON f.id = fh.farm_id
        JOIN feed_types ft ON ft.id = fb.feed_type_id
        LEFT JOIN bin_inventory_estimates e ON e.feed_bin_id = fb.id
        WHERE fb.active = 1
          AND e.risk_level IN ('Critical', 'High', 'Watch')
        ORDER BY
            CASE e.risk_level
                WHEN 'Critical' THEN 1
                WHEN 'High' THEN 2
                WHEN 'Watch' THEN 3
                ELSE 4
            END,
            e.days_remaining ASC
        {_limit_clause(limit)}
        """
    )


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_bin_risk_distribution() -> pd.DataFrame:
    return read_sql(
        """
        SELECT
            COALESCE(e.risk_level, 'Unknown') AS risk_level,
            COUNT(*) AS count
        FROM feed_bins fb
        LEFT JOIN bin_inventory_estimates e ON e.feed_bin_id = fb.id
        WHERE fb.active = 1
        GROUP BY COALESCE(e.risk_level, 'Unknown')
        ORDER BY
            CASE COALESCE(e.risk_level, 'Unknown')
                WHEN 'Critical' THEN 1
                WHEN 'High' THEN 2
                WHEN 'Watch' THEN 3
                WHEN 'Normal' THEN 4
                ELSE 5
            END
        """
    )


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_open_forecasts(limit: int = 100) -> pd.DataFrame:
    return read_sql(
        f"""
        {_select_clause(limit)}
            lf.id AS forecast_id,
            f.farm_code AS farm_code,
            f.farm_name AS farm,
            fh.house_code AS house,
            fb.bin_code AS bin,
            ft.feed_name AS feed_type,
            ROUND(lf.current_estimated_tons, 1) AS current_estimated_tons,
            ROUND(lf.days_remaining, 1) AS days_remaining,
            lf.recommended_delivery_datetime AS recommended_delivery_datetime,
            ROUND(lf.recommended_tons, 1) AS recommended_tons,
            lf.priority AS priority,
            ROUND(lf.confidence_score, 0) AS confidence_score,
            lf.reason AS reason,
            lf.status AS status,
            lf.generated_at AS generated_at
        FROM load_forecasts lf
        JOIN feed_bins fb ON fb.id = lf.feed_bin_id
        JOIN farm_houses fh ON fh.id = fb.farm_house_id
        JOIN farms f ON f.id = fh.farm_id
        JOIN feed_types ft ON ft.id = fb.feed_type_id
        WHERE lf.status = 'Open'
        ORDER BY
            CASE lf.priority
                WHEN 'Critical' THEN 1
                WHEN 'High' THEN 2
                WHEN 'Medium' THEN 3
                ELSE 4
            END,
            lf.days_remaining ASC
        {_limit_clause(limit)}
        """
    )


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_all_forecasts(limit: int = 100) -> pd.DataFrame:
    return read_sql(
        f"""
        {_select_clause(limit)}
            lf.id AS forecast_id,
            f.farm_code AS farm_code,
            f.farm_name AS farm,
            fh.house_code AS house,
            fb.bin_code AS bin,
            ft.feed_name AS feed_type,
            ROUND(lf.current_estimated_tons, 1) AS current_estimated_tons,
            ROUND(lf.days_remaining, 1) AS days_remaining,
            lf.recommended_delivery_datetime AS recommended_delivery_datetime,
            ROUND(lf.recommended_tons, 1) AS recommended_tons,
            lf.priority AS priority,
            ROUND(lf.confidence_score, 0) AS confidence_score,
            lf.status AS status,
            lf.reason AS reason,
            lf.generated_at AS generated_at
        FROM load_forecasts lf
        JOIN feed_bins fb ON fb.id = lf.feed_bin_id
        JOIN farm_houses fh ON fh.id = fb.farm_house_id
        JOIN farms f ON f.id = fh.farm_id
        JOIN feed_types ft ON ft.id = fb.feed_type_id
        ORDER BY lf.generated_at DESC
        {_limit_clause(limit)}
        """
    )


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_loads(statuses: list[str] | tuple[str, ...] | None = None, limit: int = 100) -> pd.DataFrame:
    where = ""
    if statuses:
        quoted = ",".join([f"'{s}'" for s in statuses])
        where = f"WHERE l.status IN ({quoted})"
    return read_sql(
        f"""
        {_select_clause(limit)}
            l.id AS load_id,
            l.load_number,
            f.farm_code AS farm_code,
            f.farm_name AS farm,
            fh.house_code AS house,
            fb.bin_code AS bin,
            ft.feed_name AS feed_type,
            ROUND(l.planned_tons, 1) AS planned_tons,
            l.priority,
            l.status,
            l.scheduled_delivery_datetime,
            l.truck,
            l.driver,
            l.route,
            l.created_at
        FROM loads l
        JOIN farms f ON f.id = l.farm_id
        JOIN feed_bins fb ON fb.id = l.feed_bin_id
        JOIN farm_houses fh ON fh.id = fb.farm_house_id
        JOIN feed_types ft ON ft.id = l.feed_type_id
        {where}
        ORDER BY l.scheduled_delivery_datetime ASC, l.created_at DESC
        {_limit_clause(limit)}
        """
    )


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_open_data_quality_issues(limit: int = 100) -> pd.DataFrame:
    return read_sql(
        f"""
        {_select_clause(limit)}
            id AS issue_id,
            severity,
            rule_code,
            entity_type,
            entity_id,
            issue_summary,
            detected_at,
            assigned_to,
            issue_status
        FROM data_quality_issues
        WHERE issue_status = 'Open'
        ORDER BY
            CASE severity
                WHEN 'Critical' THEN 1
                WHEN 'High' THEN 2
                WHEN 'Medium' THEN 3
                ELSE 4
            END,
            detected_at DESC
        {_limit_clause(limit)}
        """
    )


@st.cache_data(ttl=READ_CACHE_TTL_SECONDS, persist=READ_CACHE_PERSIST_MODE, show_spinner=False)
def get_delivery_tickets(limit: int = 100) -> pd.DataFrame:
    return read_sql(
        f"""
        {_select_clause(limit)}
            dt.id AS ticket_id,
            l.load_number,
            dt.ticket_number,
            f.farm_name AS farm,
            ROUND(l.planned_tons, 1) AS planned_tons,
            ROUND(dt.actual_tons, 1) AS actual_tons,
            ROUND(dt.actual_tons - l.planned_tons, 1) AS tons_variance,
            dt.delivered_at,
            dt.reconciled,
            dt.reconciliation_notes
        FROM delivery_tickets dt
        JOIN loads l ON l.id = dt.load_id
        JOIN farms f ON f.id = l.farm_id
        ORDER BY dt.delivered_at DESC
        {_limit_clause(limit)}
        """
    )
