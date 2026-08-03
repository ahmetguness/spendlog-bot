import type BetterSqlite3 from "better-sqlite3";
import type { ExpenseCategory } from "../../shared/constants.js";

export interface CategoryAlias {
  phrase: string;
  category: ExpenseCategory;
}

export interface MerchantAlias {
  phrase: string;
  merchant: string;
}

export class AliasRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  upsertCategoryAlias(phrase: string, category: ExpenseCategory): void {
    this.sqlite
      .prepare(
        `INSERT INTO category_aliases(phrase, category, created_at)
         VALUES(@phrase, @category, @createdAt)
         ON CONFLICT(phrase) DO UPDATE SET category = excluded.category`,
      )
      .run({ phrase: normalizeAlias(phrase), category, createdAt: new Date().toISOString() });
  }

  upsertMerchantAlias(phrase: string, merchant: string): void {
    this.sqlite
      .prepare(
        `INSERT INTO merchant_aliases(phrase, merchant, created_at)
         VALUES(@phrase, @merchant, @createdAt)
         ON CONFLICT(phrase) DO UPDATE SET merchant = excluded.merchant`,
      )
      .run({ phrase: normalizeAlias(phrase), merchant, createdAt: new Date().toISOString() });
  }

  findCategory(text: string): CategoryAlias | null {
    const lower = text.toLocaleLowerCase("tr-TR");
    const rows = this.sqlite
      .prepare("SELECT phrase, category FROM category_aliases ORDER BY length(phrase) DESC")
      .all() as CategoryAlias[];
    return rows.find((row) => lower.includes(row.phrase)) ?? null;
  }

  findMerchant(text: string): MerchantAlias | null {
    const lower = text.toLocaleLowerCase("tr-TR");
    const rows = this.sqlite
      .prepare("SELECT phrase, merchant FROM merchant_aliases ORDER BY length(phrase) DESC")
      .all() as MerchantAlias[];
    return rows.find((row) => lower.includes(row.phrase)) ?? null;
  }
}

export function normalizeAlias(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}
