import type BetterSqlite3 from "better-sqlite3";
import type { Expense, ExpenseDraft, PendingExpense } from "../../expenses/expense.types.js";
import type { ExpenseCategory } from "../../shared/constants.js";
import { ConflictError, NotFoundError } from "../../shared/errors.js";

const SELECT = `id, amount_minor as amountMinor, currency, category, merchant, description,
expense_date as expenseDate, raw_message as rawMessage, parser_type as parserType,
parser_confidence as parserConfidence, telegram_message_id as telegramMessageId,
created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt`;

export interface ExpenseFilter {
  from?: string;
  to?: string;
  category?: ExpenseCategory;
  merchantLike?: string;
  minAmountMinor?: number;
  maxAmountMinor?: number;
  limit?: number;
  orderByAmountDesc?: boolean;
}

export class ExpenseRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  transaction<T>(fn: () => T): () => T {
    return this.sqlite.transaction(fn);
  }

  create(draft: ExpenseDraft): Expense {
    const now = new Date().toISOString();
    try {
      const info = this.sqlite
        .prepare(
          `INSERT INTO expenses
          (amount_minor,currency,category,merchant,description,expense_date,raw_message,parser_type,parser_confidence,telegram_message_id,created_at,updated_at)
          VALUES(@amountMinor,@currency,@category,@merchant,@description,@expenseDate,@rawMessage,@parserType,@parserConfidence,@telegramMessageId,@createdAt,@updatedAt)`,
        )
        .run({ ...draft, createdAt: now, updatedAt: now });
      const created = this.findById(Number(info.lastInsertRowid));
      if (!created) throw new ConflictError("Expense could not be created");
      return created;
    } catch {
      throw new ConflictError("Expense already exists");
    }
  }

  confirmPending(pending: PendingExpense): Expense {
    const tx = this.sqlite.transaction(() => {
      const existing = this.sqlite
        .prepare(
          `SELECT ${SELECT} FROM expenses WHERE telegram_message_id = ? AND deleted_at IS NULL`,
        )
        .get(pending.telegramMessageId) as Expense | undefined;
      if (existing) {
        this.sqlite.prepare("DELETE FROM pending_expenses WHERE id = ?").run(pending.id);
        return existing;
      }
      const expense = this.create(pending);
      this.sqlite.prepare("DELETE FROM pending_expenses WHERE id = ?").run(pending.id);
      return expense;
    });
    return tx();
  }

  findById(id: number): Expense | null {
    return (
      (this.sqlite.prepare(`SELECT ${SELECT} FROM expenses WHERE id = ?`).get(id) as
        Expense | undefined) ?? null
    );
  }

  list(filter: ExpenseFilter = {}): Expense[] {
    const where = ["deleted_at IS NULL"];
    const params: Record<string, string | number> = {};
    if (filter.from) {
      where.push("expense_date >= @from");
      params.from = filter.from;
    }
    if (filter.to) {
      where.push("expense_date <= @to");
      params.to = filter.to;
    }
    if (filter.category) {
      where.push("category = @category");
      params.category = filter.category;
    }
    if (filter.merchantLike) {
      where.push(
        "(merchant LIKE @merchant OR description LIKE @merchant OR raw_message LIKE @merchant)",
      );
      params.merchant = `%${filter.merchantLike}%`;
    }
    if (filter.minAmountMinor !== undefined) {
      where.push("amount_minor >= @minAmountMinor");
      params.minAmountMinor = filter.minAmountMinor;
    }
    if (filter.maxAmountMinor !== undefined) {
      where.push("amount_minor <= @maxAmountMinor");
      params.maxAmountMinor = filter.maxAmountMinor;
    }
    const order = filter.orderByAmountDesc ? "amount_minor DESC" : "expense_date DESC, id DESC";
    const limit = filter.limit ? "LIMIT @limit" : "";
    if (filter.limit) params.limit = filter.limit;
    return this.sqlite
      .prepare(
        `SELECT ${SELECT} FROM expenses WHERE ${where.join(" AND ")} ORDER BY ${order} ${limit}`,
      )
      .all(params) as Expense[];
  }

  dateBounds(): { from: string; to: string } | null {
    const row = this.sqlite
      .prepare(
        "SELECT MIN(expense_date) as fromDate, MAX(expense_date) as toDate FROM expenses WHERE deleted_at IS NULL",
      )
      .get() as { fromDate: string | null; toDate: string | null };
    if (!row.fromDate || !row.toDate) return null;
    return { from: row.fromDate, to: row.toDate };
  }

  softDelete(id: number): Expense {
    const expense = this.findById(id);
    if (!expense || expense.deletedAt) throw new NotFoundError("Expense not found");
    this.sqlite
      .prepare(
        "UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
      )
      .run(new Date().toISOString(), new Date().toISOString(), id);
    const deleted = this.findById(id);
    if (!deleted) throw new NotFoundError("Expense not found");
    return deleted;
  }

  restore(id: number): Expense {
    const expense = this.findById(id);
    if (!expense) throw new NotFoundError("Expense not found");
    this.sqlite
      .prepare("UPDATE expenses SET deleted_at = NULL, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    const restored = this.findById(id);
    if (!restored) throw new NotFoundError("Expense not found");
    return restored;
  }

  update(
    id: number,
    patch: Partial<
      Pick<
        Expense,
        "amountMinor" | "currency" | "category" | "description" | "merchant" | "expenseDate"
      >
    >,
  ): Expense {
    const expense = this.findById(id);
    if (!expense || expense.deletedAt) throw new NotFoundError("Expense not found");
    this.sqlite
      .prepare(
        `UPDATE expenses SET amount_minor=@amountMinor,currency=@currency,category=@category,description=@description,merchant=@merchant,expense_date=@expenseDate,updated_at=@updatedAt WHERE id=@id AND deleted_at IS NULL`,
      )
      .run({ ...expense, ...patch, updatedAt: new Date().toISOString(), id });
    const updated = this.findById(id);
    if (!updated) throw new NotFoundError("Expense not found");
    return updated;
  }
}
