const studyTerms = [
  "Accounting", "Architecture", "Arts", "Australia", "Austria", "Bachelor's",
  "Belgium", "Biotechnology", "Business", "Canada", "Computer Science",
  "Data Science", "Dentistry", "Design", "Diploma", "Economics", "Education",
  "Engineering", "Finance", "Finland", "France", "Germany", "Healthcare",
  "Hospitality", "Ireland", "Italy", "Japan", "Law", "Management", "Marketing",
  "Mathematics", "Master's", "Medicine", "Netherlands", "New Zealand", "Nursing",
  "Norway", "Pharmacy", "PhD", "Physiotherapy", "Poland", "Portugal", "Psychology",
  "Public Health", "Scholarships", "Singapore", "South Korea", "Spain", "Sweden",
  "Switzerland", "United Arab Emirates", "United Kingdom", "United States", "Visa",
];

const studyKeywords = [
  "admission", "application", "bachelor", "budget", "campus", "college", "course",
  "degree", "diploma", "education", "english", "funding", "ielts", "master", "phd",
  "program", "scholarship", "school", "study", "toefl", "tuition", "university", "visa",
];

const blockedTerms = ["casino", "crypto", "dating", "gambling", "hack", "hate", "malware", "porn", "weapon"];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getDistance(a: string, b: string) {
  const costs = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let previous = costs[0];
    costs[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = costs[j];
      costs[j] = a[i - 1] === b[j - 1]
        ? previous
        : Math.min(costs[j - 1], costs[j], previous) + 1;
      previous = current;
    }
  }

  return costs[b.length];
}

function getAllowedDistance(value: string) {
  return Math.max(2, Math.min(5, Math.floor(value.length * 0.25)));
}

function getClosestTerm(value: string) {
  const normalizedValue = normalize(value);
  if (normalizedValue.length < 3) return null;

  return studyTerms
    .map((term) => ({ term, distance: getDistance(normalizedValue, normalize(term)) }))
    .sort((first, second) => first.distance - second.distance)[0];
}

function getCustomInputSuggestion(value: string) {
  const normalizedValue = normalize(value);
  const closest = getClosestTerm(value);

  if (!closest || closest.distance === 0 || closest.distance > getAllowedDistance(normalizedValue)) {
    return "";
  }

  return closest.term;
}

function getCustomInputError(value: string) {
  const trimmedValue = value.trim();
  const normalizedValue = normalize(trimmedValue);

  if (!trimmedValue) return "Enter a relevant study-abroad or education-related response.";
  if (trimmedValue.length < 2 || trimmedValue.length > 80) return "Keep your response between 2 and 80 characters.";
  if (blockedTerms.some((term) => normalizedValue.includes(term))) {
    return "Please enter a relevant education or study-abroad-related response.";
  }

  const hasStudyKeyword = studyKeywords.some((keyword) => normalizedValue.includes(keyword));
  const closest = getClosestTerm(trimmedValue);
  const matchesKnownTerm = Boolean(closest && closest.distance <= getAllowedDistance(normalizedValue));
  const looksAcademicOrBudgetRelated = /(\d+\s?%|ielts|toefl|pte|\$|usd|cad|aud|eur|gbp|inr|lakhs?|lakh|year|semester)/i.test(trimmedValue);
  const looksLikeCourseName = /^[a-z][a-z &/+-]{2,80}$/i.test(trimmedValue) && trimmedValue.trim().split(/\s+/).length <= 5;

  if (!hasStudyKeyword && !matchesKnownTerm && !looksAcademicOrBudgetRelated && !looksLikeCourseName) {
    return "Please enter something related to education or studying abroad.";
  }

  return "";
}

export function isCustomStudyInputValid(value: string) {
  return getCustomInputError(value) === "";
}

export function CustomOptionInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const error = getCustomInputError(value);
  const suggestion = getCustomInputSuggestion(value);

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100" />
      {suggestion && <button type="button" onClick={() => onChange(suggestion)} className="mt-2 text-xs font-medium text-violet-600 transition hover:text-violet-700">Did you mean {suggestion}?</button>}
      {value.trim() && error && <p className="mt-2 text-xs leading-5 text-rose-500">{error}</p>}
    </div>
  );
}
