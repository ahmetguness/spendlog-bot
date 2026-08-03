import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency", { enum: ["TRY", "USD", "EUR"] }).notNull(),
    category: text("category").notNull(),
    merchant: text("merchant"),
    description: text("description"),
    expenseDate: text("expense_date").notNull(),
    rawMessage: text("raw_message").notNull(),
    parserType: text("parser_type", { enum: ["rule", "openai"] }).notNull(),
    parserConfidence: real("parser_confidence").notNull(),
    telegramMessageId: integer("telegram_message_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    dateIdx: index("idx_expenses_expense_date").on(table.expenseDate),
    categoryIdx: index("idx_expenses_category").on(table.category),
    currencyIdx: index("idx_expenses_currency").on(table.currency),
    deletedIdx: index("idx_expenses_deleted_at").on(table.deletedAt),
    createdIdx: index("idx_expenses_created_at").on(table.createdAt),
    activeTelegramMessageIdx: uniqueIndex("idx_expenses_active_telegram_message_id")
      .on(table.telegramMessageId)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export const pendingExpenses = sqliteTable(
  "pending_expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency", { enum: ["TRY", "USD", "EUR"] }).notNull(),
    category: text("category").notNull(),
    merchant: text("merchant"),
    description: text("description"),
    expenseDate: text("expense_date").notNull(),
    rawMessage: text("raw_message").notNull(),
    parserType: text("parser_type", { enum: ["rule", "openai"] }).notNull(),
    parserConfidence: real("parser_confidence").notNull(),
    telegramMessageId: integer("telegram_message_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({ expiresIdx: index("idx_pending_expenses_expires_at").on(table.expiresAt) }),
);

export const processedTelegramUpdates = sqliteTable("processed_telegram_updates", {
  updateId: integer("update_id").primaryKey(),
  processedAt: text("processed_at").notNull(),
});

export const pendingUpdates = sqliteTable(
  "pending_updates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    expenseId: integer("expense_id").notNull(),
    field: text("field", { enum: ["amount", "category", "description"] }).notNull(),
    amountMinor: integer("amount_minor"),
    currency: text("currency", { enum: ["TRY", "USD", "EUR"] }),
    value: text("value"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({ expiresIdx: index("idx_pending_updates_expires_at").on(table.expiresAt) }),
);

export const schemaMigrations = sqliteTable("schema_migrations", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  appliedAt: text("applied_at").notNull(),
});
