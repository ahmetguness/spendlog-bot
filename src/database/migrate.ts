import { loadEnv } from "../config/env.js";
import { logger } from "../shared/logger.js";
import { createDatabaseClient } from "./client.js";

export function migrate(databasePath: string): void {
  const { sqlite } = createDatabaseClient(databasePath);
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL CHECK(currency IN ('TRY','USD','EUR')),
        category TEXT NOT NULL,
        merchant TEXT,
        description TEXT,
        expense_date TEXT NOT NULL,
        raw_message TEXT NOT NULL,
        parser_type TEXT NOT NULL CHECK(parser_type IN ('rule','openai')),
        parser_confidence REAL NOT NULL,
        telegram_message_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_active_telegram_message_id
        ON expenses(telegram_message_id)
        WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
      CREATE INDEX IF NOT EXISTS idx_expenses_currency ON expenses(currency);
      CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at ON expenses(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
      CREATE TABLE IF NOT EXISTS pending_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL CHECK(currency IN ('TRY','USD','EUR')),
        category TEXT NOT NULL,
        merchant TEXT,
        description TEXT,
        expense_date TEXT NOT NULL,
        raw_message TEXT NOT NULL,
        parser_type TEXT NOT NULL CHECK(parser_type IN ('rule','openai')),
        parser_confidence REAL NOT NULL,
        telegram_message_id INTEGER NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pending_expenses_expires_at ON pending_expenses(expires_at);
      CREATE TABLE IF NOT EXISTS processed_telegram_updates (
        update_id INTEGER PRIMARY KEY,
        processed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_processed_telegram_updates_update_id ON processed_telegram_updates(update_id);
      CREATE TABLE IF NOT EXISTS pending_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id INTEGER NOT NULL,
        field TEXT NOT NULL CHECK(field IN ('amount','category','description','date')),
        amount_minor INTEGER,
        currency TEXT CHECK(currency IN ('TRY','USD','EUR')),
        value TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(expense_id) REFERENCES expenses(id)
      );
      CREATE INDEX IF NOT EXISTS idx_pending_updates_expires_at ON pending_updates(expires_at);
      CREATE TABLE IF NOT EXISTS category_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phrase TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_category_aliases_phrase ON category_aliases(phrase);
      CREATE TABLE IF NOT EXISTS merchant_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phrase TEXT NOT NULL UNIQUE,
        merchant TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_merchant_aliases_phrase ON merchant_aliases(phrase);
      CREATE TABLE IF NOT EXISTS undo_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL CHECK(action IN ('create','delete','update')),
        expense_id INTEGER NOT NULL,
        payload TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_undo_actions_expires_at ON undo_actions(expires_at);
      INSERT OR IGNORE INTO schema_migrations(id, name, applied_at)
        VALUES(1, 'initial_schema', datetime('now'));
    `);
    ensurePendingUpdatesSupportsDate(sqlite);
  } finally {
    sqlite.close();
  }
}

function ensurePendingUpdatesSupportsDate(
  sqlite: ReturnType<typeof createDatabaseClient>["sqlite"],
): void {
  const table = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pending_updates'")
    .get() as { sql: string } | undefined;
  if (!table?.sql || table.sql.includes("'date'")) return;
  sqlite.exec(`
    DROP INDEX IF EXISTS idx_pending_updates_expires_at;
    CREATE TABLE pending_updates_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      field TEXT NOT NULL CHECK(field IN ('amount','category','description','date')),
      amount_minor INTEGER,
      currency TEXT CHECK(currency IN ('TRY','USD','EUR')),
      value TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(expense_id) REFERENCES expenses(id)
    );
    INSERT INTO pending_updates_new(id, expense_id, field, amount_minor, currency, value, expires_at, created_at)
      SELECT id, expense_id, field, amount_minor, currency, value, expires_at, created_at
      FROM pending_updates;
    DROP TABLE pending_updates;
    ALTER TABLE pending_updates_new RENAME TO pending_updates;
    CREATE INDEX IF NOT EXISTS idx_pending_updates_expires_at ON pending_updates(expires_at);
    INSERT OR IGNORE INTO schema_migrations(id, name, applied_at)
      VALUES(2, 'pending_update_date_field', datetime('now'));
  `);
}

if (process.argv[1]?.endsWith("migrate.ts") || process.argv[1]?.endsWith("migrate.js")) {
  const env = loadEnv();
  migrate(env.DATABASE_PATH);
  logger.info({ eventType: "migration_complete" }, "Database migration complete");
}
