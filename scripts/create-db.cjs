const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { execFileSync } = require("child_process");
const { defaultSqliteDatabaseUrl, sqlitePathFromUrl } = require("./sqlite-url.cjs");

const root = path.resolve(__dirname, "..");
const envUrl = defaultSqliteDatabaseUrl(root);
const dbPath = sqlitePathFromUrl(envUrl, root);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);
const sql = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS farms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_code TEXT NOT NULL UNIQUE,
  farm_name TEXT NOT NULL,
  grower_name TEXT,
  region TEXT,
  route TEXT,
  address TEXT,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS farm_houses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id),
  house_code TEXT NOT NULL,
  bird_count INTEGER,
  flock_age_days INTEGER,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_farm_house UNIQUE (farm_id, house_code)
);
CREATE TABLE IF NOT EXISTS feed_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_code TEXT NOT NULL UNIQUE,
  feed_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS feed_bins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_house_id INTEGER NOT NULL REFERENCES farm_houses(id),
  feed_type_id INTEGER NOT NULL REFERENCES feed_types(id),
  bin_code TEXT NOT NULL,
  capacity_tons REAL NOT NULL,
  estimated_daily_consumption_tons REAL NOT NULL,
  minimum_safe_tons REAL NOT NULL DEFAULT 2.0,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_house_bin UNIQUE (farm_house_id, bin_code)
);
CREATE TABLE IF NOT EXISTS bin_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_bin_id INTEGER NOT NULL REFERENCES feed_bins(id),
  reading_datetime DATETIME NOT NULL,
  source TEXT NOT NULL,
  reading_tons REAL NOT NULL,
  reading_percent REAL,
  notes TEXT,
  created_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bin_inventory_estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_bin_id INTEGER NOT NULL UNIQUE REFERENCES feed_bins(id),
  last_reading_id INTEGER REFERENCES bin_readings(id),
  estimated_at DATETIME NOT NULL,
  current_estimated_tons REAL NOT NULL,
  percent_full REAL NOT NULL,
  daily_consumption_tons REAL NOT NULL,
  projected_empty_datetime DATETIME,
  days_remaining REAL,
  risk_level TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS load_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_bin_id INTEGER NOT NULL REFERENCES feed_bins(id),
  generated_at DATETIME NOT NULL,
  current_estimated_tons REAL NOT NULL,
  days_remaining REAL,
  recommended_delivery_datetime DATETIME,
  recommended_tons REAL NOT NULL,
  priority TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS loads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  load_number TEXT NOT NULL UNIQUE,
  farm_id INTEGER NOT NULL REFERENCES farms(id),
  feed_bin_id INTEGER NOT NULL REFERENCES feed_bins(id),
  feed_type_id INTEGER NOT NULL REFERENCES feed_types(id),
  created_from_forecast_id INTEGER REFERENCES load_forecasts(id),
  planned_tons REAL NOT NULL,
  scheduled_delivery_datetime DATETIME,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Planned',
  truck TEXT,
  driver TEXT,
  route TEXT,
  notes TEXT,
  created_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS load_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  load_id INTEGER NOT NULL REFERENCES loads(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at DATETIME NOT NULL,
  changed_by TEXT,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS delivery_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  load_id INTEGER NOT NULL REFERENCES loads(id),
  ticket_number TEXT NOT NULL UNIQUE,
  delivered_at DATETIME NOT NULL,
  actual_tons REAL NOT NULL,
  feed_type_id INTEGER NOT NULL REFERENCES feed_types(id),
  reconciled BOOLEAN NOT NULL DEFAULT 0,
  reconciliation_notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS data_quality_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_code TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  severity TEXT NOT NULL,
  issue_status TEXT NOT NULL DEFAULT 'Open',
  detected_at DATETIME NOT NULL,
  assigned_to TEXT,
  issue_summary TEXT NOT NULL,
  resolution_notes TEXT,
  resolved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_open_issue UNIQUE (rule_code, entity_type, entity_id, issue_status)
);
CREATE INDEX IF NOT EXISTS idx_bin_readings_feed_bin_datetime ON bin_readings(feed_bin_id, reading_datetime);
CREATE INDEX IF NOT EXISTS idx_estimates_risk ON bin_inventory_estimates(risk_level);
CREATE INDEX IF NOT EXISTS idx_forecasts_status ON load_forecasts(status);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);
CREATE INDEX IF NOT EXISTS idx_issues_status ON data_quality_issues(issue_status);
`;

db.exec(sql, (err) => {
  db.close();
  if (err) {
    console.error(err);
    process.exit(1);
  }
  if (process.env.SKIP_PRISMA_GENERATE !== "true") {
    execFileSync("npx", ["prisma", "generate"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, SQLITE_DATABASE_URL: envUrl }
    });
  }
  console.log(`FeedFlow database ready at ${dbPath}`);
});
