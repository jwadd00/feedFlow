from datetime import datetime

import streamlit as st

from src.app_cache import clear_data_cache, reset_on_page_entry
from src.auth import require_login
from src.database import ensure_database_ready
from src.queries import get_all_forecasts, get_open_forecasts
from src.ui_theme import apply_bachoco_theme

st.set_page_config(page_title="Forecasted Needs", page_icon="🔮", layout="wide")
apply_bachoco_theme()
require_login()
ensure_database_ready()
reset_on_page_entry("forecasted_needs", ["forecast_show_history"])

st.title("Forecasted Needs")
st.caption("Prioritized queue of bins that likely need feed within the forecast window.")

if "forecast_show_open" not in st.session_state:
    st.session_state.forecast_show_open = True
if "forecast_show_history" not in st.session_state:
    st.session_state.forecast_show_history = False

action_cols = st.columns(3)
with action_cols[0]:
    if st.button("Load open forecasts", use_container_width=True):
        st.session_state.forecast_show_open = True
with action_cols[1]:
    if st.button("Load history", use_container_width=True):
        st.session_state.forecast_show_history = True
with action_cols[2]:
    refresh_clicked = st.button("Generate / Refresh", use_container_width=True)

if refresh_clicked:
    from src.forecasting import generate_load_forecasts

    count = generate_load_forecasts()
    clear_data_cache()
    st.session_state.forecast_show_open = True
    st.success(f"Forecasts refreshed: {count} open forecast(s) updated.")

st.subheader("Open Forecast Queue")
if not st.session_state.forecast_show_open:
    st.info("Open forecasts are loaded on demand to keep page navigation fast.")
else:
    open_forecasts = get_open_forecasts(limit=100)
    if open_forecasts.empty:
        st.success("No open forecasted needs right now.")
    else:
        st.dataframe(open_forecasts, hide_index=True, use_container_width=True)

        st.divider()
        st.subheader("Convert Forecast to Planned Load")
        forecast_options = {
            f"{row.forecast_id} | {row.farm} | {row.house}/{row.bin} | {row.priority} | {row.recommended_tons} tons": int(row.forecast_id)
            for row in open_forecasts.itertuples(index=False)
        }

        with st.form("convert_forecast_form"):
            selected_label = st.selectbox("Forecast", list(forecast_options.keys()))
            selected_forecast_id = forecast_options[selected_label]
            selected_row = open_forecasts[open_forecasts["forecast_id"] == selected_forecast_id].iloc[0]
            planned_tons = st.number_input("Planned Tons", min_value=0.0, max_value=50.0, value=float(selected_row["recommended_tons"]), step=0.1)
            schedule_date = st.date_input("Scheduled Delivery Date", value=datetime.utcnow().date())
            schedule_time = st.time_input("Scheduled Delivery Time", value=datetime.utcnow().time().replace(microsecond=0))
            notes = st.text_area("Notes", value="Created from forecast queue.")
            convert = st.form_submit_button("Create Planned Load")

            if convert:
                from src.loads import create_load_from_forecast

                scheduled_dt = datetime.combine(schedule_date, schedule_time)
                load_id = create_load_from_forecast(
                    selected_forecast_id,
                    planned_tons=planned_tons,
                    scheduled_delivery_datetime=scheduled_dt,
                    created_by="streamlit",
                    notes=notes,
                )
                clear_data_cache()
                st.session_state.forecast_show_history = True
                st.success(f"Created planned load ID {load_id}.")
                st.rerun()

        with st.expander("Defer a Forecast"):
            with st.form("defer_forecast_form"):
                defer_label = st.selectbox("Forecast to Defer", list(forecast_options.keys()), key="defer_forecast")
                defer_id = forecast_options[defer_label]
                defer_note = st.text_area("Deferral Note", placeholder="Why is this forecast being deferred?")
                defer_btn = st.form_submit_button("Defer Forecast")
                if defer_btn:
                    from src.forecasting import defer_forecast

                    defer_forecast(defer_id, defer_note)
                    clear_data_cache()
                    st.session_state.forecast_show_history = True
                    st.success("Forecast deferred.")
                    st.rerun()

st.divider()
st.subheader("Recent Forecast History")
if not st.session_state.forecast_show_history:
    st.info("History is loaded on demand.")
else:
    history = get_all_forecasts(limit=100)
    if history.empty:
        st.info("No forecast history available.")
    else:
        st.dataframe(history, hide_index=True, use_container_width=True)
