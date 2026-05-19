from datetime import datetime

import streamlit as st

from src.app_cache import clear_data_cache, reset_on_page_entry
from src.auth import require_login
from src.database import ensure_database_ready
from src.inventory import add_bin_reading, refresh_inventory_estimates
from src.queries import get_bin_options, get_bin_surveillance
from src.ui_theme import apply_bachoco_theme

st.set_page_config(page_title="Farm Bin Surveillance", page_icon="📦", layout="wide")
apply_bachoco_theme()
require_login()
ensure_database_ready()
reset_on_page_entry("farm_bin_surveillance", ["show_bin_reading_form"])

st.title("Farm Bin Surveillance")
st.caption("Review current inventory estimates, projected empty dates, risk levels, and confidence scores.")

if "show_bin_reading_form" not in st.session_state:
    st.session_state.show_bin_reading_form = False
if "show_inventory_board" not in st.session_state:
    st.session_state.show_inventory_board = True

action_cols = st.columns(3)
with action_cols[0]:
    if st.button("Add bin reading", use_container_width=True):
        st.session_state.show_bin_reading_form = True
with action_cols[1]:
    if st.button("Load inventory board", use_container_width=True):
        st.session_state.show_inventory_board = True
with action_cols[2]:
    refresh_clicked = st.button("Refresh estimates", use_container_width=True)

if refresh_clicked:
    count = refresh_inventory_estimates()
    clear_data_cache()
    st.session_state.show_inventory_board = True
    st.success(f"Inventory estimates refreshed for {count} active bin(s).")

if st.session_state.show_bin_reading_form:
    st.subheader("Add Bin Reading")
    options = get_bin_options()

    with st.form("add_bin_reading_form", clear_on_submit=True):
        if options.empty:
            st.warning("No bins are available.")
            submitted = st.form_submit_button("Save Reading", disabled=True)
        else:
            bin_label = st.selectbox("Feed Bin", options["bin_label"].tolist())
            selected_bin_id = int(options.loc[options["bin_label"] == bin_label, "feed_bin_id"].iloc[0])
            reading_tons = st.number_input("Reading Tons", min_value=0.0, max_value=100.0, value=5.0, step=0.1)
            source = st.selectbox("Source", ["Sensor", "Grower", "Driver", "Manual", "Estimate"])
            reading_date = st.date_input("Reading Date", value=datetime.utcnow().date())
            reading_time = st.time_input("Reading Time", value=datetime.utcnow().time().replace(microsecond=0))
            notes = st.text_area("Notes", placeholder="Optional notes about this reading")
            submitted = st.form_submit_button("Save Reading")

        if submitted:
            reading_dt = datetime.combine(reading_date, reading_time)
            add_bin_reading(selected_bin_id, reading_tons, source, reading_dt, notes=notes, created_by="streamlit")
            clear_data_cache()
            st.session_state.show_bin_reading_form = False
            st.session_state.show_inventory_board = True
            st.success("Reading saved and inventory estimates refreshed.")
            st.rerun()

st.divider()

st.subheader("Inventory Board")
if not st.session_state.show_inventory_board:
    st.info("Inventory data is cached and loaded on demand to keep page navigation fast.")
else:
    df = get_bin_surveillance()
    if df.empty:
        st.info("No bin surveillance data available.")
    else:
        region_filter = st.multiselect("Filter Region", sorted(df["region"].dropna().unique().tolist()))
        risk_filter = st.multiselect("Filter Risk", ["Critical", "High", "Watch", "Normal", "Unknown"])

        filtered = df.copy()
        if region_filter:
            filtered = filtered[filtered["region"].isin(region_filter)]
        if risk_filter:
            filtered = filtered[filtered["risk_level"].isin(risk_filter)]

        st.dataframe(filtered, hide_index=True, use_container_width=True)
