import { z } from "zod";
import { CategorySchema, CurrencySchema } from "../shared/constants.js";

export const ExpenseDraftSchema = z.object({
  amountMinor: z.number().int().positive(),
  currency: CurrencySchema,
  category: CategorySchema,
  merchant: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(300).nullable(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rawMessage: z.string().min(1).max(2000),
  parserType: z.enum(["rule", "openai"]),
  parserConfidence: z.number().min(0).max(1),
  telegramMessageId: z.number().int(),
});
