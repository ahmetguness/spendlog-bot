import { z } from "zod";

export const CURRENCIES = ["TRY", "USD", "EUR"] as const;
export const CurrencySchema = z.enum(CURRENCIES);
export type Currency = (typeof CURRENCIES)[number];

export const CATEGORIES = [
  "Market",
  "Yeme ve İçme",
  "Ulaşım",
  "Benzin",
  "Faturalar",
  "Kira",
  "Sağlık",
  "Eğlence",
  "Oyun",
  "Alışveriş",
  "Eğitim",
  "Abonelik",
  "Seyahat",
  "Ev",
  "Teknoloji",
  "Diğer",
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type ExpenseCategory = (typeof CATEGORIES)[number];

export const CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  Market: "🛒",
  "Yeme ve İçme": "🍽️",
  Ulaşım: "🚕",
  Benzin: "⛽",
  Faturalar: "🧾",
  Kira: "🏠",
  Sağlık: "💊",
  Eğlence: "🎬",
  Oyun: "🎮",
  Alışveriş: "🛍️",
  Eğitim: "🎓",
  Abonelik: "🔁",
  Seyahat: "✈️",
  Ev: "🏡",
  Teknoloji: "💻",
  Diğer: "📌",
};

export const CALLBACK_PREFIX = {
  confirmExpense: "expense:save",
  cancelExpense: "expense:cancel",
  confirmDelete: "delete:yes",
  cancelDelete: "delete:no",
  confirmUpdate: "update:yes",
  cancelUpdate: "update:no",
  pickDelete: "delete:pick",
  pickUpdate: "update:pick",
  confirmBatch: "batch:save",
  cancelBatch: "batch:cancel",
  undoCreate: "undo:create",
  undoDelete: "undo:delete",
  undoUpdate: "undo:update",
} as const;

export const MAX_CALLBACK_ID_LENGTH = 64;
