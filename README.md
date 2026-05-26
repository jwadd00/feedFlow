# FeedFlow Operations Hub MVP

## Node / TypeScript App

FeedFlow has been converted into a Next.js + TypeScript + Prisma app in the same general style as the Concord app. The prior Streamlit/Python app is still present for reference.

```powershell
npm install
copy .env.local.example .env.local
npm run prisma:generate
npx next dev -p 3000
```

Open http://localhost:3000.

The TypeScript app uses Prisma with PostgreSQL. Set `DATABASE_URL` to a PostgreSQL connection string before running database commands. On first load it can seed demo farms, bins, readings, loads, tickets, forecasts, and data quality issues unless `SEED_SAMPLE_DATA=false`.

Workflow route order: `/workflow`, `/admin`, `/bins`, `/forecasts`, `/loads`, `/quality`, and `/operations`.

## Render Deployment

This repo includes a `render.yaml` blueprint for a Render web service plus managed Render Postgres database.

- Build command: `npm install && npx prisma generate && npm run build`
- Start command: `npm run render:start`
- Health check: `/api/health`
- Database: Render Postgres, exposed to the web service as `DATABASE_URL`
- Basic Auth: set `APP_BASIC_AUTH_USERNAME` and `APP_BASIC_AUTH_PASSWORD`

The runtime start script applies the Prisma schema to Postgres before starting Next. Pages are server-rendered on demand so Render builds do not need database access.

The app requires Basic Auth in production. The included `render.yaml` generates `APP_BASIC_AUTH_PASSWORD` and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` automatically. Keep both values stable across deploys.

For short-lived external testing, set `APP_TEST_AUTH_ENABLED=true` and provide `APP_TEST_AUTH_USERNAME` plus `APP_TEST_AUTH_PASSWORD`. Disable `APP_TEST_AUTH_ENABLED` or rotate the temporary password after testing.

A runnable Streamlit MVP for a poultry feed / animal food manufacturing facility focused on:

- Farm bin inventory surveillance
- Forecasted feed/load needs
- Load planning and tracking
- Data quality exceptions
- Basic load history analytics

This version is intentionally simple and practical. It uses **SQLite by default** so you can run the app locally immediately. Later, replace `DATABASE_URL` with SQL Server or PostgreSQL.

---

## 1. Project Tree

```text
feedflow-operations-hub/
├── app.py
├── pages/
│   ├── 1_Operations_Hub.py
│   ├── 2_Farm_Bin_Surveillance.py
│   ├── 3_Forecasted_Needs.py
│   ├── 4_Load_Planning.py
│   └── 5_Data_Quality.py
├── src/
│   ├── database.py
│   ├── models.py
│   ├── queries.py
│   ├── inventory.py
│   ├── forecasting.py
│   ├── loads.py
│   ├── data_quality.py
│   ├── formatting.py
│   └── seed.py
├── jobs/
│   ├── refresh_inventory_estimates.py
│   ├── generate_load_forecasts.py
│   ├── run_data_quality_checks.py
│   └── refresh_all.py
├── sql/
│   ├── 001_create_tables.sql
│   ├── 002_insert_sample_data.sql
│   └── 003_create_views.sql
├── docs/
│   ├── process_map.md
│   ├── data_dictionary.md
│   └── business_rules.md
└── data/
    └── feedflow.db  # generated on first run
```

---

## 2. Quick Start

```bash
cd feedflow-operations-hub
python -m venv .venv
source .venv/bin/activate      # macOS/Linux
# .venv\Scripts\activate       # Windows PowerShell
pip install -r requirements.txt
streamlit run app.py
```

On first run, the app will create a local SQLite database at:

```text
data/feedflow.db
```

The database is seeded with sample farms, houses, bins, readings, loads, and tickets.

---

## 3. Optional: Configure Another Database

Create a `.env` file using `.env.example` as a template.
For Streamlit deployments, the same keys can be placed in `.streamlit/secrets.toml`; local environment variables still take precedence.

SQLite default:

```env
DATABASE_URL=sqlite:///data/feedflow.db
```

PostgreSQL example:

```env
DATABASE_URL=postgresql+psycopg2://<db-user>:<db-secret>@localhost:5432/feedflow
```

Azure SQL / SQL Server example:

```env
DATABASE_URL=mssql+pyodbc://<db-user>:<db-secret>@<server>.database.windows.net/<database>?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no
SEED_SAMPLE_DATA=false
CREATE_TABLES_ON_STARTUP=false
RUN_STARTUP_JOBS=false
READ_CACHE_TTL_SECONDS=3600
READ_CACHE_PERSIST=true
DB_CONNECT_TIMEOUT_SECONDS=5
DB_POOL_PRE_PING=false
DB_RETRY_ATTEMPTS=8
DB_RETRY_INITIAL_DELAY_SECONDS=2
DB_RETRY_MAX_DELAY_SECONDS=20
```

Install the matching ODBC driver on your machine if you use Azure SQL or SQL Server.
The SQL files in `sql/` are Azure SQL reference/setup scripts; the app still creates tables from the SQLAlchemy models on startup.
Set `SEED_SAMPLE_DATA=true` only when you want the demo farms, bins, readings, loads, and tickets inserted into an empty database.

Check the configured database connection before launching Streamlit:

```bash
python -m jobs.check_database_connection
```

To intentionally load the MVP demo farms, bins, readings, loads, and tickets into an empty configured database:

```bash
python -m jobs.seed_sample_data
```

To add the Azure SQL indexes used by the Streamlit read paths:

```bash
python -m jobs.create_database_indexes
```

If your Azure SQL schema is managed outside the app, set `CREATE_TABLES_ON_STARTUP=false`.
If you do not want forecasts, inventory estimates, and data quality checks refreshed on every page load, set `RUN_STARTUP_JOBS=false` and run the scripts in `jobs/` manually.
For lower page-switch latency over Azure SQL, keep `READ_CACHE_TTL_SECONDS` high, such as 3600. The app clears cached reads after in-app writes and refresh actions.
Set `READ_CACHE_PERSIST=true` so cached Azure reads survive Streamlit restarts.
Set `DB_CONNECT_TIMEOUT_SECONDS=5` so connection problems fail quickly instead of making page navigation appear frozen.
Set `DB_POOL_PRE_PING=false` to avoid an extra validation query on every connection checkout during interactive use.
If Azure SQL is paused or cold, database reads and writes retry automatically using the `DB_RETRY_*` settings before surfacing an error.

---

## 4. Streamlit Cloud Deployment

Deploy `app.py` as the app entrypoint.

In Streamlit Cloud, add secrets using the keys from `.streamlit/secrets.example.toml`. Required production secrets include:

```toml
APP_AUTH_ENABLED = true
APP_PASSWORD = "<private-app-password>"
DATABASE_URL = "your-azure-sql-connection-string"
SEED_SAMPLE_DATA = false
CREATE_TABLES_ON_STARTUP = false
RUN_STARTUP_JOBS = false
```

Do not commit `.env` or `.streamlit/secrets.toml`. Both are ignored locally. For better password hygiene, store `APP_PASSWORD_HASH` instead of `APP_PASSWORD`; it should be the SHA-256 hex digest of the password users type.

To generate `APP_PASSWORD_HASH` locally:

```bash
python -m jobs.hash_app_password
```

For Streamlit Cloud, prefer the `mssql+pymssql://...` SQLAlchemy URL shown in `.streamlit/secrets.example.toml` if the hosted runtime cannot load a native ODBC driver. Local Windows development can continue using `pyodbc`.

---

## 5. Suggested First Workflow

1. Open **Farm Bin Surveillance**.
2. Review bins, projected empty dates, and risk levels.
3. Add a new bin reading using the form.
4. Open **Forecasted Needs** and generate forecasts.
5. Convert an open forecast into a planned load.
6. Open **Load Planning** and move a load through statuses.
7. Open **Data Quality** and run checks.

---

## 6. MVP Boundaries

This app starts at:

```text
Bin reading captured or estimated
```

And ends at:

```text
Delivered load reconciled and available for history analytics
```

It does not yet include:

- Route optimization
- IoT sensor API integration
- ERP integration
- Driver mobile app
- User authentication
- Advanced ML forecasting

Those are natural next phases.
