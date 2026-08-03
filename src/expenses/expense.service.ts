import type { ExpenseRepository } from "../database/repositories/expense.repository.js";
import type { PendingExpenseRepository } from "../database/repositories/pending-expense.repository.js";
import type { PendingUpdateRepository } from "../database/repositories/pending-update.repository.js";
import type { UndoRepository } from "../database/repositories/undo.repository.js";
import type { Expense, ExpenseDraft, PendingExpense } from "./expense.types.js";
import { ExpenseDraftSchema } from "./expense.schemas.js";

export class ExpenseService {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly pending: PendingExpenseRepository,
    private readonly pendingUpdates: PendingUpdateRepository,
    private readonly undo: UndoRepository,
    private readonly pendingTtlMinutes: number,
  ) {}

  createPending(draft: ExpenseDraft): PendingExpense {
    return this.pending.create(ExpenseDraftSchema.parse(draft), this.pendingTtlMinutes);
  }

  confirmPending(id: number): { expense: Expense; undoId: number } | null {
    const pending = this.pending.findById(id);
    if (!pending || pending.expiresAt <= new Date().toISOString()) return null;
    const expense = this.expenses.confirmPending(pending);
    return { expense, undoId: this.undo.create("create", expense.id).id };
  }

  cancelPending(id: number): void {
    this.pending.delete(id);
  }

  latestPending(): PendingExpense | null {
    return this.pending.latestActive();
  }

  updatePending(
    id: number,
    patch: Partial<
      Pick<
        PendingExpense,
        "amountMinor" | "currency" | "category" | "merchant" | "description" | "expenseDate"
      >
    >,
  ): PendingExpense {
    return this.pending.update(id, patch);
  }

  cleanupExpired(): number {
    return (
      this.pending.deleteExpired() + this.pendingUpdates.deleteExpired() + this.undo.deleteExpired()
    );
  }

  createPendingAmountUpdate(
    expenseId: number,
    amountMinor: number,
    currency: ExpenseDraft["currency"],
  ): number {
    return this.pendingUpdates.createAmount(
      expenseId,
      amountMinor,
      currency,
      this.pendingTtlMinutes,
    ).id;
  }

  createPendingCategoryUpdate(expenseId: number, category: ExpenseDraft["category"]): number {
    return this.pendingUpdates.createCategory(expenseId, category, this.pendingTtlMinutes).id;
  }

  createPendingDescriptionUpdate(expenseId: number, description: string): number {
    return this.pendingUpdates.createDescription(expenseId, description, this.pendingTtlMinutes).id;
  }

  createPendingDateUpdate(expenseId: number, expenseDate: string): number {
    return this.pendingUpdates.createDate(expenseId, expenseDate, this.pendingTtlMinutes).id;
  }

  confirmPendingUpdate(id: number): { expense: Expense; undoId: number } | null {
    const update = this.pendingUpdates.findById(id);
    if (!update || update.expiresAt <= new Date().toISOString()) return null;
    const tx = this.expenses.transaction(() => {
      const current = this.pendingUpdates.findById(id);
      if (!current) return null;
      const before = this.expenses.findById(current.expenseId);
      if (!before) return null;
      const updated =
        current.field === "amount"
          ? this.expenses.update(current.expenseId, {
              amountMinor: current.amountMinor,
              currency: current.currency,
            })
          : current.field === "category"
            ? this.expenses.update(current.expenseId, { category: current.value })
            : current.field === "date"
              ? this.expenses.update(current.expenseId, { expenseDate: current.value })
              : this.expenses.update(current.expenseId, { description: current.value });
      this.pendingUpdates.delete(id);
      return {
        expense: updated,
        undoId: this.undo.create("update", updated.id, JSON.stringify(before)).id,
      };
    });
    return tx();
  }

  cancelPendingUpdate(id: number): void {
    this.pendingUpdates.delete(id);
  }

  softDeleteWithUndo(id: number): { expense: Expense; undoId: number } {
    const expense = this.expenses.softDelete(id);
    return { expense, undoId: this.undo.create("delete", id).id };
  }

  undoAction(id: number): Expense | null {
    const action = this.undo.findById(id);
    if (!action || action.expiresAt <= new Date().toISOString()) return null;
    const tx = this.expenses.transaction(() => {
      const current = this.undo.findById(id);
      if (!current) return null;
      let expense: Expense;
      if (current.action === "create") {
        expense = this.expenses.softDelete(current.expenseId);
      } else if (current.action === "delete") {
        expense = this.expenses.restore(current.expenseId);
      } else {
        const payload = current.payload ? (JSON.parse(current.payload) as Expense) : null;
        if (!payload) return null;
        expense = this.expenses.update(current.expenseId, {
          amountMinor: payload.amountMinor,
          currency: payload.currency,
          category: payload.category,
          merchant: payload.merchant,
          description: payload.description,
          expenseDate: payload.expenseDate,
        });
      }
      this.undo.delete(id);
      return expense;
    });
    return tx();
  }
}
