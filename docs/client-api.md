# Future Atlas client guide

The client usage document to send is [client-usage.md](client-usage.md). This file is the same API contract.

This is the guide for connecting your website to Future Atlas. It covers the tools a student sees, the questions and options on each tool, the API call that turns those answers into a result, and the guidance form that is saved in Zoho Forms.

Each successful AI answer costs **1 credit** from the shared pool. That includes a tool result and a bot chat reply. The response includes `creditsRemaining`.

## Get your API key in the website

Future Atlas does not publish a shared key. Create your own on the **API keys** page. The complete key is shown once.

1. Open the Future Atlas website.
2. Click the key icon in the top bar.
3. Sign in with the email we added for you, if you are not already signed in.
4. Click **+ Create API key**.
5. Enter a name, choose an expiration (Never, 30 days, 90 days, 1 year, or a custom date), and enter the website origins that may call the API. One origin per line. An origin is the scheme and host only, such as `https://www.example.com`.
6. Click **Create API key** and copy the key immediately. It cannot be shown again. If you lose it, create a new key.

**Revoke** stops a key. **Replace** issues a new key and stops the old one. Up to 10 keys can be active. Later visits show only a masked prefix, not the full key.

## How a tool works

1. The student answers one question at a time by choosing an option.
2. If the option list is longer than four, the screen shows the first four and a **More** button for the rest.
3. Choosing **Other** opens a text box. The text they type is sent. The word `Other` is not sent.
4. The last button sends the answers to the AI.
5. The AI result is shown on the same screen. Chat replies are shown in the chat panel.

Send this header on every AI call:

```http
POST /api/v1/ai
Content-Type: application/json
X-API-Key: <the key you copied from the API keys page>
X-Client-Origin: <one origin you entered when you created the key>
```

Tool calls use `"responseFormat": "structured"`. Chat calls leave that field out and send the student’s message instead.

One AI answer, whether it is a tool result or a chat reply, uses 1 credit. A failed answer does not.

## 1. Country Explorer

Page: `/countries`

The student picks a field, a budget, and a priority. The last button is **Find My Countries**. The screen then shows country cards: country code, name, match score, description, and tags.

| Step | Question | Options |
| --- | --- | --- |
| 1 | What would you like to study? | Computer Science, Business, Engineering, Medicine, Arts & Design, Other |
| 2 | What's your approximate study budget? | Under $15,000, $15,000 – $30,000, $30,000 – $50,000, No Preference, Other |
| 3 | What's your top priority? | Career & Jobs, PR Opportunities, Low Cost, Top Rankings, Scholarships, Other |

Request:

```json
{
  "mode": "country",
  "responseFormat": "structured",
  "message": "Recommend the best study-abroad countries for this student.",
  "inputs": {
    "study": "Computer Science",
    "budget": "No Preference",
    "priority": "Low Cost"
  }
}
```

Show `data.countries` on the screen. Each item has `name`, `code`, `score`, `description`, and `tags`.

Chat on this tool uses `"mode": "country"` and no `responseFormat`. Suggested prompts: “Which country is best for Computer Science?”, “I want an affordable country”, “Where can I work after graduation?”. Show `response` in the chat.

## 2. University Explorer

Page: `/universities`

The last button is **Find Universities**. The screen shows university cards: short name, name, location, country, match score, ranking, tuition, type, and highlights.

| Step | Question | Options |
| --- | --- | --- |
| 1 | What would you like to study? | Computer Science, Business & Management, Engineering, Medicine, Data Science & AI, Arts & Design, Other |
| 2 | Where would you like to study? | Germany, United Kingdom, United States, Canada, France, Ireland, Other |
| 3 | What's your approximate tuition budget? | Under $15,000 / year, $15,000 – $30,000 / year, $30,000 – $50,000 / year, No Preference, Other |

Request:

```json
{
  "mode": "university",
  "responseFormat": "structured",
  "message": "Recommend best-fit universities for this student's study preferences.",
  "inputs": {
    "study": "Computer Science",
    "country": "Germany",
    "budget": "No Preference"
  }
}
```

Show `data.universities`. Each item has `name`, `shortName`, `country`, `location`, `ranking`, `tuition`, `match`, `type`, and `highlights`.

Chat uses `"mode": "university"`. Suggested prompts: “Find universities for Computer Science”, “Show affordable universities in Germany”, “I have 75%. What universities can I target?”.

## 3. Scholarship Explorer

Page: `/scholarships`

The last button is **Find Scholarships**. The screen shows scholarship cards: provider, name, type, country, match score, funding amount, coverage, deadline, and tags. Amount, coverage, and deadline are reminders to check the official provider.

| Step | Question | Options |
| --- | --- | --- |
| 1 | Where do you want to study? | Germany, United Kingdom, United States, Canada, France, Ireland, Other |
| 2 | What would you like to study? | Computer Science & AI, Business & Management, Engineering, Medicine & Health, Data Science, Arts & Design, Other |
| 3 | What's your academic performance? | 90% or above, 80% – 89%, 70% – 79%, 60% – 69%, Below 60%, Other |

Request:

```json
{
  "mode": "scholarship",
  "responseFormat": "structured",
  "message": "Recommend suitable study-abroad scholarships or funding options.",
  "inputs": {
    "country": "Germany",
    "study": "Computer Science & AI",
    "academic": "80% – 89%"
  }
}
```

Show `data.scholarships`. Each item has `name`, `provider`, `country`, `amount`, `coverage`, `deadline`, `match`, `type`, and `tags`.

Chat uses `"mode": "scholarship"`. Suggested prompts: “Find scholarships for Master's students”, “What scholarships are available in Europe?”, “I need fully funded scholarships”.

## 4. Cost Calculator

Page: `/cost-calculator`

The last button is **Generate Estimate**. The screen shows tuition, accommodation, living expenses, insurance, visa, travel, other expenses, an estimated total, the budget they chose, and a short written analysis.

| Step | Question | Options |
| --- | --- | --- |
| 1 | Where are you planning to study? | Germany, France, United Kingdom, United States, Canada, Australia, Ireland, Netherlands, New Zealand, Italy, Spain, Sweden, Finland, Denmark, Norway, Switzerland, Belgium, Austria, Poland, Portugal, Japan, South Korea, Singapore, United Arab Emirates, Other |
| 2 | What level are you planning to study? | Bachelor's, Master's, MBA, PhD, Diploma / Certificate, Other |
| 3 | What do you want to study? | Computer Science / IT, Engineering, Business / Management, Data Science / AI, Healthcare / Medicine, Arts & Design, Other |
| 4 | What is your approximate annual budget? | Under ₹10 Lakhs, ₹10–20 Lakhs, ₹20–30 Lakhs, ₹30–50 Lakhs, Above ₹50 Lakhs, I'm not sure, Other |

Request:

```json
{
  "mode": "cost",
  "responseFormat": "structured",
  "message": "Generate a personalized study-abroad cost estimate from the user's inputs.",
  "inputs": {
    "country": "Germany",
    "studyLevel": "Master's",
    "course": "Computer Science / IT",
    "budget": "Under ₹10 Lakhs"
  }
}
```

Show `data` itself, not a list inside it. The fields are `country`, `course`, `studyLevel`, `tuition`, `accommodation`, `living`, `insurance`, `visa`, `travel`, `other`, `total`, `budget`, `budgetStatus.label`, `budgetStatus.description`, and `aiAnalysis`.

Chat uses `"mode": "cost"`. Suggested prompts: “Calculate the cost of studying in Germany”, “How much will a Master's in the UK cost?”, “Compare Germany and France”.

## 5. Eligibility Checker

Page: `/eligibility`

The last button is **Check My Eligibility**. The screen shows a score, a status, a summary, a breakdown of positive and caution points, and next steps.

| Step | Question | Options |
| --- | --- | --- |
| 1 | What would you like to study? | Computer Science & AI, Business & Management, Engineering, Medicine & Health, Data Science, Arts & Design, Other |
| 2 | Where are you planning to study? | Germany, United Kingdom, United States, Canada, France, Ireland, Other |
| 3 | What's your academic performance? | 90% or above, 80% – 89%, 70% – 79%, 60% – 69%, Below 60%, Other |
| 4 | What's your English proficiency? | IELTS 7.0+, IELTS 6.5, IELTS 6.0, IELTS below 6.0, I haven't taken a test yet, Other |
| 5 | What level do you want to study? | Bachelor's, Master's, PhD / Doctorate, Other |

Request:

```json
{
  "mode": "eligibility",
  "responseFormat": "structured",
  "message": "Create a preliminary study-abroad eligibility assessment for this student.",
  "inputs": {
    "study": "Computer Science & AI",
    "country": "Germany",
    "academic": "70% – 79%",
    "english": "IELTS 6.5",
    "level": "Master's"
  }
}
```

Show `data.score`, `data.status`, `data.summary`, `data.breakdown`, and `data.nextSteps`. Each breakdown item has `title`, `status` (`positive` or `caution`), and `description`.

Chat uses `"mode": "eligibility"`. Suggested prompts: “Can I study Computer Science in Germany?”, “I have 65%. Where can I apply?”, “Check my Master's eligibility”.

## 6. Study Abroad Mentor

This is the **Ask Future Atlas AI** chat on the homepage. It has no option list. The student types a question, the request is sent, and the reply is shown in the chat.

Suggested prompts: “Where should I start?”, “How do I choose a country?”, “What documents do I need?”.

```json
{
  "mode": "mentor",
  "message": "How do I choose a country?",
  "history": [
    { "role": "user", "content": "Where should I start?" },
    { "role": "model", "content": "Start with your course, budget, and what you want after graduation." }
  ]
}
```

Show `response`. `history` is optional. Keep only the latest 6 turns. Each item needs `role` of `user` or `model`, and `content`. A new reply costs 1 credit, including a repeated question.

## Response

A tool result looks like this:

```json
{
  "data": {},
  "mode": "country",
  "creditsRemaining": 4993,
  "requestId": "…"
}
```

A chat result looks like this:

```json
{
  "response": "The written answer to show in the chat.",
  "mode": "mentor",
  "creditsRemaining": 4992,
  "requestId": "…"
}
```

A failure looks like this:

```json
{
  "error": {
    "code": "FA_ORIGIN_FORBIDDEN",
    "message": "This website origin is not authorized for the API key.",
    "requestId": "…"
  }
}
```

| Code | Meaning |
| --- | --- |
| `FA_AUTH_REQUIRED` | The `X-API-Key` header is missing. |
| `FA_INVALID_API_KEY` | The key is wrong or revoked. |
| `FA_API_KEY_EXPIRED` | The key has passed its expiry date. |
| `FA_ORIGIN_FORBIDDEN` | `X-Client-Origin` is missing or is not on the key. |
| `FA_SANDBOX_EXHAUSTED` | The shared credits are used up. Ask us to refill them. `creditsRemaining` is 0. |
| `INVALID_REQUEST` | `mode` or `message` is missing, or the message is longer than 8,000 characters. |
| `INVALID_MODE` | `mode` is not one of the six tools. |
| `INVALID_RESPONSE_FORMAT` | `responseFormat` was sent as something other than `structured`. |
| `429` | More than 30 AI calls in one minute. Wait and retry. |

## Guidance form (Zoho Forms)

Page: `/guidance`

This form is separate from the AI tools. It does not use the API key and it does not spend credits. The answers are stored in the Zoho form **Study Abroad Application Form**.

```http
POST /api/guidance
Content-Type: application/json
```

| Field | Required | What the student enters | Stored in Zoho as |
| --- | --- | --- | --- |
| `firstName` | Yes | First name | Name, first |
| `lastName` | Yes | Last name | Name, last |
| `email` | Yes | Email address | Email |
| `phone` | Yes | Mobile number, up to 20 characters | Phone number |
| `educationLevel` | Yes | School, College, Undergraduate, Postgraduate, or Other | Education dropdown |
| `school` | Yes | Current or most recent school or college | School |
| `country` | No | Country they want to study in | Country |
| `university` | No | University they are interested in | University |
| `course` | No | Course or field of study | Course |
| `referrer` | No | The page URL they came from | Referrer |

A saved form returns `{ "ok": true }`. The screen then shows “Thank you” and the message that the details were submitted.
