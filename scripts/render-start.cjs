const { spawnSync, spawn } = require("child_process");
const path = require("path");
const { defaultSqliteDatabaseUrl } = require("./sqlite-url.cjs");

const root = path.resolve(__dirname, "..");
const port = process.env.PORT || "10000";
const env = {
  ...process.env,
  HOSTNAME: "0.0.0.0",
  PORT: port,
  SQLITE_DATABASE_URL: defaultSqliteDatabaseUrl(root),
  SKIP_PRISMA_GENERATE: "true"
};

const init = spawnSync(process.execPath, ["scripts/create-db.cjs"], {
  cwd: root,
  env,
  stdio: "inherit"
});

if (init.status !== 0) {
  process.exit(init.status || 1);
}

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", port], {
  cwd: root,
  env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code || 0);
});
