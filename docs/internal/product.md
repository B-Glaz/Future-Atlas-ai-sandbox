# Future Atlas — Product Documentation

**Prepared for:** Clint  
**Product:** Future Atlas (Global Pathways)  
**Version:** Current build (Next.js 16 / React 19)  
**Platform:** One Window  
**Date:** August 2025

---

## 1. Executive Summary

Future Atlas is a **study-abroad planning platform** that helps students explore countries, universities, scholarships, costs, and eligibility through five AI-powered tools and a conversational AI companion. It is built as an embeddable, white-label product on the **One Window** platform — a study-abroad technology and services provider.

The interface is intentionally minimal, fast, and mobile-first. Students answer 2–3 guided questions per tool and receive personalized, AI-generated recommendations with match scores and rationale. The AI can also be opened as a full-screen chat for open-ended guidance.

**Target users:** Prospective international students (primarily Master's and Bachelor's applicants)  
**Primary value:** Reduce decision paralysis; replace hours of scattered research with a guided, personalized workflow.

---

## 2. Platform & Technical Foundation

| Layer | Technology |
|-------|------------|
| **Core platform** | One Window (hosted, managed, white-label) |
| **Frontend framework** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS v4, shadcn/ui (base-nova), Lucide icons |
| **Animation** | Framer Motion |
| **AI provider** | NVIDIA API (Nemotron 3.5 Lightning 30B-A3B) via serverless API route |
| **AI features** | Structured JSON output, client-side caching, conversation history |
| **Deployment** | Node.js server (`next start`), runs on port 3000/3001 |
| **Security headers** | CSP `frame-ancestors` (configurable via `EMBED_ALLOWED_ORIGINS`), `X-Frame-Options: SAMEORIGIN` on protected routes |

**What "built on One Window" means:**  
The core infrastructure (auth, data, AI orchestration, embedding, partner integrations) is provided by One Window. Future Atlas is a configured product instance — not a custom build from scratch. Customization is at the UI/UX, prompt, and workflow level.

---

## 3. User Interface Overview

### 3.1 Global Layout

- **Background:** Light neutral (`#F8F9FC`) across all pages
- **Header (sticky, blurred):** Back button + logo ("Future Atlas / Global Pathways") — clicking home clears temporary session state
- **Max content width:** `max-w-7xl` (1280px) with responsive padding
- **Typography:** Geist Sans / Geist Mono (Google Fonts)
- **Footer note:** "Your journey. Your choices. Your future." + "Powered by One Window" on tools

### 3.2 Home / Dashboard (`/`)

The landing page is the **tool hub** — five cards in a responsive grid (1 featured + 4 standard):

| Tool | Tag | Route | Purpose |
|------|-----|-------|---------|
| **Explore Countries** | Discover | `/countries` | Compare destinations by study field, budget, priorities |
| **Explore Universities** | Find your fit | `/universities` | Match universities to course, budget, profile |
| **Scholarship Explorer** | Save money | `/scholarships` | Discover funding opportunities |
| **Cost Calculator** | Plan your budget | `/cost-calculator` | Estimate full study-abroad budget |
| **Eligibility Checker** | Check your profile | `/eligibility` | Quick academic/English readiness assessment |

**AI Section (prominent):** Dark card with "Ask Future Atlas AI" CTA → opens full-screen mentor chat modal.

**Guidance CTA:** "Ready for personalized guidance?" → links to `/guidance` (partner lead capture).

---

### 3.3 Tool Pages (Shared Pattern)

Each tool page (`/countries`, `/universities`, `/scholarships`, `/cost-calculator`) follows:

```
Header
├── Tool Component (interactive, multi-step or single-view)
└── Guidance CTA (fixed at bottom)
```

#### Country Explorer (`/countries`) — **3-step guided flow**
1. **What to study** — 6 preset fields + "Other" (custom input)
2. **Budget range** — 4 bands + "No Preference" + "Other"
3. **Top priority** — Career/PR/Low Cost/Rankings/Scholarships + "Other"

→ **Results:** 3 country cards with:
- Match score (70–98%)
- 2-letter code badge
- Description tailored to answers
- Tags (e.g., "Post-study work", "Low tuition")
- "Best overall match" label on #1

#### University Explorer (`/universities`) — Same 3-step pattern
Fields: Study area, Budget, Priority  
Results: 3 university cards with match score, location, tuition band, type, highlights

#### Scholarship Explorer (`/scholarships`) — Same 3-step pattern
Fields: Study level, Destination, Profile strength  
Results: 3 scholarship matches with provider, country, amount, coverage, deadline guidance, match score

#### Cost Calculator (`/cost-calculator`) — **Single view with AI**
- Input: Country, Study level, Duration, Lifestyle preference
- Output: Structured breakdown (tuition, accommodation, living, insurance, visa, travel, other, total) + budget status label + AI analysis text
- All estimates shown as ranges with assumptions noted

#### Eligibility Checker (`/eligibility`) — **Direct AI chat**
Opens full-screen Future Atlas AI in `eligibility` mode immediately (no multi-step form).  
Returns: Score (0–98), status label, summary, 3-category breakdown (Academic / English / Programme Fit), 3 next steps.

---

### 3.4 Future Atlas AI (Conversational Companion)

**Access points:**
- Home dashboard → "Ask Future Atlas AI" (mentor mode)
- Embed view → same
- Eligibility page → auto-opens in eligibility mode
- Each tool has a mode switcher in the AI header dropdown

**Modes (6):**
| Mode | Label | Use Case |
|------|-------|----------|
| `mentor` | Study Abroad Mentor | General Q&A, open-ended guidance |
| `country` | Country Explorer | Destination recommendations |
| `university` | University Explorer | University matching |
| `scholarship` | Scholarship Explorer | Funding discovery |
| `cost` | Cost Calculator | Budget estimation |
| `eligibility` | Eligibility Checker | Profile assessment |

**UI Features:**
- Full-screen modal (desktop) / sheet (mobile)
- Mode selector dropdown (shows 4 primary, "More" expands)
- Streaming "Thinking..." indicator
- Markdown rendering (lists, bold, headings)
- Suggestion chips on first message
- Client-side response caching (24hr TTL, 250-entry LRU)
- Disclaimer: "Future Atlas AI can make mistakes. Always verify... Powered by One Window"

**Technical:** Calls `/api/ai` (POST) with mode, message, history, optional structured inputs. NVIDIA Nemotron 3.5 Lightning 30B-A3B with JSON schema enforcement for structured modes.

---

### 3.5 Embed Mode (`/embed`)

**Purpose:** White-label iframe embed for partner sites (university portals, agent platforms, etc.)

**Flow:**
1. Parent site embeds `/embed` in iframe
2. Server validates `Referer`/`Origin` against `EMBED_ALLOWED_ORIGINS` env var
3. If allowed → renders tool selector grid (same 5 tools + AI)
4. Tool selection → `/embed?tool=countries` (etc.) renders that tool full-width
5. "Back to tools" button returns to grid
6. AI opens in mentor mode within embed

**Security:** CSP `frame-ancestors` restricted to allowed origins. Unauthorized attempts logged.

---

### 3.6 Guidance Page (`/guidance`)

Lead capture / partner handoff page. (Implementation not reviewed — route exists, linked from CTA.)

---

## 4. Key User Flows

### Flow A: First-time visitor (Country Explorer)
1. Lands on `/` → sees 5 tool cards + AI prompt
2. Clicks "Explore Countries" → `/countries`
3. Step 1: Selects "Computer Science" → Continue
4. Step 2: Selects "$15,000–$30,000" → Continue
5. Step 3: Selects "Career & Jobs" → "Find My Countries"
6. Sees 3 country cards with match scores, descriptions, tags
7. Clicks "Change preferences" or opens AI for follow-up

### Flow B: Returning user (Embed)
1. Partner site loads `/embed` in iframe
2. User sees tool grid, clicks "Cost Calculator"
3. Enters country + preferences → sees structured cost breakdown
4. Opens AI → asks "How much for Germany vs France?" → gets comparison
5. Closes embed → returns to partner site

### Flow C: Quick eligibility check
1. Navigates to `/eligibility`
2. AI chat opens immediately in eligibility mode
3. Types: "I have 72% in CS, want Master's in Germany, IELTS 7.0"
4. Receives: Score (e.g., 84), status "Strong initial profile", breakdown, 3 next steps

---

## 5. AI Behavior & Guardrails

| Aspect | Detail |
|--------|--------|
| **Model** | NVIDIA Nemotron 3.5 Lightning 30B-A3B |
| **Temperature** | 0.7 |
| **Structured modes** | Enforced JSON schema via `response_format: json_object` |
| **System prompts** | Defined in `/lib/ai/personalities.ts` — role, tone, scope |
| **Routing instructions** | Injected into every request — keeps AI focused on 5 tools |
| **Scope filter** | Mentor mode rejects non-study-abroad topics (celebrity, crypto, politics, etc.) |
| **Caching** | Client-side (localStorage, 24hr) + server in-memory (24hr, 250 entries) |
| **Deduplication** | Pending request map prevents duplicate NVIDIA calls |
| **Rate limit handling** | Returns 429 with friendly message |
| **Error handling** | Graceful fallback: "I couldn't connect to the AI right now" |
| **Disclaimer** | Shown in every AI response footer |

**What the AI does NOT do:**
- Guarantee admission, visa approval, or scholarship awards
- Access real-time university databases or live tuition data
- Store personal data beyond session cache
- Answer non-study-abroad questions (in mentor mode)

---

## 6. Data & Privacy

| Data Type | Storage | Retention |
|-----------|---------|-----------|
| Tool selections (country, university, etc.) | `localStorage` (keys: `future-atlas-*`) | Cleared on "Clear Selection" or home click |
| AI conversation history | In-memory (component state) + client cache | 24hr TTL, cleared on modal close |
| AI response cache | Client localStorage + server Map | 24hr / 250-entry LRU |
| Embed access logs | Server logs (unauthorized attempts) | Standard log retention |

**No backend database** in this build — all ephemeral. Production One Window deployments add persistent user profiles, saved searches, and partner CRM sync.

---

## 7. Configuration (Environment Variables)

| Variable | Purpose | Required |
|----------|---------|----------|
| `NVIDIA_API_KEY` | AI provider authentication | Yes |
| `EMBED_ALLOWED_ORIGINS` | Comma-separated list of origins allowed to iframe `/embed` | For embed |
| `NEXT_PUBLIC_*` | None currently used | No |

---

## 8. What's Not In Scope (This Build)

- User authentication / accounts
- Saved searches / history across sessions
- Real university data APIs (AI generates from training knowledge)
- Live tuition/visa feeds
- Partner CRM integration
- Multi-language (UI is English only)
- Admin dashboard / analytics
- Payment / subscription logic

These are platform-level capabilities available via One Window in production deployments.

---

## 9. Roadmap Considerations (Discussed)

| Area | Status |
|------|--------|
| **Real data integration** | Planned — connect university/scholarship APIs to ground AI outputs |
| **User accounts + saved journeys** | Platform feature — enable via One Window config |
| **Agent/university white-label** | Embed mode is the foundation — theming/config next |
| **Multi-step eligibility form** | Current chat-only; guided form option under review |
| **Cost calculator granularity** | Add city-level, accommodation type, dependents |
| **Analytics / funnel tracking** | Planned via One Window events |

---

## 10. Quick Reference: Routes

| Route | Purpose | Auth |
|-------|---------|------|
| `/` | Dashboard (tool hub) | Public |
| `/countries` | Country Explorer | Public |
| `/universities` | University Explorer | Public |
| `/scholarships` | Scholarship Explorer | Public |
| `/cost-calculator` | Cost Calculator | Public |
| `/eligibility` | Eligibility Checker (AI chat) | Public |
| `/embed` | Embed tool selector | Origin-validated |
| `/embed?tool=*` | Embedded single tool | Origin-validated |
| `/guidance` | Partner lead capture | Public |
| `/api/ai` | AI endpoint (POST) | Public (rate-limited) |

---

## 11. Support & Escalation

- **Platform issues (uptime, embed, One Window config):** One Window support
- **AI quality / prompts:** Product team (adjust personalities in `/lib/ai/personalities.ts`)
- **UI/UX changes:** Frontend team (Next.js / Tailwind / shadcn)
- **Security headers / CSP:** DevOps / platform config

---

*End of documentation. This covers the product as currently built. For implementation details (code paths, component props, API schemas), see the source repository.*
