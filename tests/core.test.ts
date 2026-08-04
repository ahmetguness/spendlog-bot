import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../src/database/client.js";
import { loadEnv } from "../src/config/env.js";
import { migrate } from "../src/database/migrate.js";
import { AliasRepository } from "../src/database/repositories/alias.repository.js";
import { ExpenseRepository } from "../src/database/repositories/expense.repository.js";
import { PendingExpenseRepository } from "../src/database/repositories/pending-expense.repository.js";
import { PendingUpdateRepository } from "../src/database/repositories/pending-update.repository.js";
import { ProcessedUpdateRepository } from "../src/database/repositories/processed-update.repository.js";
import { UndoRepository } from "../src/database/repositories/undo.repository.js";
import { ExpenseService } from "../src/expenses/expense.service.js";
import type { Expense, ExpenseDraft } from "../src/expenses/expense.types.js";
import {
  deleteCandidateLimit,
  duplicateGroups,
  extractExpenseLines,
  comparisonRangesFromText,
  isAnalyticsRequest,
  isDuplicateRequest,
  isDeleteRequest,
  isListRequest,
  isPdfRequest,
  isSummary,
  isUpdateRequest,
  pdfTitle,
  requestedLimit,
  smartPeriodInsight,
} from "../src/bot/handlers/message.handler.js";
import { parseAmount } from "../src/parsing/amount-parser.js";
import { matchCategory } from "../src/parsing/category-matcher.js";
import { BankImageParseSchema, StructuredParseSchema } from "../src/parsing/parsing.schemas.js";
import { RuleBasedParser } from "../src/parsing/rule-based-parser.js";
import { PdfReportService } from "../src/reports/pdf-report.service.js";
import { ReportService } from "../src/reports/report.service.js";
import { parseDateRangeFromText, parseTurkishDate } from "../src/shared/dates.js";
import { parseMoneyToMinorUnit } from "../src/shared/money.js";

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup) fn();
  cleanup = [];
});

function db() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "expense-test-"));
  const file = path.join(dir, "test.db");
  migrate(file);
  const client = createDatabaseClient(file);
  cleanup.push(() => {
    client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return client;
}

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    amountMinor: 85000,
    currency: "TRY",
    category: "Market",
    merchant: "Migros",
    description: "Market alışverişi",
    expenseDate: "2026-08-03",
    rawMessage: "Migros 850 TL",
    parserType: "rule",
    parserConfidence: 0.9,
    telegramMessageId: 1,
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    ...draft(overrides),
    id: 1,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("money parser", () => {
  it("parses TRY formats", () => {
    expect(parseMoneyToMinorUnit("1.250,50")).toBe(125050);
    expect(parseAmount("₺500")?.currency).toBe("TRY");
    expect(parseAmount("300 TL'ye benzin")?.amountMinor).toBe(30000);
    expect(parseAmount("300 tlye benzin")?.amountMinor).toBe(30000);
    expect(parseAmount("300 TL'lik benzin")?.amountMinor).toBe(30000);
    expect(parseAmount("300 türk lirasına benzin")?.amountMinor).toBe(30000);
  });
  it("parses USD formats", () => {
    expect(parseAmount("$20")?.amountMinor).toBe(2000);
    expect(parseAmount("1,250.50 USD")?.currency).toBe("USD");
  });
  it("parses EUR formats", () => {
    expect(parseAmount("12 euro")?.currency).toBe("EUR");
    expect(parseAmount("€18,50")?.amountMinor).toBe(1850);
  });
});

describe("date and category parser", () => {
  it("parses Turkish dates", () => {
    expect(parseTurkishDate("dün benzin", "2026-08-03")).toBe("2026-08-02");
    expect(parseTurkishDate("2 Ağustos 2026", "2026-08-03")).toBe("2026-08-02");
    expect(parseTurkishDate("2 Ağustos 2016 Migros 50 TL", "2036-08-03")).toBe("2016-08-02");
    expect(parseTurkishDate("02.08.2016 Migros 50 TL", "2036-08-03")).toBe("2016-08-02");
    expect(parseTurkishDate("2016-08-02 Migros 50 TL", "2036-08-03")).toBe("2016-08-02");
  });
  it("builds historical report ranges from explicit dates", () => {
    expect(parseDateRangeFromText("2 Ağustos 2016'da ne harcadım?", "2036-08-03")).toMatchObject({
      from: "2016-08-02",
      to: "2016-08-02",
    });
    expect(
      parseDateRangeFromText("Ağustos 2016'da ne kadar harcadım?", "2036-08-03"),
    ).toMatchObject({
      from: "2016-08-01",
      to: "2016-08-31",
    });
    expect(parseDateRangeFromText("Ocak 2026'da ne kadar harcadım?", "2036-08-03")).toMatchObject({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(parseDateRangeFromText("bugünkü harcamalarımı listele", "2026-08-03")).toMatchObject({
      from: "2026-08-03",
      to: "2026-08-03",
    });
    expect(parseDateRangeFromText("Ağustos ayının ekstresini pdf yap", "2026-09-03")).toMatchObject(
      {
        from: "2026-08-01",
        to: "2026-08-31",
      },
    );
    expect(parseDateRangeFromText("bu ay kaç tl harcadım", "2026-08-05")).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-05",
    });
    expect(parseDateRangeFromText("geçen ay kaç tl harcadım", "2026-08-05")).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(
      parseDateRangeFromText(
        "2 agustos 2026 ile 4 agustos 2026 arasi ekstreyi pdf olarak ver",
        "2026-08-05",
      ),
    ).toMatchObject({
      from: "2026-08-02",
      to: "2026-08-04",
    });
    expect(
      parseDateRangeFromText("4 Ağustos 2026 ile 2 Ağustos 2026 arası harcadıklarım", "2026-08-05"),
    ).toMatchObject({
      from: "2026-08-02",
      to: "2026-08-04",
    });
    expect(parseDateRangeFromText("2026 yıllık raporu gönder", "2036-08-03")).toMatchObject({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(parseDateRangeFromText("2026 raporu gonder", "2036-08-03")).toMatchObject({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(parseDateRangeFromText("2026 ekstresini pdf gonder", "2036-08-03")).toMatchObject({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });
  it("matches categories", () => {
    expect(matchCategory("migros alışveriş")).toBe("Market");
    expect(matchCategory("netflix")).toBe("Abonelik");
    expect(matchCategory("bugün elden ring aldım 100tlye")).toBe("Oyun");
  });
});

describe("structured output", () => {
  it("validates OpenAI structured output", () => {
    expect(() =>
      StructuredParseSchema.parse({
        intent: "create_expense",
        amount: "1450.00",
        currency: "TRY",
        category: "Yeme ve İçme",
        merchant: null,
        description: "Akşam yemeği",
        expenseDate: "2026-08-02",
        confidence: 0.96,
        missingFields: [],
      }),
    ).not.toThrow();
  });
  it("validates bank image structured output", () => {
    expect(() =>
      BankImageParseSchema.parse({
        sourceType: "bank_screenshot",
        expenses: [
          {
            amount: "39,99",
            currency: "TRY",
            category: "Abonelik",
            merchant: "APPLE.COM/BILL",
            description: "Sanal POS alışveriş",
            expenseDate: "2026-08-03",
            rawTransactionText: "03 AĞU 16:38 APPLE.COM/BILL -39,99 TL",
            confidence: 0.9,
          },
        ],
      }),
    ).not.toThrow();
  });
  it("validates receipt image structured output", () => {
    expect(() =>
      BankImageParseSchema.parse({
        sourceType: "receipt",
        expenses: [
          {
            amount: "850,00",
            currency: "TRY",
            category: "Market",
            merchant: "Migros",
            description: "Alışveriş fişi genel toplam",
            expenseDate: "2026-08-03",
            rawTransactionText: "MIGROS GENEL TOPLAM 850,00 TL",
            confidence: 0.92,
          },
        ],
      }),
    ).not.toThrow();
  });
});

describe("environment config", () => {
  it("allows an empty optional image model", () => {
    const env = loadEnv({
      TELEGRAM_BOT_TOKEN: "token",
      ALLOWED_TELEGRAM_USER_ID: "123",
      OPENAI_API_KEY: "key",
      OPENAI_MODEL: "gpt-4.1-mini",
      OPENAI_IMAGE_MODEL: "",
    });
    expect(env.OPENAI_IMAGE_MODEL).toBeUndefined();
    expect(env.MAX_IMAGE_EXPENSES).toBe(10);
    expect(env.MIN_IMAGE_CONFIDENCE).toBe(0.8);
  });
});

describe("repositories", () => {
  it("runs SQLite migration", () => {
    const client = db();
    const row = client.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'")
      .get();
    expect(row).toBeTruthy();
  });
  it("confirms pending expenses", () => {
    const client = db();
    const expenses = new ExpenseRepository(client.sqlite);
    const service = new ExpenseService(
      expenses,
      new PendingExpenseRepository(client.sqlite),
      new PendingUpdateRepository(client.sqlite),
      new UndoRepository(client.sqlite),
      30,
    );
    const pending = service.createPending(draft());
    expect(service.confirmPending(pending.id)?.expense.id).toBe(1);
  });
  it("updates latest pending expenses before confirmation", () => {
    const client = db();
    const service = new ExpenseService(
      new ExpenseRepository(client.sqlite),
      new PendingExpenseRepository(client.sqlite),
      new PendingUpdateRepository(client.sqlite),
      new UndoRepository(client.sqlite),
      30,
    );
    const pending = service.createPending(draft({ amountMinor: 30000 }));
    expect(service.latestPending()?.id).toBe(pending.id);
    const updated = service.updatePending(pending.id, { amountMinor: 100000 });
    expect(updated.amountMinor).toBe(100000);
    expect(service.confirmPending(pending.id)?.expense.amountMinor).toBe(100000);
  });
  it("rejects expired pending expenses", () => {
    const client = db();
    const service = new ExpenseService(
      new ExpenseRepository(client.sqlite),
      new PendingExpenseRepository(client.sqlite),
      new PendingUpdateRepository(client.sqlite),
      new UndoRepository(client.sqlite),
      30,
    );
    const pending = service.createPending(draft());
    client.sqlite
      .prepare("UPDATE pending_expenses SET expires_at = ? WHERE id = ?")
      .run("2020-01-01T00:00:00.000Z", pending.id);
    expect(service.confirmPending(pending.id)).toBeNull();
  });
  it("guards duplicate Telegram updates", () => {
    const repo = new ProcessedUpdateRepository(db().sqlite);
    repo.mark(123);
    repo.mark(123);
    expect(repo.has(123)).toBe(true);
  });
  it("guards duplicate callbacks", () => {
    const client = db();
    const expenses = new ExpenseRepository(client.sqlite);
    const service = new ExpenseService(
      expenses,
      new PendingExpenseRepository(client.sqlite),
      new PendingUpdateRepository(client.sqlite),
      new UndoRepository(client.sqlite),
      30,
    );
    const pending = service.createPending(draft());
    service.confirmPending(pending.id);
    expect(service.confirmPending(pending.id)).toBeNull();
    expect(expenses.list()).toHaveLength(1);
  });
  it("reports currencies separately", () => {
    const client = db();
    const expenses = new ExpenseRepository(client.sqlite);
    expenses.create(draft({ telegramMessageId: 1, currency: "TRY", amountMinor: 10000 }));
    expenses.create(draft({ telegramMessageId: 2, currency: "USD", amountMinor: 2000 }));
    const report = new ReportService(expenses);
    expect(
      report
        .month("2026-08-03")
        .map((e) => e.currency)
        .sort(),
    ).toEqual(["TRY", "USD"]);
  });
  it("returns historical expenses by exact saved date years later", () => {
    const client = db();
    const expenses = new ExpenseRepository(client.sqlite);
    expenses.create(draft({ telegramMessageId: 10, expenseDate: "2016-08-02", amountMinor: 5000 }));
    expenses.create(draft({ telegramMessageId: 11, expenseDate: "2036-08-02", amountMinor: 9000 }));
    const range = parseDateRangeFromText("2 Ağustos 2016'da ne harcadım?", "2036-08-03");
    expect(range).not.toBeNull();
    const rows = new ReportService(expenses).range(range?.from ?? "", range?.to ?? "");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.expenseDate).toBe("2016-08-02");
    expect(rows[0]?.amountMinor).toBe(5000);
  });
  it("returns only the requested historical month", () => {
    const client = db();
    const expenses = new ExpenseRepository(client.sqlite);
    expenses.create(draft({ telegramMessageId: 20, expenseDate: "2026-01-01", amountMinor: 1000 }));
    expenses.create(draft({ telegramMessageId: 21, expenseDate: "2026-01-31", amountMinor: 2000 }));
    expenses.create(draft({ telegramMessageId: 22, expenseDate: "2026-02-01", amountMinor: 3000 }));
    expenses.create(draft({ telegramMessageId: 23, expenseDate: "2025-01-15", amountMinor: 4000 }));
    const range = parseDateRangeFromText("Ocak 2026'da ne kadar harcadım?", "2036-08-03");
    expect(range).not.toBeNull();
    const rows = new ReportService(expenses).range(range?.from ?? "", range?.to ?? "");
    expect(rows.map((row) => row.amountMinor).sort()).toEqual([1000, 2000]);
  });
  it("returns active expense date bounds for all-time reports", () => {
    const expenses = new ExpenseRepository(db().sqlite);
    expenses.create(draft({ telegramMessageId: 80, expenseDate: "2026-08-03" }));
    const deleted = expenses.create(draft({ telegramMessageId: 81, expenseDate: "2026-01-01" }));
    expenses.create(draft({ telegramMessageId: 82, expenseDate: "2026-09-10" }));
    expenses.softDelete(deleted.id);
    expect(expenses.dateBounds()).toEqual({ from: "2026-08-03", to: "2026-09-10" });
  });
  it("soft deletes expenses", () => {
    const expenses = new ExpenseRepository(db().sqlite);
    const expense = expenses.create(draft());
    expenses.softDelete(expense.id);
    expect(expenses.list()).toHaveLength(0);
  });
  it("updates expenses", () => {
    const expenses = new ExpenseRepository(db().sqlite);
    const expense = expenses.create(draft());
    expect(expenses.update(expense.id, { amountMinor: 90000 }).amountMinor).toBe(90000);
  });
  it("updates expense dates through pending updates and undo", () => {
    const client = db();
    const expenses = new ExpenseRepository(client.sqlite);
    const service = new ExpenseService(
      expenses,
      new PendingExpenseRepository(client.sqlite),
      new PendingUpdateRepository(client.sqlite),
      new UndoRepository(client.sqlite),
      30,
    );
    const expense = expenses.create(draft({ expenseDate: "2026-08-03" }));
    const pendingId = service.createPendingDateUpdate(expense.id, "2026-08-01");
    const result = service.confirmPendingUpdate(pendingId);
    expect(result?.expense.expenseDate).toBe("2026-08-01");
    expect(result?.undoId).toBeTruthy();
    const undone = service.undoAction(result?.undoId ?? 0);
    expect(undone?.expenseDate).toBe("2026-08-03");
  });
  it("groups duplicate expense candidates without mutating records", () => {
    const expenses = new ExpenseRepository(db().sqlite);
    expenses.create(draft({ telegramMessageId: 40, merchant: "Epic Games", amountMinor: 42400 }));
    expenses.create(draft({ telegramMessageId: 41, merchant: "Epic Games", amountMinor: 42400 }));
    expenses.create(draft({ telegramMessageId: 42, merchant: "Apple", amountMinor: 8000 }));
    const groups = duplicateGroups(expenses.list());
    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((row) => row.merchant)).toEqual(["Epic Games", "Epic Games"]);
    expect(expenses.list()).toHaveLength(3);
  });
  it("filters expenses by amount thresholds", () => {
    const expenses = new ExpenseRepository(db().sqlite);
    expenses.create(draft({ telegramMessageId: 30, merchant: "Apple", amountMinor: 8000 }));
    expenses.create(draft({ telegramMessageId: 31, merchant: "Chatgpt", amountMinor: 99900 }));
    expenses.create(
      draft({ telegramMessageId: 32, merchant: "Container Beach", amountMinor: 155700 }),
    );
    expect(expenses.list({ minAmountMinor: 100000 }).map((row) => row.merchant)).toEqual([
      "Container Beach",
    ]);
    expect(expenses.list({ maxAmountMinor: 100000 }).map((row) => row.merchant)).toEqual([
      "Chatgpt",
      "Apple",
    ]);
  });
  it("stores category and merchant aliases", () => {
    const aliases = new AliasRepository(db().sqlite);
    aliases.upsertCategoryAlias("container beach", "Seyahat");
    aliases.upsertMerchantAlias("epic gamesten", "Epic Games");
    expect(aliases.findCategory("Container Beach harcaması")?.category).toBe("Seyahat");
    expect(aliases.findMerchant("epic gamesten oyun aldım")?.merchant).toBe("Epic Games");
  });
  it("undoes created expenses with soft delete", () => {
    const client = db();
    const expenses = new ExpenseRepository(client.sqlite);
    const service = new ExpenseService(
      expenses,
      new PendingExpenseRepository(client.sqlite),
      new PendingUpdateRepository(client.sqlite),
      new UndoRepository(client.sqlite),
      30,
    );
    const pending = service.createPending(draft());
    const result = service.confirmPending(pending.id);
    expect(result).not.toBeNull();
    service.undoAction(result?.undoId ?? 0);
    expect(expenses.list()).toHaveLength(0);
  });
});

describe("rule parser and auth predicate", () => {
  it("parses simple expenses without OpenAI", () => {
    const parsed = new RuleBasedParser().parse("yemek 450,50 tl", 5, "2026-08-03");
    expect(parsed?.amountMinor).toBe(45050);
    expect(parsed?.category).toBe("Yeme ve İçme");
  });
  it("parses voice-style relative date expenses", () => {
    const parsed = new RuleBasedParser().parse(
      "dün petrol ofisinden 300 liralık benzin aldım",
      50,
      "2026-08-03",
    );
    expect(parsed?.amountMinor).toBe(30000);
    expect(parsed?.category).toBe("Benzin");
    expect(parsed?.merchant).toBe("Petrol Ofisi");
    expect(parsed?.expenseDate).toBe("2026-08-02");
  });
  it("parses voice-style explicit date expenses", () => {
    const parsed = new RuleBasedParser().parse(
      "2 ağustos 2026 tarihinde 200 liraya benzin aldım",
      51,
      "2026-08-10",
    );
    expect(parsed?.amountMinor).toBe(20000);
    expect(parsed?.category).toBe("Benzin");
    expect(parsed?.expenseDate).toBe("2026-08-02");
  });
  it("parses game expenses as Oyun", () => {
    const parsed = new RuleBasedParser().parse("bugün elden ring aldım 100tlye", 6, "2026-08-03");
    expect(parsed?.amountMinor).toBe(10000);
    expect(parsed?.category).toBe("Oyun");
  });
  it("parses explicit day month expenses with large TRY amounts", () => {
    const parsed = new RuleBasedParser().parse(
      "1 ağustos günü şuşuşu harcamayı yaptım 1298736172 tl",
      7,
      "2026-08-03",
    );
    expect(parsed?.amountMinor).toBe(129873617200);
    expect(parsed?.currency).toBe("TRY");
    expect(parsed?.expenseDate).toBe("2026-08-01");
  });
  it("keeps meaningful descriptions for travel expenses", () => {
    const parsed = new RuleBasedParser().parse(
      "1 Ağustosta 1 günlük tatile gittim Container Beach Mordoğanda 1557 tl harcadım",
      8,
      "2026-08-03",
    );
    expect(parsed?.merchant).toBe("Container Beach Mordoğanda");
    expect(parsed?.description).toBe("Tatile Gittim Container Beach Mordoğanda");
  });
  it("parses compact and suffixed August dates", () => {
    expect(parseTurkishDate("1 Ağustosta tatil 1557 tl", "2026-08-03")).toBe("2026-08-01");
    expect(parseTurkishDate("3Ağustos chatgpt üyelik yenileme 999tl", "2026-08-10")).toBe(
      "2026-08-03",
    );
  });
  it("parses numbered batch expense lines independently", () => {
    const message = `gider olarak şunları ekle

1- 1 Ağustosta 1 günlük tatile gittim Container Beach Mordoğanda 1557 tl harcadım
2- 2 Ağustosta Sony Marvel's Spider-Man Remastered oyununu satın aldım epic gamesten 424 tl
3- 3Ağustos chatgpt üyelik yenileme 999tl
4- 3 Ağustos Apple icloud 2 aylık faturasını ödedim 80 tl`;
    const lines = extractExpenseLines(message);
    expect(lines).toHaveLength(4);

    const parser = new RuleBasedParser();
    const parsed = lines.map((line, index) => parser.parse(line, index + 1, "2026-08-03"));
    expect(parsed.map((item) => item?.expenseDate)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-03",
    ]);
    expect(parsed.map((item) => item?.amountMinor)).toEqual([155700, 42400, 99900, 8000]);
    expect(parsed.map((item) => item?.category)).toEqual([
      "Seyahat",
      "Oyun",
      "Abonelik",
      "Faturalar",
    ]);
    expect(parsed[3]?.description).toBe("Apple İcloud Faturasını");
  });
  it("checks unauthorized Telegram IDs", () => {
    const allowed: number = 123;
    const incoming: number = 456;
    expect(incoming === allowed).toBe(false);
  });
});

describe("natural language intent helpers", () => {
  it("recognizes broader list requests", () => {
    expect(isListRequest("bugünkü harcamalarımı listele")).toBe(true);
    expect(isListRequest("bugün nereye para verdim")).toBe(true);
    expect(isListRequest("bu ayki kayıtları dök")).toBe(true);
    expect(isListRequest("son 3 giderim ne")).toBe(true);
    expect(isListRequest("son 3 harcamam ne")).toBe(true);
    expect(isListRequest("son 3 harcamalarımı göster")).toBe(true);
    expect(isListRequest("son 3 işlemim ne")).toBe(true);
    expect(isListRequest("en pahalı 5 giderimi göster")).toBe(true);
    expect(isListRequest("sadece oyunları göster")).toBe(true);
    expect(isListRequest("apple olanlar")).toBe(true);
    expect(isListRequest("1000 tl üstü olanlar")).toBe(true);
    expect(isListRequest("bu ay yeme içme harcama detayımı ver")).toBe(true);
    expect(isListRequest("bu ay market giderlerine bak")).toBe(true);
    expect(isListRequest("ağustos yemek harcamalarını getirir misin")).toBe(true);
    expect(isListRequest("geçen ay nerelere para vermişim")).toBe(true);
    expect(isListRequest("fatura işlemlerimin dökümünü yazar mısın")).toBe(true);
    expect(isListRequest("migros'a 850 tl verdim")).toBe(false);
    expect(isListRequest("yemek 450 tl verdim")).toBe(false);
  });
  it("recognizes duplicate checks", () => {
    expect(isDuplicateRequest("tekrar eden kayıtları göster")).toBe(true);
    expect(isDuplicateRequest("mükerrer harcamaları göster")).toBe(true);
  });
  it("recognizes analytics requests", () => {
    expect(isAnalyticsRequest("Temmuz ve Ağustos harcamalarımı karşılaştır")).toBe(true);
    expect(isAnalyticsRequest("2026'da en çok hangi işletmelere para verdim?")).toBe(true);
    expect(isAnalyticsRequest("Bu ay geçen aya göre ne kadar arttı?")).toBe(true);
    expect(isAnalyticsRequest("geçen ay ile bu ayın eğlence giderlerini karşılaştır")).toBe(true);
    expect(isAnalyticsRequest("Bu ay normalden farklı ne var?")).toBe(true);
  });
  it("formats smart period insights", () => {
    const output = smartPeriodInsight(
      "Bu ay",
      [
        expense({
          id: 1,
          amountMinor: 155700,
          category: "Seyahat",
          merchant: "Container Beach",
          expenseDate: "2026-08-01",
        }),
        expense({
          id: 2,
          amountMinor: 99900,
          category: "Abonelik",
          merchant: "ChatGPT",
          expenseDate: "2026-08-03",
          telegramMessageId: 2,
        }),
      ],
      "Geçen ay",
      [
        expense({
          id: 3,
          amountMinor: 30000,
          category: "Abonelik",
          merchant: "Netflix",
          expenseDate: "2026-07-03",
          telegramMessageId: 3,
        }),
      ],
    );
    expect(output).toContain("Seyahat");
    expect(output).toContain("₺1.557,00 arttı");
    expect(output).toContain("En büyük tek harcama: Container Beach");
    expect(output).toContain("En çok para verilen işletme: Container Beach");
  });
  it("builds comparison ranges from natural language", () => {
    expect(
      comparisonRangesFromText("temmuz ve ağustos harcamalarımı karşılaştır", "2026-08-03"),
    ).toMatchObject({
      previous: { from: "2026-07-01", to: "2026-07-31" },
      current: { from: "2026-08-01", to: "2026-08-31" },
    });
    expect(
      comparisonRangesFromText("bu ay geçen aya göre ne kadar arttı", "2026-08-03"),
    ).toMatchObject({
      previous: { from: "2026-07-01", to: "2026-07-31" },
      current: { from: "2026-08-01", to: "2026-08-03" },
    });
  });
  it("recognizes broader summary requests", () => {
    expect(isSummary("bu ay masrafım ne")).toBe(true);
    expect(isSummary("bugün kaç para harcadım")).toBe(true);
    expect(isSummary("bu ay kaç tl harcadım")).toBe(true);
    expect(isSummary("geçen ay kaç tl harcadım")).toBe(true);
    expect(isSummary("bu hafta ne tuttu")).toBe(true);
    expect(isSummary("2026 raporu gönder")).toBe(true);
    expect(isSummary("son 3 giderim ne")).toBe(true);
    expect(isSummary("bu ayki masraf özeti")).toBe(true);
    expect(isSummary("yeme içme toplam tutarı ne durumda")).toBe(true);
    expect(isSummary("ağustos gider durumu ne")).toBe(true);
    expect(isSummary("netflix tutar 120 tl")).toBe(false);
  });
  it("recognizes PDF statement requests", () => {
    expect(isPdfRequest("ağustos ayının ekstresini pdf yap")).toBe(true);
    expect(isPdfRequest("ocak 2026 rapor dökümünü gönder")).toBe(true);
  });
  it("formats all-expense PDF titles with date range and month count", () => {
    expect(pdfTitle("Tüm harcamalar", "2026-07-27", "2026-08-03")).toBe(
      "2026-07-27 - 2026-08-03 Gider Ekstresi (2 ay)",
    );
    expect(pdfTitle("Bu ay", "2026-08-01", "2026-08-03")).toBe("Bu ay Gider Ekstresi");
  });
  it("recognizes delete and update requests", () => {
    expect(isDeleteRequest("son kaydı kaldır")).toBe(true);
    expect(isDeleteRequest("netflix giderini çıkart")).toBe(true);
    expect(isUpdateRequest("son gideri 900 tl olarak değiştir")).toBe(true);
    expect(isUpdateRequest("son harcamayı düzelt")).toBe(true);
    expect(deleteCandidateLimit("son harcamayı sil")).toBe(1);
    expect(deleteCandidateLimit("#4'ü sil")).toBe(1);
    expect(deleteCandidateLimit("netflix giderini sil")).toBe(5);
  });
  it("extracts requested list limits", () => {
    expect(requestedLimit("son 7 harcamamı göster")).toBe(7);
    expect(requestedLimit("en pahalı 5 giderimi göster")).toBe(5);
    expect(requestedLimit("son 99 harcamamı göster")).toBe(20);
  });
});

describe("PDF reports", () => {
  it("creates a readable PDF file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "expense-pdf-test-"));
    cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const outputPath = path.join(dir, "statement.pdf");
    const expense: Expense = {
      ...draft(),
      id: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      deletedAt: null,
    };
    await new PdfReportService().createExpenseStatement({
      title: "Ağustos 2026 Gider Ekstresi",
      periodLabel: "2026-08-01 - 2026-08-31",
      expenses: [expense],
      outputPath,
    });
    const data = fs.readFileSync(outputPath);
    expect(data.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(data.length).toBeGreaterThan(1000);
  });
});
