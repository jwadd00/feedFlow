import path from "path";

export function defaultSqliteDatabaseUrl() {
  if (process.env.SQLITE_DATABASE_URL) return process.env.SQLITE_DATABASE_URL;

  const defaultDir = process.env.RENDER ? path.join(process.cwd(), "storage") : path.join(process.cwd(), "data");
  return `file:${path.join(defaultDir, "feedflow.db").replace(/\\/g, "/")}`;
}
