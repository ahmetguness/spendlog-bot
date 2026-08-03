import type BetterSqlite3 from "better-sqlite3";

export type UndoActionType = "create" | "delete" | "update";

export interface UndoAction {
  id: number;
  action: UndoActionType;
  expenseId: number;
  payload: string | null;
  expiresAt: string;
  createdAt: string;
}

const SELECT = `id, action, expense_id as expenseId, payload, expires_at as expiresAt, created_at as createdAt`;

export class UndoRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  create(action: UndoActionType, expenseId: number, payload: string | null = null): UndoAction {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
    const info = this.sqlite
      .prepare(
        `INSERT INTO undo_actions(action, expense_id, payload, expires_at, created_at)
         VALUES(@action, @expenseId, @payload, @expiresAt, @createdAt)`,
      )
      .run({ action, expenseId, payload, expiresAt, createdAt: now.toISOString() });
    const created = this.findById(Number(info.lastInsertRowid));
    if (!created) throw new Error("Undo action could not be created");
    return created;
  }

  findById(id: number): UndoAction | null {
    return (
      (this.sqlite.prepare(`SELECT ${SELECT} FROM undo_actions WHERE id = ?`).get(id) as
        UndoAction | undefined) ?? null
    );
  }

  delete(id: number): void {
    this.sqlite.prepare("DELETE FROM undo_actions WHERE id = ?").run(id);
  }

  deleteExpired(nowIso = new Date().toISOString()): number {
    return this.sqlite.prepare("DELETE FROM undo_actions WHERE expires_at <= ?").run(nowIso)
      .changes;
  }
}
