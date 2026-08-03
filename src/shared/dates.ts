import { ValidationError } from "./errors.js";

const MONTHS: Record<string, number> = {
  ocak: 1,
  şubat: 2,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayıs: 5,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  ağustos: 8,
  agustos: 8,
  eylül: 9,
  eylul: 9,
  ekim: 10,
  kasım: 11,
  kasim: 11,
  aralık: 12,
  aralik: 12,
};
const WEEKDAYS: Record<string, number> = {
  pazartesi: 1,
  salı: 2,
  sali: 2,
  çarşamba: 3,
  carsamba: 3,
  perşembe: 4,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
  pazar: 0,
};

export function todayInTimezone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function parseTurkishDate(text: string, todayIso: string): string {
  const lower = text.toLocaleLowerCase("tr-TR");
  const explicitDate = parseExplicitDate(lower, todayIso);
  if (explicitDate) return explicitDate;

  if (lower.includes("önceki gün") || lower.includes("onceki gun")) return addDays(todayIso, -2);
  if (lower.includes("dün") || lower.includes("dun")) return addDays(todayIso, -1);
  if (lower.includes("bugün") || lower.includes("bugun")) return todayIso;

  const weekdayDate = parseRelativeWeekday(lower, todayIso);
  return weekdayDate ?? todayIso;
}

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

export function parseDateRangeFromText(text: string, todayIso: string): DateRange | null {
  const lower = text.toLocaleLowerCase("tr-TR");
  const explicitDate = parseExplicitDate(lower, todayIso);
  if (explicitDate) {
    return { from: explicitDate, to: explicitDate, label: formatDateTr(explicitDate) };
  }

  const month = lower.match(
    /\b([a-zçğıöşü]+)\s+(20\d{2})(?:'?(?:de|da|te|ta|nin|nın|nun|nün))?\b/u,
  );
  if (month?.[1] && month[2] && MONTHS[month[1]] !== undefined) {
    const from = assertValidDate(`${month[2]}-${String(MONTHS[month[1]]).padStart(2, "0")}-01`);
    return { from, to: endOfMonth(from), label: `${capitalize(month[1])} ${month[2]}` };
  }

  const monthWithoutYear = lower.match(
    /\b([a-zçğıöşü]+)\s+ay(?:ında|inin|ının|unun|ünün|ı|i|u|ü)?\b/u,
  );
  if (monthWithoutYear?.[1] && MONTHS[monthWithoutYear[1]] !== undefined) {
    const year = todayIso.slice(0, 4);
    const from = assertValidDate(
      `${year}-${String(MONTHS[monthWithoutYear[1]]).padStart(2, "0")}-01`,
    );
    return { from, to: endOfMonth(from), label: `${capitalize(monthWithoutYear[1])} ${year}` };
  }

  const yearOnly = lower.match(
    /\b(20\d{2})(?:'?(?:de|da|te|ta)|\s+(?:yıllık|yillik|raporu|raporunu|ekstresi|ekstresini|dökümü|dokumu|pdf))\b/u,
  );
  if (yearOnly?.[1]) {
    return {
      from: `${yearOnly[1]}-01-01`,
      to: `${yearOnly[1]}-12-31`,
      label: `${yearOnly[1]} Yılı`,
    };
  }

  if (lower.includes("önceki gün") || lower.includes("onceki gun")) {
    const date = addDays(todayIso, -2);
    return { from: date, to: date, label: formatDateTr(date) };
  }
  if (lower.includes("dün") || lower.includes("dun")) {
    const date = addDays(todayIso, -1);
    return { from: date, to: date, label: formatDateTr(date) };
  }
  if (lower.includes("bugün") || lower.includes("bugun")) {
    return { from: todayIso, to: todayIso, label: formatDateTr(todayIso) };
  }
  if (lower.includes("hafta")) {
    return { from: startOfWeek(todayIso), to: todayIso, label: "Bu hafta" };
  }
  if (lower.includes("geçen ay") || lower.includes("gecen ay")) {
    const currentYear = Number(todayIso.slice(0, 4));
    const currentMonth = Number(todayIso.slice(5, 7));
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const year = currentMonth === 1 ? currentYear - 1 : currentYear;
    const from = `${year}-${String(previousMonth).padStart(2, "0")}-01`;
    return { from, to: endOfMonth(from), label: "Geçen ay" };
  }
  if (lower.includes("ay")) {
    return { from: startOfMonth(todayIso), to: todayIso, label: "Bu ay" };
  }
  return null;
}

function parseExplicitDate(lower: string, todayIso: string): string | null {
  const iso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso?.[1] && iso[2] && iso[3]) return assertValidDate(`${iso[1]}-${iso[2]}-${iso[3]}`);

  const dotted = lower.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (dotted?.[1] && dotted[2] && dotted[3]) {
    return assertValidDate(
      `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`,
    );
  }

  const named = lower.match(/\b(\d{1,2})\s*([a-zçğıöşü']+)(?:\s+(20\d{2}))?\b/u);
  const namedMonth = named?.[2] ? monthNumber(named[2]) : null;
  if (named?.[1] && namedMonth !== null) {
    const year = named[3] ?? todayIso.slice(0, 4);
    return assertValidDate(
      `${year}-${String(namedMonth).padStart(2, "0")}-${named[1].padStart(2, "0")}`,
    );
  }
  return null;
}

function parseRelativeWeekday(lower: string, todayIso: string): string | null {
  const week = lower.match(/\b(geçen|gecen|bu)\s+([a-zçğıöşü]+)\b/u);
  if (week?.[1] && week[2] && WEEKDAYS[week[2]] !== undefined) {
    const target = WEEKDAYS[week[2]];
    if (target === undefined) return todayIso;
    const current = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
    let diff = target - current;
    if (week[1] === "geçen" || week[1] === "gecen") {
      if (diff >= 0) diff -= 7;
    }
    return addDays(todayIso, diff);
  }
  return null;
}

export function startOfWeek(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  return addDays(dateIso, 1 - day);
}

export function startOfMonth(dateIso: string): string {
  return `${dateIso.slice(0, 8)}01`;
}

export function endOfMonth(dateIso: string): string {
  const year = Number(dateIso.slice(0, 4));
  const month = Number(dateIso.slice(5, 7));
  const date = new Date(Date.UTC(year, month, 0, 12));
  return date.toISOString().slice(0, 10);
}

export function formatDateTr(dateIso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

function assertValidDate(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateIso) {
    throw new ValidationError("Invalid date");
  }
  return dateIso;
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("tr-TR") + value.slice(1);
}

function monthNumber(raw: string): number | null {
  const normalized = raw
    .replace(/'/gu, "")
    .replace(/(nde|nda|de|da|te|ta|nın|nin|nun|nün|ı|i|u|ü)$/u, "");
  return MONTHS[normalized] ?? null;
}
