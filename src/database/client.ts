import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type DbClient = ReturnType<typeof createDatabaseClient>;

export function createDatabaseClient(databasePath: string) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    close: () => sqlite.close(),
  };
}
