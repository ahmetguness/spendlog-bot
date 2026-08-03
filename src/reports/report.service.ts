import type { ExpenseRepository } from "../database/repositories/expense.repository.js";
import type { ExpenseCategory } from "../shared/constants.js";
import { addDays, startOfMonth, startOfWeek } from "../shared/dates.js";

export class ReportService {
  constructor(private readonly expenses: ExpenseRepository) {}

  today(todayIso: string) {
    return this.expenses.list({ from: todayIso, to: todayIso });
  }

  week(todayIso: string) {
    return this.expenses.list({ from: startOfWeek(todayIso), to: todayIso });
  }

  month(todayIso: string) {
    return this.expenses.list({ from: startOfMonth(todayIso), to: todayIso });
  }

  range(from: string, to: string, category?: ExpenseCategory) {
    return this.expenses.list(category ? { from, to, category } : { from, to });
  }

  allDateRange() {
    return this.expenses.dateBounds();
  }

  last(limit = 10, category?: ExpenseCategory) {
    return this.expenses.list(category ? { limit, category } : { limit });
  }

  highest(limit = 5, category?: ExpenseCategory) {
    return this.expenses.list(
      category ? { limit, category, orderByAmountDesc: true } : { limit, orderByAmountDesc: true },
    );
  }

  yesterday(todayIso: string) {
    const yesterday = addDays(todayIso, -1);
    return this.expenses.list({ from: yesterday, to: yesterday });
  }
}
