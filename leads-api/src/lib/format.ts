type Translator = (key: string) => string;

const RU: Record<string, string> = {
  "term.months": "мес.",
  "term.year": "год",
  "term.years2": "года",
  "term.years5": "лет",
};

/** Human term: "240 мес. · 20 лет" (RU) / "240 ай · 20 жыл" (KK). */
export function formatTerm(months: number, t: Translator = (k) => RU[k] ?? k): string {
  const base = `${months} ${t("term.months")}`;
  const years = months / 12;
  if (months % 12 === 0 && years >= 1) {
    return `${base} · ${years} ${plural(years, t("term.year"), t("term.years2"), t("term.years5"))}`;
  }
  return base;
}

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
