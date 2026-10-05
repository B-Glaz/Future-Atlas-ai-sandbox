# Future Atlas — client usage

Use this document to run the Future Atlas tools on your site. A student answers the questions, those answers are sent to the AI, and the reply is shown on the screen.

Each finished AI answer costs **1 credit** from the shared pool. That includes a tool result and a bot chat reply. A failed answer does not cost a credit. The reply includes how many credits are left.

This sandbox has a test credit pool of 5,000.

## 1. Get your API key in the website

Future Atlas does not give you a shared key. You create your own in the website, and that key is shown once.

1. Open the Future Atlas website.
2. Click the key icon in the top bar. It opens the **API keys** page.
3. If you are not signed in, enter the email we added for you and sign in.
4. Click **+ Create API key**.
5. Enter a name, such as `Production API`.
6. Choose an expiration: Never, 30 days, 90 days, 1 year, or a custom date.
7. Under **Authorized website origins**, enter the website that will call the API. One origin per line. An origin is the scheme and host only, such as `https://www.example.com`, with no page path. For local testing you can use `http://localhost:3000`.
8. Click **Create API key**.
9. Copy the full key from the yellow box. You will not be able to see the complete key again. If you lose it, create a new one.

The page later shows only the name, a masked prefix, status, dates, and the origins you entered. **Revoke** stops a key. **Replace** creates a new key and stops the old one. You can have up to 10 active keys.

Send that key in the `X-API-Key` header. Send the same origin you entered in `X-Client-Origin`. A call from a website that is not on the key is rejected.

## 2. What happens on every tool

1. The student answers one question at a time by choosing an option.
2. When a question has more than four options, the screen shows the first four and a **More** button for the rest.
3. **Other** opens a text box. Send the text they type. Do not send the word `Other`.
4. The last button sends the answers to the AI.
5. The result is drawn on the same screen. A chat reply is drawn in the chat panel.

Every AI call:

```http
POST /api/v1/ai
Content-Type: application/json
X-API-Key: <the key you copied from the API keys page>
X-Client-Origin: <one origin you entered when you created the key>
```

For a tool, set `"responseFormat": "structured"` and send the selected answers in `inputs`.

For chat, leave `responseFormat` out and send the student's message.

## 3. Country Explorer

Page: `/countries`

Last button: **Find My Countries**

| Step | Question | Options |
| --- | --- | --- |
| 1 | What would you like to study? | Computer Science, Business, Engineering, Medicine, Arts & Design, Other |
| 2 | What's your approximate study budget? | Under $15,000, $15,000 – $30,000, $30,000 – $50,000, No Preference, Other |
| 3 | What's your top priority? | Career & Jobs, PR Opportunities, Low Cost, Top Rankings, Scholarships, Other |

The screen then shows country cards: country code, name, match score, description, and tags.

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

Show `data.countries`. Each card uses `name`, `code`, `score`, `description`, and `tags`.

Chat on this tool uses `"mode": "country"` and shows `response`. Suggested questions: “Which country is best for Computer Science?”, “I want an affordable country”, “Where can I work after graduation?”.

## 4. University Explorer

Page: `/universities`

Last button: **Find Universities**

| Step | Question | Options |
| --- | --- | --- |
| 1 | What would you like to study? | Computer Science, Business & Management, Engineering, Medicine, Data Science & AI, Arts & Design, Other |
| 2 | Where would you like to study? | Germany, United Kingdom, United States, Canada, France, Ireland, Other |
| 3 | What's your approximate tuition budget? | Under $15,000 / year, $15,000 – $30,000 / year, $30,000 – $50,000 / year, No Preference, Other |

The screen then shows university cards: short name, name, location, country, match score, ranking, tuition, type, and highlights.

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

Show `data.universities`. Each card uses `name`, `shortName`, `country`, `location`, `ranking`, `tuition`, `match`, `type`, and `highlights`.

Chat uses `"mode": "university"` and shows `response`. Suggested questions: “Find universities for Computer Science”, “Show affordable universities in Germany”, “I have 75%. What universities can I target?”.

## 5. Scholarship Explorer

Page: `/scholarships`

Last button: **Find Scholarships**

| Step | Question | Options |
| --- | --- | --- |
| 1 | Where do you want to study? | Germany, United Kingdom, United States, Canada, France, Ireland, Other |
| 2 | What would you like to study? | Computer Science & AI, Business & Management, Engineering, Medicine & Health, Data Science, Arts & Design, Other |
| 3 | What's your academic performance? | 90% or above, 80% – 89%, 70% – 79%, 60% – 69%, Below 60%, Other |

The screen then shows scholarship cards: provider, name, type, country, match score, funding amount, coverage, deadline, and tags. Tell the student to confirm amount, coverage, and deadline with the official provider.

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

Show `data.scholarships`. Each card uses `name`, `provider`, `country`, `amount`, `coverage`, `deadline`, `match`, `type`, and `tags`.

Chat uses `"mode": "scholarship"` and shows `response`. Suggested questions: “Find scholarships for Master's students”, “What scholarships are available in Europe?”, “I need fully funded scholarships”.

## 6. Cost Calculator

Page: `/cost-calculator`

Last button: **Generate Estimate**

| Step | Question | Options |
| --- | --- | --- |
| 1 | Where are you planning to study? | Germany, France, United Kingdom, United States, Canada, Australia, Ireland, Netherlands, New Zealand, Italy, Spain, Sweden, Finland, Denmark, Norway, Switzerland, Belgium, Austria, Poland, Portugal, Japan, South Korea, Singapore, United Arab Emirates, Other |
| 2 | What level are you planning to study? | Bachelor's, Master's, MBA, PhD, Diploma / Certificate, Other |
| 3 | What do you want to study? | Computer Science / IT, Engineering, Business / Management, Data Science / AI, Healthcare / Medicine, Arts & Design, Other |
| 4 | What is your approximate annual budget? | Under ₹10 Lakhs, ₹10–20 Lakhs, ₹20–30 Lakhs, ₹30–50 Lakhs, Above ₹50 Lakhs, I'm not sure, Other |

The screen then shows tuition, accommodation, living expenses, insurance, visa, travel, other expenses, an estimated total, the chosen budget, and a short written analysis.

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

Show `data` itself. The fields are `country`, `course`, `studyLevel`, `tuition`, `accommodation`, `living`, `insurance`, `visa`, `travel`, `other`, `total`, `budget`, `budgetStatus.label`, `budgetStatus.description`, and `aiAnalysis`.

Chat uses `"mode": "cost"` and shows `response`. Suggested questions: “Calculate the cost of studying in Germany”, “How much will a Master's in the UK cost?”, “Compare Germany and France”.

## 7. Eligibility Checker

Page: `/eligibility`

Last button: **Check My Eligibility**

| Step | Question | Options |
| --- | --- | --- |
| 1 | What would you like to study? | Computer Science & AI, Business & Management, Engineering, Medicine & Health, Data Science, Arts & Design, Other |
| 2 | Where are you planning to study? | Germany, United Kingdom, United States, Canada, France, Ireland, Other |
| 3 | What's your academic performance? | 90% or above, 80% – 89%, 70% – 79%, 60% – 69%, Below 60%, Other |
| 4 | What's your English proficiency? | IELTS 7.0+, IELTS 6.5, IELTS 6.0, IELTS below 6.0, I haven't taken a test yet, Other |
| 5 | What level do you want to study? | Bachelor's, Master's, PhD / Doctorate, Other |

The screen then shows a score, a status, a summary, a breakdown, and next steps.

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

Show `data.score`, `data.status`, `data.summary`, `data.breakdown`, and `data.nextSteps`. Each breakdown row uses `title`, `status` (`positive` or `caution`), and `description`.

Chat uses `"mode": "eligibility"` and shows `response`. Suggested questions: “Can I study Computer Science in Germany?”, “I have 65%. Where can I apply?”, “Check my Master's eligibility”.

## 8. Study Abroad Mentor

This is **Ask Future Atlas AI** on the homepage. There is no option list. The student types a question, that message is sent, and the reply is shown in the chat.

Suggested questions: “Where should I start?”, “How do I choose a country?”, “What documents do I need?”.

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

Show `response`. `history` is optional. Send only the latest 6 turns. Each turn needs `role` of `user` or `model`, and `content`. A new reply costs 1 credit, including a repeated question.

## 9. What the AI returns

Tool result:

```json
{
  "data": {},
  "mode": "country",
  "creditsRemaining": 4993,
  "requestId": "…"
}
```

Chat result:

```json
{
  "response": "The written answer to show in the chat.",
  "mode": "mentor",
  "creditsRemaining": 4992,
  "requestId": "…"
}
```

Failure:

```json
{
  "error": {
    "code": "FA_ORIGIN_FORBIDDEN",
    "message": "This website origin is not authorized for the API key.",
    "requestId": "…"
  }
}
```

| Code | What to do |
| --- | --- |
| `FA_AUTH_REQUIRED` | Send the `X-API-Key` header. |
| `FA_INVALID_API_KEY` | The key is wrong or revoked. Create a new key on the API keys page. |
| `FA_API_KEY_EXPIRED` | The key has passed its expiry date. |
| `FA_ORIGIN_FORBIDDEN` | Send `X-Client-Origin`, and make sure that website is allowed on the key. |
| `FA_SANDBOX_EXHAUSTED` | Shared credits are used up. Ask us to refill them. `creditsRemaining` is 0. |
| `INVALID_REQUEST` | Send `mode` and a `message` under 8,000 characters. |
| `INVALID_MODE` | Use `mentor`, `country`, `university`, `scholarship`, `cost`, or `eligibility`. |
| `INVALID_RESPONSE_FORMAT` | For a tool, send `responseFormat` as `structured` only. |
| `429` | More than 30 AI calls in one minute. Wait, then retry. |

## 10. Guidance form

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

A saved form returns `{ "ok": true }`. The screen then shows “Thank you”.
