import streamlit as st

from src.app_cache import clear_data_cache, reset_on_page_entry
from src.auth import require_login
from src.database import ensure_database_ready
from src.queries import get_open_data_quality_issues
from src.ui_theme import apply_bachoco_theme

st.set_page_config(page_title="Data Quality", page_icon="🧹", layout="wide")
apply_bachoco_theme()
require_login()
ensure_database_ready()
reset_on_page_entry("data_quality", [])

st.title("Data Quality Work Queue")
st.caption("Find and resolve stale readings, impossible inventory values, tons mismatches, and missing reconciliation records.")

if "dq_show_issues" not in st.session_state:
    st.session_state.dq_show_issues = True

action_cols = st.columns(2)
with action_cols[0]:
    if st.button("Load open issues", use_container_width=True):
        st.session_state.dq_show_issues = True
with action_cols[1]:
    run_clicked = st.button("Run Data Quality Checks", use_container_width=True)

if run_clicked:
    from src.data_quality import run_data_quality_checks

    count = run_data_quality_checks()
    clear_data_cache()
    st.session_state.dq_show_issues = True
    st.success(f"Checks complete: {count} open issue(s).")

st.subheader("Open Issues")
if not st.session_state.dq_show_issues:
    st.info("Issues are loaded on demand to keep page navigation fast.")
else:
    issues = get_open_data_quality_issues(limit=250)
    if issues.empty:
        st.success("No open data quality issues.")
    else:
        st.dataframe(issues, hide_index=True, use_container_width=True)

        st.divider()
        st.subheader("Resolve or Ignore Issue")
        issue_options = {
            f"{row.issue_id} | {row.severity} | {row.rule_code} | {str(row.issue_summary)[:80]}": int(row.issue_id)
            for row in issues.itertuples(index=False)
        }

        with st.form("resolve_issue_form"):
            selected_label = st.selectbox("Issue", list(issue_options.keys()))
            issue_id = issue_options[selected_label]
            action = st.radio("Action", ["Resolve", "Ignore"], horizontal=True)
            notes = st.text_area("Resolution Notes")
            submit = st.form_submit_button("Submit")

            if submit:
                from src.data_quality import ignore_issue, resolve_issue

                if action == "Resolve":
                    resolve_issue(issue_id, notes)
                    clear_data_cache()
                    st.success("Issue resolved.")
                else:
                    ignore_issue(issue_id, notes)
                    clear_data_cache()
                    st.success("Issue ignored.")
                st.rerun()

st.divider()
st.markdown(
    """
    ### Current Rule Checks

    - Missing bin reading
    - Stale bin reading
    - Reading above bin capacity
    - Negative reading
    - Runout risk within 1 day
    - Delivered load missing ticket
    - Planned vs actual tons mismatch
    - Unreconciled ticket older than 24 hours
    """
)
