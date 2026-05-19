import streamlit as st

from src.app_cache import clear_data_cache, reset_on_page_entry
from src.auth import require_login
from src.database import ensure_database_ready
from src.queries import get_operations_hub_metrics
from src.ui_theme import apply_bachoco_theme

st.set_page_config(
    page_title="FeedFlow Operations Hub",
    page_icon="🌾",
    layout="wide",
)
apply_bachoco_theme()
require_login()

ensure_database_ready()
reset_on_page_entry("home", [])

st.title("FeedFlow")
st.caption("A practical operations workspace for feed inventory, forecasts, loads, and data quality.")

with st.sidebar:
    st.header("System")
    if st.button("Clear cached reads", use_container_width=True):
        clear_data_cache()
        st.success("Cached reads cleared.")

snapshot = None
snapshot_error = None
try:
    snapshot = get_operations_hub_metrics()
except Exception as exc:
    snapshot_error = exc

if snapshot_error:
    st.warning("The database is still waking up or unavailable. Use the retrying page actions once it is online.")
else:
    metric_cols = st.columns(5)
    metric_cols[0].metric("Active Farms", snapshot["active_farms"])
    metric_cols[1].metric("Active Bins", snapshot["active_bins"])
    metric_cols[2].metric("Critical / High", snapshot["critical_bins"])
    metric_cols[3].metric("Open Forecasts", snapshot["open_forecasts"])
    metric_cols[4].metric("Open Issues", snapshot["open_data_issues"])

    if snapshot["active_farms"] == 0 and snapshot["active_bins"] == 0:
        st.warning("No farm or bin master data found in the configured database.")

st.divider()

st.subheader("Go To")
nav_cols = st.columns(5)
with nav_cols[0]:
    st.page_link("pages/1_Operations_Hub.py", label="Operations Hub", icon="🌾")
    st.caption("Risk, forecasts, active loads, and issues.")
with nav_cols[1]:
    st.page_link("pages/2_Farm_Bin_Surveillance.py", label="Bin Surveillance", icon="📦")
    st.caption("Inventory board and bin readings.")
with nav_cols[2]:
    st.page_link("pages/3_Forecasted_Needs.py", label="Forecasted Needs", icon="🔮")
    st.caption("Open needs and forecast conversion.")
with nav_cols[3]:
    st.page_link("pages/4_Load_Planning.py", label="Load Planning", icon="🚚")
    st.caption("Loads, assignments, tickets.")
with nav_cols[4]:
    st.page_link("pages/5_Data_Quality.py", label="Data Quality", icon="🧹")
    st.caption("Exceptions and cleanup queue.")

st.divider()

left, middle, right = st.columns(3)

with left:
    st.subheader("Operating Rhythm")
    st.markdown(
        """
        1. Capture or refresh bin readings.
        2. Generate forecasted needs.
        3. Convert needs into planned loads.
        4. Track delivery and reconcile tickets.
        """
    )

with middle:
    st.subheader("Refresh Actions")
    if st.button("Refresh forecasts", use_container_width=True):
        from src.forecasting import generate_load_forecasts

        count = generate_load_forecasts()
        clear_data_cache()
        st.success(f"Forecasts refreshed: {count} open forecast(s) updated.")

    if st.button("Run data quality checks", use_container_width=True):
        from src.data_quality import run_data_quality_checks

        count = run_data_quality_checks()
        clear_data_cache()
        st.success(f"Data quality checks complete: {count} open issue(s).")

with right:
    st.subheader("Database Wake-Up")
    st.write("If Azure SQL is asleep, database actions retry automatically with backoff until it responds or the retry limit is reached.")
    st.caption("Tune retry behavior in `.env` with `DB_RETRY_ATTEMPTS`, `DB_RETRY_INITIAL_DELAY_SECONDS`, and `DB_RETRY_MAX_DELAY_SECONDS`.")
