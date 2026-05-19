from datetime import datetime

import streamlit as st

from src.app_cache import clear_data_cache, reset_on_page_entry
from src.auth import require_login
from src.database import ensure_database_ready
from src.loads import VALID_LOAD_STATUSES, add_delivery_ticket, create_manual_load, update_load_assignment, update_load_status
from src.queries import get_bin_options, get_delivery_tickets, get_loads
from src.ui_theme import apply_bachoco_theme

st.set_page_config(page_title="Load Planning", page_icon="Truck", layout="wide")
apply_bachoco_theme()
require_login()
ensure_database_ready()
reset_on_page_entry(
    "load_planning",
    [
        "loads_show_manual",
        "loads_show_status",
        "loads_show_assignment",
        "loads_show_ticket",
        "loads_show_tickets",
    ],
)

st.title("Load Planning & Tracking")
st.caption("Create, schedule, update, deliver, and reconcile feed loads.")

for key in [
    "loads_show_recent",
    "loads_show_manual",
    "loads_show_status",
    "loads_show_assignment",
    "loads_show_ticket",
    "loads_show_tickets",
]:
    if key not in st.session_state:
        st.session_state[key] = key == "loads_show_recent"

top_cols = st.columns(3)
with top_cols[0]:
    if st.button("Load recent loads", use_container_width=True):
        st.session_state.loads_show_recent = True
with top_cols[1]:
    if st.button("Create manual load", use_container_width=True):
        st.session_state.loads_show_manual = True
with top_cols[2]:
    if st.button("Capture ticket", use_container_width=True):
        st.session_state.loads_show_ticket = True

more_cols = st.columns(3)
with more_cols[0]:
    if st.button("Update status", use_container_width=True):
        st.session_state.loads_show_status = True
with more_cols[1]:
    if st.button("Update assignment", use_container_width=True):
        st.session_state.loads_show_assignment = True
with more_cols[2]:
    if st.button("Load tickets", use_container_width=True):
        st.session_state.loads_show_tickets = True

st.divider()

if st.session_state.loads_show_recent:
    st.subheader("Active / Recent Loads")
    loads = get_loads(limit=100)
    if loads.empty:
        st.info("No loads available.")
    else:
        st.dataframe(loads, hide_index=True, use_container_width=True)
else:
    st.info("Load tables and transaction forms are opened on demand to keep page navigation fast.")

if st.session_state.loads_show_manual:
    st.divider()
    st.subheader("Create Manual Load")
    bin_options = get_bin_options()
    with st.form("manual_load_form"):
        if bin_options.empty:
            st.warning("No bins are available.")
            submit_manual = st.form_submit_button("Create Load", disabled=True)
        else:
            bin_label = st.selectbox("Feed Bin", bin_options["bin_label"].tolist(), key="manual_load_bin")
            feed_bin_id = int(bin_options.loc[bin_options["bin_label"] == bin_label, "feed_bin_id"].iloc[0])
            planned_tons = st.number_input("Planned Tons", min_value=0.0, max_value=50.0, value=18.0, step=0.1)
            priority = st.selectbox("Priority", ["Critical", "High", "Medium", "Low"])
            schedule_date = st.date_input("Scheduled Delivery Date", value=datetime.utcnow().date(), key="manual_schedule_date")
            schedule_time = st.time_input("Scheduled Delivery Time", value=datetime.utcnow().time().replace(microsecond=0), key="manual_schedule_time")
            truck = st.text_input("Truck")
            driver = st.text_input("Driver")
            notes = st.text_area("Notes")
            submit_manual = st.form_submit_button("Create Load")
        if submit_manual:
            scheduled_dt = datetime.combine(schedule_date, schedule_time)
            load_id = create_manual_load(feed_bin_id, planned_tons, priority, scheduled_dt, truck=truck, driver=driver, created_by="streamlit", notes=notes)
            clear_data_cache()
            st.session_state.loads_show_manual = False
            st.session_state.loads_show_recent = True
            st.success(f"Manual load created: {load_id}")
            st.rerun()

if st.session_state.loads_show_status:
    st.divider()
    st.subheader("Update Load Status")
    loads_for_update = get_loads(limit=200)
    with st.form("update_status_form"):
        if loads_for_update.empty:
            st.warning("No loads available.")
            update_submit = st.form_submit_button("Update Status", disabled=True)
        else:
            load_options = {
                f"{row.load_id} | {row.load_number} | {row.farm} | {row.status}": int(row.load_id)
                for row in loads_for_update.itertuples(index=False)
            }
            selected_load_label = st.selectbox("Load", list(load_options.keys()), key="status_load")
            load_id = load_options[selected_load_label]
            new_status = st.selectbox("New Status", VALID_LOAD_STATUSES)
            status_notes = st.text_area("Status Notes")
            update_submit = st.form_submit_button("Update Status")
        if update_submit:
            update_load_status(load_id, new_status, changed_by="streamlit", notes=status_notes)
            clear_data_cache()
            st.session_state.loads_show_status = False
            st.session_state.loads_show_recent = True
            st.success("Load status updated.")
            st.rerun()

if st.session_state.loads_show_assignment:
    st.divider()
    st.subheader("Update Assignment")
    loads_for_assignment = get_loads(limit=200)
    with st.form("assignment_form"):
        if loads_for_assignment.empty:
            st.warning("No loads available.")
            assignment_submit = st.form_submit_button("Save Assignment", disabled=True)
        else:
            assignment_options = {
                f"{row.load_id} | {row.load_number} | {row.farm} | {row.status}": int(row.load_id)
                for row in loads_for_assignment.itertuples(index=False)
            }
            selected = st.selectbox("Load", list(assignment_options.keys()), key="assignment_load")
            assignment_load_id = assignment_options[selected]
            truck = st.text_input("Truck", key="assignment_truck")
            driver = st.text_input("Driver", key="assignment_driver")
            schedule_date = st.date_input("Scheduled Date", value=datetime.utcnow().date(), key="assignment_date")
            schedule_time = st.time_input("Scheduled Time", value=datetime.utcnow().time().replace(microsecond=0), key="assignment_time")
            assignment_submit = st.form_submit_button("Save Assignment")
        if assignment_submit:
            scheduled_dt = datetime.combine(schedule_date, schedule_time)
            update_load_assignment(assignment_load_id, truck=truck, driver=driver, scheduled_delivery_datetime=scheduled_dt)
            clear_data_cache()
            st.session_state.loads_show_assignment = False
            st.session_state.loads_show_recent = True
            st.success("Assignment updated.")
            st.rerun()

if st.session_state.loads_show_ticket:
    st.divider()
    st.subheader("Capture Delivery Ticket")
    loads_for_ticket = get_loads(statuses=("Loaded", "In Transit", "Delivered", "Scheduled", "Released to Mill"), limit=200)
    with st.form("ticket_form"):
        if loads_for_ticket.empty:
            st.warning("No eligible loads available.")
            ticket_submit = st.form_submit_button("Save Ticket", disabled=True)
        else:
            ticket_options = {
                f"{row.load_id} | {row.load_number} | {row.farm} | {row.status}": int(row.load_id)
                for row in loads_for_ticket.itertuples(index=False)
            }
            selected_ticket_load = st.selectbox("Load", list(ticket_options.keys()), key="ticket_load")
            ticket_load_id = ticket_options[selected_ticket_load]
            ticket_number = st.text_input("Ticket Number")
            actual_tons = st.number_input("Actual Tons", min_value=0.0, max_value=50.0, value=18.0, step=0.1)
            delivered_date = st.date_input("Delivered Date", value=datetime.utcnow().date())
            delivered_time = st.time_input("Delivered Time", value=datetime.utcnow().time().replace(microsecond=0))
            reconciled = st.checkbox("Mark as reconciled")
            ticket_submit = st.form_submit_button("Save Ticket")
        if ticket_submit:
            delivered_dt = datetime.combine(delivered_date, delivered_time)
            add_delivery_ticket(ticket_load_id, ticket_number, actual_tons, delivered_at=delivered_dt, reconciled=reconciled)
            clear_data_cache()
            st.session_state.loads_show_ticket = False
            st.session_state.loads_show_recent = True
            st.session_state.loads_show_tickets = True
            st.success("Delivery ticket captured.")
            st.rerun()

if st.session_state.loads_show_tickets:
    st.divider()
    st.subheader("Delivery Tickets")
    tickets = get_delivery_tickets(limit=100)
    if tickets.empty:
        st.info("No delivery tickets available.")
    else:
        st.dataframe(tickets, hide_index=True, use_container_width=True)
