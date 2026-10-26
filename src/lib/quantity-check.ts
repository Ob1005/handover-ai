// A conservative check of literal durations and clock times in verified quotes.
// This does not establish semantic coverage, convert weeks to days, or infer scope.
const numberWords: Record<string, number> = {
  null: 0, en: 1, ett: 1, to: 2, tre: 3, fire: 4, fem: 5,
  seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10,
  elleve: 11, tolv: 12, tretten: 13, fjorten: 14, femten: 15,
  seksten: 16, sytten: 17, atten: 18, nitten: 19, tjue: 20,
  tretti: 30, førti: 40, femti: 50, seksti: 60, nitti: 90,
};

function quantities(text: string) {
  const normalized = text.normalize("NFC").toLocaleLowerCase("nb-NO");
  const values = new Set<string>();
  const amount = `(?:\\d+(?:[.,]\\d+)?|${Object.keys(numberWords).join("|")})`;
  const units = "virkedag(?:er)?|arbeidsdag(?:er)?|kalenderdag(?:er)?|dag(?:er)?|uke(?:r)?|time(?:r)?|minutt(?:er)?";
  const durations = new RegExp(`(?<![\\p{L}\\p{N}])(${amount})\\s+(${units})(?!\\p{L})`, "gu");
  for (const match of normalized.matchAll(durations)) {
    const value = numberWords[match[1]] ?? Number(match[1].replace(",", "."));
    const unit = /^(virke|arbeids)dag/.test(match[2]) ? "workday"
      : match[2].startsWith("kalenderdag") ? "calendar-day"
      : match[2].startsWith("dag") ? "day"
      : match[2].startsWith("uke") ? "week"
      : match[2].startsWith("time") ? "hour" : "minute";
    values.add(`${unit}:${value}`);
  }
  for (const match of normalized.matchAll(/\bkl\.?\s*(\d{1,2})[.:](\d{2})/gu)) {
    values.add(`clock:${Number(match[1])}:${match[2]}`);
  }
  return values;
}

export function checkQuantities(sourceQuote: string, handoverQuote: string | null, allowAdditional = false) {
  if (!handoverQuote) return "not_checked" as const;
  const expected = quantities(sourceQuote);
  if (!expected.size) return "not_checked" as const;
  const actual = quantities(handoverQuote);
  const units = new Set([...expected].map(value => value.split(":")[0]));
  return [...expected].every(value => actual.has(value)) &&
    (allowAdditional || [...actual].filter(value => units.has(value.split(":")[0])).every(value => expected.has(value)))
    ? "match" as const : "mismatch" as const;
}
