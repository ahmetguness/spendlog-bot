import type BetterSqlite3 from "better-sqlite3";
import type { Currency, ExpenseCategory } from "../../shared/constants.js";

export type PendingUpdate =
  | {
      id: number;
      expenseId: number;
      field: "amount";
      amountMinor: number;
      currency: Currency;
      value: null;
      expiresAt: string;
      createdAt: string;
    }
  | {
      id: number;
      expenseId: number;
      field: "category";
      amountMinor: null;
      currency: null;
      value: ExpenseCategory;
      expiresAt: string;
      createdAt: string;
    }
  | {
      id: number;
      expenseId: number;
      field: "description" | "date";
      amountMinor: null;
      currency: null;
      value: string;
      expiresAt: string;
      createdAt: string;
    };

const SELECT = `id, expense_id as expenseId, field, amount_minor as amountMinor, currency, value,
expires_at as expiresAt, created_at as createdAt`;

export class PendingUpdateRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  createAmount(
    expenseId: number,
    amountMinor: number,
    currency: Currency,
    ttlMinutes: number,
  ): PendingUpdate {
    return this.create(
      { expenseId, field: "amount", amountMinor, currency, value: null },
      ttlMinutes,
    );
  }

  createCategory(expenseId: number, value: ExpenseCategory, ttlMinutes: number): PendingUpdate {
    return this.create(
      { expenseId, field: "category", amountMinor: null, currency: null, value },
      ttlMinutes,
    );
  }

  createDescription(expenseId: number, value: string, ttlMinutes: number): PendingUpdate {
    return this.create(
      { expenseId, field: "description", amountMinor: null, currency: null, value },
      ttlMinutes,
    );
  }

  createDate(expenseId: number, value: string, ttlMinutes: number): PendingUpdate {
    return this.create(
      { expenseId, field: "date", amountMinor: null, currency: null, value },
      ttlMinutes,
    );
  }

  findById(id: number): PendingUpdate | null {
    return (
      (this.sqlite.prepare(`SELECT ${SELECT} FROM pending_updates WHERE id = ?`).get(id) as
        PendingUpdate | undefined) ?? null
    );
  }

  delete(id: number): void {
    this.sqlite.prepare("DELETE FROM pending_updates WHERE id = ?").run(id);
  }

  deleteExpired(nowIso = new Date().toISOString()): number {
    return this.sqlite.prepare("DELETE FROM pending_updates WHERE expires_at <= ?").run(nowIso)
      .changes;
  }

  private create(
    input: {
      expenseId: number;
      field: string;
      amountMinor: number | null;
      currency: Currency | null;
      value: string | null;
    },
    ttlMinutes: number,
  ): PendingUpdate {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
    const info = this.sqlite
      .prepare(
        `INSERT INTO pending_updates(expense_id,field,amount_minor,currency,value,expires_at,created_at)
         VALUES(@expenseId,@field,@amountMinor,@currency,@value,@expiresAt,@createdAt)`,
      )
      .run({ ...input, expiresAt, createdAt: now.toISOString() });
    const created = this.findById(Number(info.lastInsertRowid));
    if (!created) throw new Error("Pending update could not be created");
    return created;
  }
}
