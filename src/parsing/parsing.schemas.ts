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
