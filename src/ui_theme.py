from __future__ import annotations

import streamlit as st


def apply_bachoco_theme() -> None:
    st.markdown(
        """
        <style>
        :root {
            --bachoco-orange: #f37021;
            --bachoco-orange-dark: #c85212;
            --bachoco-green: #9cc63b;
            --bachoco-green-dark: #6f9627;
            --bachoco-bg: #f1f2ee;
            --bachoco-panel: #ffffff;
            --bachoco-text: #2b2b2b;
        }

        .stApp {
            background:
                linear-gradient(180deg, rgba(156, 198, 59, 0.10), rgba(241, 242, 238, 0) 220px),
                var(--bachoco-bg);
            color: var(--bachoco-text);
        }

        [data-testid="stHeader"] {
            background: rgba(241, 242, 238, 0.92);
            border-bottom: 1px solid rgba(156, 198, 59, 0.35);
        }

        [data-testid="stSidebar"] {
            background: #ffffff;
            border-right: 2px solid rgba(156, 198, 59, 0.55);
        }

        h1, h2, h3 {
            color: var(--bachoco-orange);
        }

        div[data-testid="stButton"] > button,
        div[data-testid="stFormSubmitButton"] > button,
        a[data-testid="stPageLink"] {
            background: var(--bachoco-orange);
            color: #ffffff;
            border: 2px solid var(--bachoco-green);
            border-radius: 8px;
            box-shadow: 0 2px 0 rgba(111, 150, 39, 0.24);
            font-weight: 700;
        }

        div[data-testid="stButton"] > button:hover,
        div[data-testid="stFormSubmitButton"] > button:hover,
        a[data-testid="stPageLink"]:hover {
            background: var(--bachoco-orange-dark);
            border-color: var(--bachoco-green-dark);
            color: #ffffff;
        }

        div[data-testid="stButton"] > button:disabled,
        div[data-testid="stFormSubmitButton"] > button:disabled {
            background: #d7d7d2;
            color: #77776f;
            border-color: #c8d9a0;
            box-shadow: none;
        }

        [data-testid="stMetric"] {
            background: var(--bachoco-panel);
            border: 1px solid rgba(156, 198, 59, 0.60);
            border-left: 6px solid var(--bachoco-orange);
            border-radius: 8px;
            padding: 14px 16px;
            box-shadow: 0 8px 24px rgba(43, 43, 43, 0.06);
        }

        [data-testid="stDataFrame"],
        [data-testid="stTable"],
        [data-testid="stForm"],
        div[data-testid="stAlert"] {
            border-radius: 8px;
        }

        hr {
            border-color: rgba(156, 198, 59, 0.45);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
