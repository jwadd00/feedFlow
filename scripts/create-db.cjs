const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { defaultSqliteDatabaseUrl, sqlitePathFromUrl } = require("./sqlite-url.cjs");

const root = path.resolve(__dirname, "..");
const envUrl = defaultSqliteDatabaseUrl(root);
const dbPath = sqlitePathFromUrl(envUrl, root);
const env = { ...process.env, SQLITE_DATABASE_URL: envUrl };

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env
});

if (process.env.SKIP_PRISMA_GENERATE !== "true") {
  execFileSync("npx", ["prisma", "generate"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env
  });
}

console.log(`FeedFlow database ready at ${dbPath}`);
