# Future Atlas AI - Project Memory

Last full browser verification: 2026-09-19 (Asia/Kolkata). Architecture updated 2026-09-28. The new API-key table and Google sign-in are not live-verified.

## 2026-09-28 API-key reliability and origin enforcement

- Current Supabase project resolved from `.env.local`: `utuhiewrwzumhwhdmeuh`. Older project IDs below are historical; deployment variables remain the source of truth.
- Applied `supabase/migrations/20260928_api_key_allowed_origins.sql` and `20260928_api_key_idempotency_scope.sql`. API keys now require 1-20 exact origins. Public origins require HTTPS; HTTP is accepted only for localhost testing. Requests must match `Origin` or server-supplied `X-Client-Origin`; older keys without origins are denied until replaced. Idempotency keys are scoped to each API key.
- API allowance is 1,000 generated responses per Asia/Kolkata day, 120 per rolling hour, and 30 requests/minute/key. Failed requests and saved replays do not count. Completed identical requests replay durably by key + request hash with the original request ID and `cached: true`.
- Local end-to-end verification passed: missing/wrong origin returned 403; authorized origin returned 200; identical replay returned 200 without a second generation; country, university, scholarship, cost, eligibility, and mentor modes all returned 200. Lint, contract tests, and production Next.js build pass.
- Mentor instructions now prohibit unsupported exact current visa funds, fees, processing times, deadlines, rankings, tuition, work rights, and immigration rules.
- Test keys `Origin policy verification`, `Codex API verification`, and `test` were revoked after verification. Database verification found zero active keys with those names, and `/api/v1/ai` rejected the formerly valid restricted key with HTTP 401.

## 2026-09-28 Local UI hydration fix

- Homepage buttons rendered but did not respond locally because the shared CSP blocked webpack/React Refresh `eval`, aborting client hydration. Native form controls still appeared usable because they do not require React event handlers.
- `lib/security/headers.ts` now permits `'unsafe-eval'` only when `NODE_ENV=development`. Production CSP remains unchanged and does not contain `'unsafe-eval'`.
- Browser-verified locally: homepage tool cards and **Ask Future Atlas AI** open the Google sign-in dialog. `npm run lint`, `npm test`, and `npm run build` pass. A production server response on port 3100 was verified to retain the strict CSP.

## 2026-09-28 API keys and sign-in

- Website users still sign in with Google. Supabase keeps the session access token and refresh token. That flow was not replaced and does not authenticate `POST /api/v1/ai`.
- API consumers use one opaque key prefixed `FA_AiT_`. The key itself is the credential. It is not a JWT, and a successful API call does not mint an access token or a refresh token.
- A signed-in user creates a key at `/tokens` through `POST /api/api-keys`. The complete key is returned once. `public.future_atlas_api_keys` stores a SHA-256 `key_hash` and a short `key_prefix` such as `FA_AiT_7f83`. The plaintext secret is never stored, logged, or listed later. Permissions are set on the server to `ai:generate`. A user can have 10 active keys. Expiration is never, 30 days, 90 days, 1 year, or a custom date. Revoke sets `revoked_at` and leaves the row. Replace inserts a new key, then revokes the old one.
- `POST /api/v1/ai` reads `X-API-Key`. Missing key: 401 `API key required`. Unknown or revoked: 401 `Invalid API key`. Expired: 401 `API key expired`. Missing `ai:generate`: 403 `Insufficient permissions`. Each key is limited to 30 requests per minute, in addition to the account API quota of 1,000 generated responses per Asia/Kolkata day and 120 per rolling hour.
- The older `fa_atk_` / `fa_rtk_` routes remain in code: `POST/GET/DELETE /api/tokens`, `POST /api/tokens/refresh`, and `POST /api/tokens/validate`. They are not the documented client contract. `docs/client-api.md` and `GET /api/v1/openapi` describe `FA_AiT_` and `/api/api-keys`.
- `supabase/migrations/20260928_future_atlas_api_keys.sql` and `supabase/migrations/20260928_api_key_allowed_origins.sql` are applied in the current Supabase project.
- Sign-out is immediate. The header no longer asks to back up history or mentions cookies. `components/privacy/ConsentManager.tsx` still exists and is not mounted in `app/layout.tsx`.
- Google sign-in is meant to show the returned email and wait for **Continue with that email** before `signInWithIdToken`. The button receives a SHA-256 nonce; Supabase receives the raw nonce. On 2026-09-28 the local sign-in control did not open the dialog in the automation browser because the page did not hydrate, and the user reported sign-in still failing. Do not treat Google login as verified after this change.

## 2026-09-22 AI provider diagnosis

- Tool request/UI contracts, lint, and production build pass.
- NVIDIA Nemotron 3.5 Lightning produced no completion before timeout; NVIDIA also returned `503 ResourceExhausted` for another current Nemotron endpoint. This is the current cause of missing tool results.
- NVIDIA requests now use streamed transport and a 40-second bounded attempt so a configured OpenRouter/OpenAI/DeepSeek provider can take over within the browser timeout. Failed attempts remain uncharged.
- A working secondary provider key is still required for reliable AI output while NVIDIA capacity is unavailable.

## 2026-09-19 Database and configuration update

- Applied all four existing migrations plus `supabase/migrations/20260919_enable_otp_rate_limit_rls.sql` to project `qkxrzieifutndosqjzsh`.
- Live tables now exist for profiles, credits, events, consent, guidance, history, tenant API data, and OTP rate limits.
- Enabled RLS on `private.future_atlas_otp_rate_limits`.
- `wrangler.jsonc` now contains an empty top-level `vars` object. Secrets remain Cloudflare secrets.
- Removed hardcoded Supabase URL/key fallbacks from `lib/supabase.ts`; missing runtime configuration now fails closed.
- Local `npm run lint` passes. A later `npm run build` was blocked by another process locking `.next/trace`; stop the running Next.js process before rebuilding.

## Product

Future Atlas AI is a study-abroad planning application with five AI tools, a study-abroad mentor, Supabase authentication and account credits, a tenant API, controlled iframe embedding, consent analytics, and a Zoho guidance form.

User routes: `/`, `/countries`, `/universities`, `/scholarships`, `/cost-calculator`, `/eligibility`, `/guidance`, `/embed`, `/tokens`.

API routes: `/api/ai`, `/api/account`, `/api/api-keys`, `/api/consent`, `/api/credits`, `/api/events`, `/api/tokens`, `/api/tokens/refresh`, `/api/tokens/validate`, `/api/v1/ai`, `/api/v1/health`, `/api/v1/openapi`, `/api/v1/tenants`. Every API handler is wrapped with `withRequestLog` (`lib/security/request-log.ts`), which writes method, path, status, duration, origin, IP, and verified `user_id` to `public.future_atlas_request_logs` after the response via Next.js `after()`. Bodies and secrets are not stored. An `FA_AiT_` key is logged as its short prefix plus hash in `future_atlas_api_key_access`. Writes use `SUPABASE_SECRET_KEY`; missing secret skips persistence. Apply `supabase/migrations/20260922_future_atlas_request_logs.sql` before expecting rows.

Signed-in users create personal API keys at `/tokens`. `POST /api/api-keys` returns one `FA_AiT_` secret once. Later responses show only the prefix, name, dates, and status. `GET /api/api-keys` lists keys. `DELETE /api/api-keys` revokes one. Rotate sends `rotateId` on `POST /api/api-keys`. Management requires the Google session; an API key cannot create keys. `POST /api/v1/ai` accepts only `X-API-Key`. Website tools still call `/api/ai` with the session bearer. The older `fa_atk_` / `fa_rtk_` pair can still be issued by `/api/tokens` and accepted by `resolveRequestAuth`, but that pair is not the client API. Apply `supabase/migrations/20260923_future_atlas_user_api_tokens.sql` for the old pair and `supabase/migrations/20260928_future_atlas_api_keys.sql` for `FA_AiT_` keys. Account deletion also deletes `future_atlas_api_keys`.

Repository: https://github.com/B-Glaz/Future-Atlas-ai-tools.git

Production URL: https://future-atlas-ai-tools.onewindowvcard.workers.dev/

## Stack

- Next.js 16.3.4 App Router, React 19.2.4, TypeScript, Tailwind CSS 4.
- Supabase Auth/Postgres via `@supabase/supabase-js` 2.116 and `@supabase/ssr` 0.12.
- OpenAI SDK used only as a server-side client for OpenAI-compatible providers.
- NVIDIA Nemotron 3.5 Lightning is the currently verified local provider.
- Cloudflare Workers through OpenNext 1.20.6 and Wrangler 4.131.2.
- `custom-worker.mjs` is the Cloudflare entry point. Do not restore Next.js Node middleware.

## Current Behavior

Authentication is active for tool pages. The homepage remains explorable. Clicking a tool or the credit sign-in control opens `components/auth/AuthGate.tsx`.

Auth options:
- Google Identity Services button. After Google returns an ID token, the dialog shows that email and waits for Continue before `signInWithIdToken`. The website session is still Supabase access and refresh tokens.
- Separate `FA_AiT_` API keys for `POST /api/v1/ai`. See the 2026-09-28 section.

Google-only authentication was verified locally and in production with `blessononewindow@gmail.com` on 2026-09-19. Google is enabled and Email is disabled in the active Supabase project. The 2026-09-28 Continue step has not been verified with a completed login.

Credits:
- 30 credits reset at Asia/Kolkata midnight.
- Tool generation costs 1 credit.
- Chat generation costs 0.25, 0.5, 0.75, or 1 credit.
- UI displays a whole-number remaining balance.
- Failed requests, history review, cache hits, duplicate reuse, and deterministic scope redirects cost zero.
- Signed-in balances use Supabase and persist across logout/login.
- Guest admission remains in-memory and is not suitable as durable high-volume abuse protection.

AI:
- Provider configuration is modular in `lib/ai/providers.ts`.
- Provider order, attempts, timeouts, circuit pause, response validation, in-flight deduplication, caching, and structured normalization are implemented.
- Provider clients are created at request time; missing secrets do not break builds.
- A single configured provider is attempted once. NVIDIA has a 120-second server timeout and the browser waits 125 seconds; this avoids the former duplicate 25-second retry and premature client abort. Typical observed NVIDIA latency is roughly 43-90 seconds, so a faster second provider is still desirable.
- The mentor only answers study-abroad topics. Clear unrelated prompts return the exact required redirect without invoking AI or charging credit.
- No live web search exists. Exact current fees, rankings, deadlines, visa rules, and scholarship amounts must be verified with official sources.

UI:
- Homepage design is preserved.
- Header logo links home; profile, delete, backup, and clear-history toolbar icons are absent.
- The right header area shows sign-in, live credits, zero, pending, or unavailable state. A signed-in user also sees the API keys link and sign-out.
- Sign-out calls `signOut()` immediately. There is no backup prompt and no cookie prompt.
- Option sets over four choices use `4 -> More -> remaining options`, including Other where supported.
- Custom typo suggestions work; `Pharmcy` suggests `Pharmacy`.
- Tool layouts are centered and responsive.
- Results include contextual forum/guidance CTAs.
- Result history is device-side and reviewing it does not call AI.

Consent and analytics:
- The cookie banner is not shown. `components/privacy/ConsentManager.tsx` is unused. `/api/consent` remains.
- Events still write to `/api/events`.
- Without `SUPABASE_SECRET_KEY`, these endpoints intentionally return 204 and do not persist.
- PageSense loads only for additional consent, which the banner no longer collects.
- Device history is account-scoped. Explicit backup still exists on `POST /api/account`. Sign-out does not upload it.

Guidance:
- `/guidance` renders the supplied Zoho public form directly in a styled, rounded iframe. Zoho now owns field input and final submission; the app no longer attempts a cross-origin prefill bridge.
- The unreliable cross-origin loading overlay was removed because it could hide an already-loaded form forever.
- Fields were browser-tested for input. Marked QA submissions were sent through the deployed native form API on 2026-09-19; it returned 200, persisted in Supabase, and returned a prefilled Zoho public-form URL using verified field names. The user must complete the final Zoho submit action; no private Zoho API credentials are configured.

Tenant API and embedding:
- `/api/v1/openapi` serves OpenAPI 3.1 documentation.
- `/api/v1/ai` requires an `FA_AiT_` key in `X-API-Key`. Idempotency-Key is still used for retries. This is separate from tenant `fa_test_` / `fa_live_` keys.
- `/api/v1/tenants` requires a Supabase user session and manages tenant credentials/domains through database RPCs.
- `/embed` is denied by default. `custom-worker.mjs` applies per-request `frame-ancestors`; unauthorized direct access shows Access Restricted.
- The tenant API has not yet been end-to-end tested with a real `fa_test_` or `fa_live_` credential.

## Database

Active local Supabase project ID: `utuhiewrwzumhwhdmeuh`. Treat deployment variables as source of truth; older project IDs in historical notes are not used by the current local application.

Applied and live-verified on 2026-09-18:
- `supabase/migrations/20260917_future_atlas_user_credit_quarters.sql`
- `supabase/migrations/20260918_future_atlas_auth_consent.sql`

The migrations provide account/profile provisioning, quarter-credit accounting, Asia/Kolkata reset behavior, completion/status operations, consent logging, request logging, and account cleanup. Direct access to server-owned audit/event/request-log tables is revoked; server routes use the secret key.

Pending apply:
- `supabase/migrations/20260922_future_atlas_request_logs.sql`
- `supabase/migrations/20260923_future_atlas_user_api_tokens.sql` (legacy personal access/refresh tokens, acting-user helper, token RPCs, and `future_atlas_delete_my_data` deletes those tokens).
- `supabase/migrations/20260928_future_atlas_api_keys.sql` and `20260928_api_key_allowed_origins.sql` are applied in the current project.

Supabase leaked-password protection is a dashboard setting and remains **Needs Verification / Enable in dashboard**.

## Environment Variables

Never commit values. See `.env.example`.

- AI: `AI_ENABLED`, `AI_DISABLED_MODES`, `AI_PROVIDER_ORDER`, `AI_MAX_PROVIDER_ATTEMPTS`, generic `AI_*`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, optional OpenRouter/OpenAI/DeepSeek keys and models.
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SECRET_KEY`.
- Google Auth: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is public and compiled into the browser; keep the matching client secret only in Supabase Auth provider settings.
- Embed/security: `EMBED_ALLOWED_ORIGINS`, `SECURITY_ALERT_EMAIL`, `SECURITY_ALERT_WEBHOOK_URL`, `SECURITY_ALERT_COOLDOWN_SECONDS`.
- UI: `NEXT_PUBLIC_FORUM_URL`.
- Sentry is not configured locally. Inspection requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`; never place the token in source.

## Deployment

Cloudflare config: `wrangler.jsonc` -> `custom-worker.mjs`; build command `npm run cf:build`; assets `.open-next/assets`.

Scripts:
- `npm run build`: normal Next.js production build.
- `npm run cf:build`: OpenNext build that generates `.open-next/worker.js`.
- `npm run preview`: build and Cloudflare preview.
- `npm run deploy`: build and OpenNext deploy.

Cloudflare must run an OpenNext-producing build before deployment. Do not run only `next build` and then expect `.open-next` to exist.

Current production deployment (2026-09-19):
- Worker: `future-atlas-ai-tools`
- Version: `2baecf27-3a63-4604-8e02-b9ee1865d178`
- URL: https://future-atlas-ai-tools.onewindowvcard.workers.dev/
- Bound secret names verified with Wrangler: `NVIDIA_API_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Bound server secret `SUPABASE_SECRET_KEY` is now verified. Server event, consent, guidance persistence, account backup, and tenant administration can use Supabase.
- Latest deployment after database/configuration fixes: `95a8a8b2-de33-41b9-bb38-a4c9a3b0acad`.
- Latest production deployment for native-form Zoho handoff: `8dd68f60-18e2-4856-9903-7ff02b0de1ae`.
- Latest production deployment for direct Zoho iframe input: `3e614ba4-275f-407c-8d66-821005a6cca5`.
- Separate sandbox Supabase project created: `winaoavaimwkozrlozfw` (`Future Atlas Sandbox`, `ap-south-1`); all application migrations applied.
- Separate sandbox Wrangler config prepared in `wrangler.sandbox.jsonc` for Worker `future-atlas-ai-tools-sandbox`.
- Sandbox deployment verified: `https://future-atlas-ai-tools-sandbox.onewindowvcard.workers.dev/`, version `52e65ea6-25d4-44ad-9616-db43e8f859fe`.
- Sandbox `SUPABASE_SECRET_KEY` and `NVIDIA_API_KEY` are bound as Wrangler secrets; values are intentionally omitted.
- Sandbox Supabase Google provider is enabled. The dashboard still shows the Email provider enabled and must be disabled manually if Google-only authentication is required in sandbox; production remains Google-only.

## Verification - 2026-09-19

Passed:
- `npm test` structured-output and provider-fallback contracts.
- `npm run lint`.
- `npm run build` with all application/API routes compiled.
- `npm run cf:build`; `.open-next/worker.js` generated.
- Browser: homepage, Google-only login, live credit counter, logout dialog, all five AI tools, eligibility mentor, mode dropdown, typo correction, exact unrelated-topic redirect, consent controls, native guidance form visibility/input, and denied `/embed`.
- API: health 200, malformed AI 400, unauthenticated credits/account/tenant management 401, missing tenant key 401, valid local event ingestion 204, OpenAPI 200.
- Sandbox live smoke checks: `/api/v1/health` 200 with database and AI configured; `/api/v1/openapi` 200; unauthenticated `/api/credits` 401.

Observed AI outputs were input-specific for countries, universities, scholarships, costs, and eligibility. University results did not repeat duplicate keys or invent exact rankings in the tested flow.

Production browser verification on 2026-09-19:
- Google login completed with `blessononewindow@gmail.com`.
- The header showed 30 credits after login.
- Country Explorer generated three input-specific results through NVIDIA.
- The balance changed from 30 to 29 only after the successful result. Two timed-out attempts consumed no credit.
- Email OTP, email magic-link, and local-password login UI/routes are absent.

Incomplete verification:
- Sentry query was blocked because Sentry credentials are not configured locally.
- Codex Security Deep Scan stopped with: `Your workspace is out of credits. Add credits to continue.` Coverage is incomplete; no successful findings manifest was returned.
- Production event/consent persistence, tenant API key flow, tenant domain approval, and Asia/Kolkata midnight reset need controlled integration tests.

## Known Limits / Next Work

1. Add Cloudflare production secrets, especially `SUPABASE_SECRET_KEY`, then verify events and consent persistence.
2. Add a faster server-side AI provider/key as fallback; NVIDIA is reliable with the corrected timeout but remains slow.
3. Test tenant API and domain authorization with a real sandbox tenant key.
4. Replace guest in-memory throttling with shared durable storage before bulk anonymous traffic.
5. Configure Sentry variables and rerun error inspection; restore Codex Security credits and rerun the deep scan.
6. Re-run production persistence tests after binding `SUPABASE_SECRET_KEY`.
7. Expired-key rejection remains to be tested. Create-once, masked list, origin rejection, generation, replay, and revocation are verified.
8. Finish a local Google login as `blessononewindow@gmail.com` through the Continue step. The 2026-09-28 attempt did not open the sign-in dialog.

## Development Rules

- Keep AI keys and Supabase secret server-side.
- Never initialize provider clients at module evaluation when secrets may be absent during builds.
- Preserve stable API errors and request IDs.
- Do not add fake exact study-abroad facts.
- Preserve exact-origin tenant authorization and iframe CSP.
- Update this file after material architecture, deployment, auth, credit, provider, schema, or route changes.

## 2026-09-18 Auth and Guidance Update

- Email OTP and local password login were removed on 2026-09-19. Google Identity Services is the only active login flow.
- Added `app/api/guidance/route.ts`. It validates and stores native guidance form submissions server-side.
- Replaced the Zoho iframe UI with a native Future Atlas form in `components/ZohoGuidanceForm.tsx`. No submitted form data is stored in browser storage.
- Added and applied `supabase/migrations/20260918_future_atlas_guidance_otp.sql`.
- Verified live tables: `public.future_atlas_guidance_submissions` and `private.future_atlas_otp_rate_limits`. Submission count was 0 at verification time.

## Historical Live Deployment Audit - 2026-09-18

This section records the previous deployment state and is superseded by the 2026-09-19 deployment notes above.

Live URL tested: `https://future-atlas-ai-tools.onewindowvcard.workers.dev/`.

Passed live checks:
- Homepage and all user routes loaded.
- Navigation/header/home link and guidance route loaded.
- Native guidance fields, required-field browser validation, dropdown, responsive layout, and access-restricted `/embed`.
- OTP invalid-input validation returned 400.
- The former redirect-based Google OAuth implementation was replaced after this audit; current local verification confirms the Google Identity Services button renders, while a real account sign-in remains unverified.
- `/api/ai` malformed request returned 400.
- `/api/v1/openapi` returned 200.
- Protected credits/tenant routes returned 401 without credentials.

Production blocker confirmed:
- `/api/v1/health` returned 503 with `databaseConfigured:false`.
- A valid synthetic guidance request returned 503 because the deployed Worker does not have `SUPABASE_SECRET_KEY` configured.
- Configure Cloudflare Worker secrets/variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY`. This cannot be fixed safely by source code or by exposing a secret in the browser.
