import assert from "node:assert/strict";
import { getStructuredResult, isStructuredOutput, normalizeStructuredOutput } from "../lib/ai/structured-output.ts";
import { creditQuarters, secondsUntilKolkataMidnight } from "../lib/ai/credit-policy.ts";
import { normalizeOrigin } from "../lib/security/embed-utils.ts";

const country = { countries: [{ name: "Canada", code: "CA", score: 90, description: "Good fit.", tags: ["Research"] }] };
assert.equal(isStructuredOutput("country", country), true);
assert.deepEqual(getStructuredResult({ data: country }, "countries"), country.countries);

const cost = {
  tuition: "Varies", accommodation: "Varies", living: "Varies", insurance: "Varies",
  visa: "Varies", travel: "Varies", other: "Varies", total: "Varies", aiAnalysis: "Verify costs.",
  budgetStatus: { label: "Needs review", description: "Compare official estimates." },
};
assert.equal(isStructuredOutput("cost", cost), true);
assert.deepEqual(getStructuredResult({ data: cost }, "data"), cost);
assert.equal(isStructuredOutput("country", { countries: [{ name: "Missing fields" }] }), false);

const usaUniversity = { universities: [{ name: "Example", shortName: "EX", country: "USA", location: "Boston, USA", ranking: "Verify current ranking", tuition: "Check official tuition page", match: 80, type: "University", highlights: ["Example"] }] };
normalizeStructuredOutput("university", usaUniversity, { country: "United States" });
assert.equal(usaUniversity.universities.length, 1);

assert.equal(creditQuarters("mentor", { response: "x".repeat(400) }), 1);
assert.equal(creditQuarters("mentor", { response: "x".repeat(401) }), 2);
assert.equal(creditQuarters("mentor", { response: "x".repeat(901) }), 3);
assert.equal(creditQuarters("mentor", { response: "x".repeat(1601) }), 4);
assert.equal(creditQuarters("country"), 4);
assert.equal(secondsUntilKolkataMidnight(Date.UTC(2026, 0, 1, 18, 29, 30)), 30);
assert.equal(normalizeOrigin("https://client.example/path"), "https://client.example");
assert.equal(normalizeOrigin("http://client.example"), null);
assert.equal(normalizeOrigin("http://localhost:3000/path"), "http://localhost:3000");

console.log("Structured AI contracts passed.");
