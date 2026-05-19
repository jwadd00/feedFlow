import streamlit as st
from src.app_cache import clear_data_cache, reset_on_page_entry
from src.auth import require_login
from src.database import ensure_database_ready
from src.queries import get_bin_risk_distribution, get_operations_hub_metrics, get_loads, get_open_data_quality_issues
from src.ui_theme import apply_bachoco_theme

st.set_page_config(page_title="Operations Hub", page_icon="🌾", layout="wide")
apply_bachoco_theme()
require_login()
ensure_database_ready()
reset_on_page_entry("operations_hub", [])

st.title("Operations Hub")
st.caption("A single operational view of bin risk, open forecasts, active loads, and data quality issues.")

if "operations_hub_show_dashboard" not in st.session_state:
    st.session_state.operations_hub_show_dashboard = True

col_a, col_b, col_c = st.columns([1, 1, 1])
with col_a:
    if st.button("Load dashboard", use_container_width=True):
        st.session_state.operations_hub_show_dashboard = True
with col_b:
    if st.button("Refresh forecasts", use_container_width=True):
        from src.forecasting import generate_load_forecasts

        count = generate_load_forecasts()
        clear_data_cache()
        st.session_state.operations_hub_show_dashboard = True
        st.success(f"Forecasts refreshed: {count} open forecast(s) updated.")
with col_c:
    if st.button("Run data quality checks", use_container_width=True):
        from src.data_quality import run_data_quality_checks

        count = run_data_quality_checks()
        clear_data_cache()
        st.session_state.operations_hub_show_dashboard = True
        st.success(f"Data quality checks complete: {count} open issue(s).")

if not st.session_state.operations_hub_show_dashboard:
    st.info("Dashboard data is loaded on demand to keep page navigation fast.")
else:
    metrics = get_operations_hub_metrics()
    cols = st.columns(5)
    cols[0].metric("Active Farms", metrics["active_farms"])
    cols[1].metric("Active Bins", metrics["active_bins"])
    cols[2].metric("Critical / High Bins", metrics["critical_bins"])
    cols[3].metric("Open Forecasts", metrics["open_forecasts"])
    cols[4].metric("Open Data Issues", metrics["open_data_issues"])

    if metrics["active_farms"] == 0 and metrics["active_bins"] == 0:
        st.warning("No farm or bin master data found in the configured database. Import production data or run `python -m jobs.seed_sample_data` for demo data.")

    st.divider()

    risk_counts = get_bin_risk_distribution()
    left, right = st.columns([1.1, 1])

    with left:
        st.subheader("Bin Risk Distribution")
        if risk_counts.empty:
            st.info("No bin data available.")
        else:
            import plotly.express as px

            fig = px.bar(risk_counts, x="risk_level", y="count", text="count")
            fig.update_layout(xaxis_title="Risk Level", yaxis_title="Bins")
            st.plotly_chart(fig, use_container_width=True)

    with right:
        st.subheader("Open Data Quality Issues")
        issues = get_open_data_quality_issues(limit=10)
        if issues.empty:
            st.success("No open issues.")
        else:
            st.dataframe(issues, hide_index=True, use_container_width=True)

    st.subheader("Active Loads")
    loads = get_loads(statuses=("Planned", "Scheduled", "Released to Mill", "Loaded", "In Transit"), limit=25)
    if loads.empty:
        st.info("No active loads.")
    else:
        st.dataframe(loads, hide_index=True, use_container_width=True)
