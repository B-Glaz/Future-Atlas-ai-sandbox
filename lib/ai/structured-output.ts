import type { AIMode } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function texts(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.every(text);
}

function entries(value: unknown, fields: string[], listFields: string[] = [], numberFields: string[] = []) {
  return Array.isArray(value) && value.length > 0 && value.every((item) =>
    record(item) && fields.every((field) => text(item[field])) && listFields.every((field) => texts(item[field])) &&
    numberFields.every((field) => Number.isFinite(item[field]) && Number(item[field]) >= 0 && Number(item[field]) <= 100)
  );
}

function dedupeByName<T extends Record<string, unknown>>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.name || item.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countryRequested(inputs: unknown) {
  if (!record(inputs) || !text(inputs.country)) return "";
  return normalizeCountry(inputs.country);
}

function hasCountry(value: unknown, country: string) {
  return !country || normalizeCountry(value).includes(country);
}

const countryAliases: Record<string, string> = {
  "united states of america": "united states",
  "united states": "united states",
  usa: "united states",
  us: "united states",
  "united kingdom": "united kingdom",
  uk: "united kingdom",
  uae: "united arab emirates",
};

function normalizeCountry(value: unknown) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return countryAliases[normalized] || normalized;
}

export function normalizeStructuredOutput(mode: AIMode, value: Record<string, unknown>, inputs?: unknown) {
  if (mode === "university" && Array.isArray(value.universities)) {
    const requestedCountry = countryRequested(inputs);
    value.universities = dedupeByName(value.universities.filter(record))
      .filter((item) => hasCountry(item.country, requestedCountry) || hasCountry(item.location, requestedCountry))
      .map((item) => ({
        ...item,
        ranking: String(item.ranking || "").match(/#?\d/) ? "Verify current ranking" : item.ranking,
        tuition: String(item.tuition || "").match(/\d/) ? "Check official tuition page" : item.tuition,
      }));
  }

  if (mode === "country" && Array.isArray(value.countries)) value.countries = dedupeByName(value.countries.filter(record));
  if (mode === "scholarship" && Array.isArray(value.scholarships)) {
    value.scholarships = dedupeByName(value.scholarships.filter(record)).map((item) => ({
      ...item,
      amount: "Varies; check official provider",
      coverage: "Varies; check official provider",
      deadline: "Varies by programme/provider",
    }));
  }
  if (mode === "cost") {
    const source = record(inputs) ? inputs : {};
    value.country ||= source.country || "Selected country";
    value.course ||= source.course || source.study || "Selected course";
    value.studyLevel ||= source.studyLevel || source.level || "Selected level";
    value.budget ||= source.budget || "Selected budget";
    if (typeof value.aiAnalysis === "string") {
      value.aiAnalysis = value.aiAnalysis
        .replace(/€11,?300|11,?300 euros?/gi, "official current proof-of-funds amount")
        .replace(/up to 20 hrs?\/week/gi, "within the current student-work rules");
    }
  }

  if (mode === "eligibility" && Array.isArray(value.nextSteps)) {
    value.nextSteps = value.nextSteps.map((step) => String(step).replace(/\b(Fall|Spring|Summer|Winter)\s+20\d{2}\b/gi, "the next available intake"));
  }
  return value;
}

export function getStructuredResult(payload: Record<string, unknown>, resultKey: string) {
  const data = payload.data;
  if (!record(data)) return null;
  return resultKey === "data" ? data : data[resultKey] ?? null;
}

export function isStructuredOutput(mode: AIMode, value: unknown): value is Record<string, unknown> {
  if (!record(value)) return false;
  if (mode === "mentor") return text(value.response);
  if (mode === "country") return entries(value.countries, ["name", "code", "description"], ["tags"], ["score"]);
  if (mode === "university") return entries(value.universities, ["name", "shortName", "country", "location", "ranking", "tuition", "type"], ["highlights"], ["match"]);
  if (mode === "scholarship") return entries(value.scholarships, ["name", "provider", "country", "amount", "coverage", "deadline", "type"], ["tags"], ["match"]);
  if (mode === "eligibility") {
    return Number.isFinite(value.score) && text(value.status) && text(value.summary) &&
      entries(value.breakdown, ["title", "status", "description"]) &&
      (value.breakdown as Array<Record<string, unknown>>).every((item) => item.status === "positive" || item.status === "caution") && texts(value.nextSteps);
  }
  if (mode === "cost") {
    const fields = ["tuition", "accommodation", "living", "insurance", "visa", "travel", "other", "total", "aiAnalysis"];
    return fields.every((field) => text(value[field])) && record(value.budgetStatus) &&
      text(value.budgetStatus.label) && text(value.budgetStatus.description);
  }
  return false;
}
