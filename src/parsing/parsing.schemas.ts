import { z } from "zod";
import { CategorySchema, CurrencySchema } from "../shared/constants.js";

export const IntentSchema = z.enum([
  "create_expense",
  "list_expenses",
  "expense_summary",
  "delete_expense",
  "update_expense",
  "unknown",
]);

export const StructuredParseSchema = z.object({
  intent: IntentSchema,
  amount: z.string().nullable(),
  currency: CurrencySchema.nullable(),
  category: CategorySchema.nullable(),
  merchant: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(300).nullable(),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
});

export type StructuredParse = z.infer<typeof StructuredParseSchema>;

export const BankImageExpenseSchema = z.object({
  amount: z.string(),
  currency: CurrencySchema,
  category: CategorySchema.nullable(),
  merchant: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(300).nullable(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rawTransactionText: z.string().trim().max(500),
  confidence: z.number().min(0).max(1),
});

export type BankImageExpense = z.infer<typeof BankImageExpenseSchema>;

export const BankImageParseSchema = z.object({
  sourceType: z.enum(["bank_screenshot", "receipt", "unknown"]),
  expenses: z.array(BankImageExpenseSchema),
});

export type BankImageParse = z.infer<typeof BankImageParseSchema>;
