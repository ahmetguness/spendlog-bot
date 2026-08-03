import type { Currency, ExpenseCategory } from "../shared/constants.js";

export type ParserType = "rule" | "openai";

export interface ExpenseDraft {
  amountMinor: number;
  currency: Currency;
  category: ExpenseCategory;
  merchant: string | null;
  description: string | null;
  expenseDate: string;
  rawMessage: string;
  parserType: ParserType;
  parserConfidence: number;
  telegramMessageId: number;
}

export interface Expense extends ExpenseDraft {
  id: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PendingExpense extends ExpenseDraft {
  id: number;
  expiresAt: string;
  createdAt: string;
}
