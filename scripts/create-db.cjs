const { execFileSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const env = { ...process.env };

if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is required for Prisma database initialization.");
  process.exit(1);
}

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

console.log("FeedFlow database schema is ready.");
