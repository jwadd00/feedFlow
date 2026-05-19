from __future__ import annotations

import hashlib
import hmac
import os
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

load_dotenv()


def require_login() -> None:
    if not _auth_enabled():
        return

    if st.session_state.get("authenticated"):
        return

    st.title("FeedFlow")
    st.caption("Sign in to continue.")

    password = st.text_input("Password", type="password")
    submitted = st.button("Sign in", use_container_width=True)

    if submitted:
        if _password_matches(password):
            st.session_state.authenticated = True
            st.rerun()
        st.error("Invalid password.")

    st.stop()


def _auth_enabled() -> bool:
    value = _get_setting("APP_AUTH_ENABLED", "true")
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def _password_matches(candidate: str) -> bool:
    password_hash = _get_setting("APP_PASSWORD_HASH")
    if password_hash:
        candidate_hash = hashlib.sha256(candidate.encode("utf-8")).hexdigest()
        return hmac.compare_digest(candidate_hash, str(password_hash).strip())

    password = _get_setting("APP_PASSWORD")
    if password:
        return hmac.compare_digest(candidate, str(password))

    st.error("App password is not configured. Set APP_PASSWORD or APP_PASSWORD_HASH in Streamlit secrets.")
    return False


def _get_setting(name: str, default: str | None = None) -> str | bool | int | float | None:
    value = os.getenv(name)
    if value is not None:
        return value

    try:
        if name in st.secrets:
            return st.secrets[name]
        if "auth" in st.secrets and name in st.secrets["auth"]:
            return st.secrets["auth"][name]
    except Exception:
        pass

    value = _get_local_secret(name)
    if value is not None:
        return value

    return default


def _get_local_secret(name: str) -> str | None:
    secrets_path = Path(__file__).resolve().parents[1] / ".streamlit" / "secrets.toml"
    if not secrets_path.exists():
        return None

    prefix = f"{name} "
    for line in secrets_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped.startswith(prefix) or "=" not in stripped:
            continue
        _key, raw_value = stripped.split("=", 1)
        value = raw_value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            return value[1:-1]
        return value

    return None
