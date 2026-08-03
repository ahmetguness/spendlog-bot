import type BetterSqlite3 from "better-sqlite3";
import type { ExpenseDraft, PendingExpense } from "../../expenses/expense.types.js";

const SELECT = `id, amount_minor as amountMinor, currency, category, merchant, description,
expense_date as expenseDate, raw_message as rawMessage, parser_type as parserType,
parser_confidence as parserConfidence, telegram_message_id as telegramMessageId,
expires_at as expiresAt, created_at as createdAt`;

export class PendingExpenseRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  create(draft: ExpenseDraft, ttlMinutes: number): PendingExpense {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
    const info = this.sqlite
      .prepare(
        `INSERT OR REPLACE INTO pending_expenses
        (amount_minor,currency,category,merchant,description,expense_date,raw_message,parser_type,parser_confidence,telegram_message_id,expires_at,created_at)
        VALUES(@amountMinor,@currency,@category,@merchant,@description,@expenseDate,@rawMessage,@parserType,@parserConfidence,@telegramMessageId,@expiresAt,@createdAt)`,
      )
      .run({ ...draft, expiresAt, createdAt: now.toISOString() });
    const created = this.findById(Number(info.lastInsertRowid));
    if (!created) throw new Error("Pending expense could not be created");
    return created;
  }

  findById(id: number): PendingExpense | null {
    return (
      (this.sqlite.prepare(`SELECT ${SELECT} FROM pending_expenses WHERE id = ?`).get(id) as
        PendingExpense | undefined) ?? null
    );
  }

  latestActive(nowIso = new Date().toISOString()): PendingExpense | null {
    return (
      (this.sqlite
        .prepare(
          `SELECT ${SELECT} FROM pending_expenses
           WHERE expires_at > ?
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
        )
        .get(nowIso) as PendingExpense | undefined) ?? null
    );
  }

  update(
    id: number,
    patch: Partial<
      Pick<
        PendingExpense,
        "amountMinor" | "currency" | "category" | "merchant" | "description" | "expenseDate"
      >
    >,
  ): PendingExpense {
    const current = this.findById(id);
    if (!current) throw new Error("Pending expense not found");
    this.sqlite
      .prepare(
        `UPDATE pending_expenses
         SET amount_minor=@amountMinor,currency=@currency,category=@category,merchant=@merchant,description=@description,expense_date=@expenseDate
         WHERE id=@id`,
      )
      .run({ ...current, ...patch, id });
    const updated = this.findById(id);
    if (!updated) throw new Error("Pending expense not found");
    return updated;
  }

  delete(id: number): void {
    this.sqlite.prepare("DELETE FROM pending_expenses WHERE id = ?").run(id);
  }

  deleteExpired(nowIso = new Date().toISOString()): number {
    return this.sqlite.prepare("DELETE FROM pending_expenses WHERE expires_at <= ?").run(nowIso)
      .changes;
  }
}
