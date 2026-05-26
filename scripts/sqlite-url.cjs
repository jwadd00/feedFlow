const path = require("path");

function defaultSqliteDatabaseUrl(root = path.resolve(__dirname, "..")) {
  if (process.env.SQLITE_DATABASE_URL) return process.env.SQLITE_DATABASE_URL;
  const defaultDir = process.env.RENDER ? path.join(root, "storage") : path.join(root, "data");
  return `file:${path.join(defaultDir, "feedflow.db").replace(/\\/g, "/")}`;
}

function sqlitePathFromUrl(url, root = path.resolve(__dirname, "..")) {
  if (!url.startsWith("file:")) return path.join(root, "data", "feedflow.db");
  const rawPath = url.replace(/^file:/, "");
  return path.isAbsolute(rawPath) ? path.normalize(rawPath) : path.resolve(root, rawPath);
}

module.exports = { defaultSqliteDatabaseUrl, sqlitePathFromUrl };
