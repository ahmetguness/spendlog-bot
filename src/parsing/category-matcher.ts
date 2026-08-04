import { CATEGORIES, type ExpenseCategory } from "../shared/constants.js";

const KEYWORDS: Array<[ExpenseCategory, string[]]> = [
  ["Market", ["migros", "a101", "bim", "şok", "sok", "market", "carrefour"]],
  [
    "Yeme ve İçme",
    ["restoran", "kahve", "yemek", "yeme", "içme", "icme", "kafe", "burger", "pizza"],
  ],
  ["Benzin", ["benzin", "mazot", "petrol", "shell", "opet", "bp"]],
  ["Ulaşım", ["taksi", "otobüs", "otobus", "metro", "izban", "ulaşım", "ulasim"]],
  [
    "Abonelik",
    ["netflix", "spotify", "youtube premium", "abonelik", "üyelik", "uyelik", "chatgpt", "openai"],
  ],
  [
    "Oyun",
    [
      "oyun",
      "steam",
      "elden ring",
      "playstation",
      "ps5",
      "ps4",
      "xbox",
      "nintendo",
      "game pass",
      "epic games",
      "ubisoft",
      "ea play",
    ],
  ],
  ["Eğlence", ["sinema", "konser", "tiyatro", "eglence", "eğlence"]],
  ["Faturalar", ["elektrik", "su", "doğalgaz", "dogalgaz", "internet", "fatura"]],
  ["Kira", ["kira"]],
  ["Sağlık", ["eczane", "doktor", "hastane", "sağlık", "saglik"]],
  ["Eğitim", ["kurs", "kitap", "eğitim", "egitim"]],
  [
    "Seyahat",
    ["otel", "uçak", "ucak", "seyahat", "tatil", "plaj", "beach", "mordoğan", "mordogan"],
  ],
  ["Teknoloji", ["telefon", "bilgisayar", "teknoloji"]],
  ["Ev", ["mobilya", "ev"]],
  ["Alışveriş", ["alışveriş", "alisveris", "giyim"]],
];

export function matchCategory(text: string): ExpenseCategory {
  const lower = text.toLocaleLowerCase("tr-TR");
  for (const [category, words] of KEYWORDS) {
    if (words.some((word) => lower.includes(word))) return category;
  }
  const direct = CATEGORIES.find((category) => lower.includes(category.toLocaleLowerCase("tr-TR")));
  return direct ?? "Diğer";
}
