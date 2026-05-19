from __future__ import annotations

import streamlit as st


def clear_data_cache() -> None:
    st.cache_data.clear()


def reset_on_page_entry(page_id: str, keys: list[str]) -> None:
    if st.session_state.get("_active_page_id") == page_id:
        return

    st.session_state["_active_page_id"] = page_id
    for key in keys:
        st.session_state[key] = False
