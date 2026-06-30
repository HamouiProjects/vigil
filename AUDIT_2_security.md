# Vigil Security & Compliance Audit (AUDIT_2)

**Confirmed HEAD:** `e99640a39344190e5102ebdbd6d5c1bafdff357c`  
**Audit date:** 2025-06-30  
**Scope:** Read-only review of areas C (engineering/security), G (dependency health), H (test coverage), J (GDPR deletion + PII inventory).

Vigil’s server-side posture is generally sound for a pre-revenue SPA: SSRF-sensitive user URL fetches go through `safeFetch` with IP pinning, email HTML is escaped, contact recipients are server-resolved, rate limiting fails open (except the LLM bucket), and RLS enforces own-row access on user tables. Gaps cluster around dormant-but-live Stripe checkout (unauthenticated), client-only entitlement caps for workspaces/alerts, incomplete account-deletion cleanup (`email_signups` edge cases, `feed_cache` tglink rows, Stripe customers), zero automated tests on high-risk paths, and a hardcoded personal email fallback in the contact handler. `npm audit` reports zero known vulnerabilities.

---

## Drift / recent-change note

Recent commits (last ~15) emphasize pricing/contact UX (`7432616` contact action, `c394c9c` honest email-capture CTAs), alert matching expansion (`278ee6d` whole-room + Atlas layers), snooze (`2f046a4` / `0009`), and footer/legal polish (`e99640a`). The pricing page now uses `email-signup` rather than `UpgradeModal`, but `api/stripe.js` checkout remains callable and `UpgradeModal.jsx` still contains checkout code (unreferenced from the app shell). Contact form landed in the same window as the GDPR deletion path review — deletion logic itself is unchanged since prior audits.

---

## C — Engineering & security

### Critical

#### C1 — Unauthenticated Stripe checkout accepts client-supplied `uid` / `email`

- **Severity:** Critical (if live Stripe keys are ever enabled); High while TEST-only but path is live
- **Location:** `api/stripe.js:17-49`
- **Issue:** `POST /api/stripe?action=checkout` has no session verification. The caller supplies arbitrary `uid` and `email`; the server creates a Checkout Session with `client_reference_id: uid` and `customer_email: email`.
- **Why it matters:** Any anonymous client can start checkout flows bound to another user’s Supabase UID, pollute Stripe with junk sessions, or (with live keys) complete payment attribution to the wrong account. This violates the convention that side-effectful actions act only on the authenticated user’s own data.
- **Fix:** Require `Authorization: Bearer <supabase JWT>`, derive `uid` and email from `supabase.auth.getUser(token)`, reject anonymous users, add `rateLimit()`, and gate the route behind an explicit “billing enabled” env flag while Stripe stays TEST/dormant. Remove or dead-end checkout until launch.
- **Effort:** M

---

### High

#### C2 — Workspace and alert-rule limits enforced only in the client

- **Severity:** High
- **Location:** `src/state/shellStore.js:105-107`; `src/shell/AlertsDrawer.jsx:59-61,188-199`; migrations `0001_initial_schema.sql:87-89`, `0004_alerts.sql:25-27`
- **Issue:** `withinLimit()` gates workspace creation in Zustand only. Alert cap (`alertRules`) is UI-only before `supabase.from('alerts').insert`. RLS policies allow any authenticated user to insert own rows with no count check.
- **Why it matters:** A user can bypass caps via the Supabase client or REST API, creating excess workspaces or alert rules. Dispatch honors `canAlert` server-side, but excess rules still consume cron CPU, DB rows, and webhook/email side effects for paying users who bypass the cap.
- **Fix:** Add server-side enforcement: RPC or trigger counting rows per `user_id` against plan limits (read from `subscriptions`), or validate in a single API mutation layer. No new tables required.
- **Effort:** M

#### C3 — Live checkout path conflicts with “Stripe TEST / dormant / honest email capture” convention

- **Severity:** High (compliance / product honesty)
- **Location:** `api/stripe.js:20-49`; `src/shell/UpgradeModal.jsx:114-117` (dead but present); `src/pricing/PricingPage.jsx` (uses email-signup — good)
- **Issue:** Checkout session creation and webhook plan-upgrade logic remain fully implemented. Pricing UI has moved to email capture, but the checkout API is still public.
- **Why it matters:** Accidental enablement of live Stripe keys would immediately expose an unauthenticated checkout (C1). Legal copy states TEST-only, but code contradicts “dormant.”
- **Fix:** Return `503 BILLING_DISABLED` from checkout until launch; keep webhook handler for TEST webhooks only; delete or guard `UpgradeModal` checkout branch.
- **Effort:** S

#### C4 — Account deletion leaves `feed_cache` Telegram link rows containing `user_id`

- **Severity:** High (GDPR orphaned PII)
- **Location:** `api/jobs.js:842-872,919-922`; `api/jobs.js:931-993` (`handleDeleteAccount`)
- **Issue:** `tgLinkCacheWrite` stores `{ user_id }` in `feed_cache.items` under keys `tglink:<token>`. `handleDeleteAccount` does not purge these rows.
- **Why it matters:** After deletion, pseudonymous link tokens may still map to a deleted user’s UUID in `feed_cache` for up to 15 minutes (TTL), and stale rows persist until the 7-day `feed_cache` cleanup cron.
- **Fix:** On delete, `delete from feed_cache where feed_url like 'tglink:%'` and `items->>'user_id' = uid` (service role). Optionally purge on successful Telegram link.
- **Effort:** S

---

### Medium

#### C5 — Stripe customer not removed on account deletion

- **Severity:** Medium
- **Location:** `api/jobs.js:954-984`
- **Issue:** Handler logs `stripe_customer_id` for “manual cleanup” but does not call Stripe delete API (even in TEST).
- **Why it matters:** GDPR erasure should cover processor-held identifiers tied to the data subject. Orphan Stripe customers retain email and metadata.
- **Fix:** If `stripe_customer_id` present, `stripe.customers.del(id)` (TEST-safe) inside delete handler before auth user removal; handle missing key gracefully.
- **Effort:** S

#### C6 — Hardcoded personal email as `CONTACT_TO` fallback

- **Severity:** Medium
- **Location:** `api/jobs.js:1070`
- **Issue:** `const to = process.env.CONTACT_TO || 'hamoui.ammar3@gmail.com'`
- **Why it matters:** Personal PII embedded in source; misconfigured production env routes contact form submissions to a developer inbox without ops awareness. Convention requires recipient from env only.
- **Fix:** Require `CONTACT_TO` (fail closed with `503` if missing); remove hardcoded fallback.
- **Effort:** S

#### C7 — `api/stripe.js` skips `rateLimit()` and `applyCors()`

- **Severity:** Medium
- **Location:** `api/stripe.js` (entire handler)
- **Issue:** Unlike other public API routes, Stripe handler uses neither shared CORS helper nor rate limiting.
- **Why it matters:** Convention violation; checkout spam and cross-origin abuse are easier. Webhook path should stay un-CORS’d but checkout should match other POST endpoints.
- **Fix:** Import `rateLimit` + `applyCors` from shared modules; rate-limit checkout by IP; leave webhook on signature auth only.
- **Effort:** S

#### C8 — `handleContact` does not fail fast when `RESEND_API_KEY` is unset

- **Severity:** Medium
- **Location:** `api/jobs.js:1069-1108` (cf. `handleEmailBrief` `api/jobs.js:353-354`)
- **Issue:** Contact handler proceeds to Resend fetch without `if (!key) return 503`.
- **Why it matters:** Inconsistent error surface; may leak provider error details. Other email paths guard the key.
- **Fix:** Mirror `EMAIL_NOT_CONFIGURED` guard from `handleEmailBrief`.
- **Effort:** S

#### C9 — `email_signups` only deleted when auth email matches

- **Severity:** Medium (GDPR completeness)
- **Location:** `api/jobs.js:971-980`; `supabase/migrations/0002_email_signups.sql`
- **Issue:** Landing-page signups (no account) are never deleted. Account holders who signed up with a different email than their auth email retain a row.
- **Why it matters:** Marketing-list PII survives account erasure unless emails match case-insensitively.
- **Fix:** Document as intentional for anonymous signups, or accept `email` in delete confirmation body and purge all matching rows; consider linking signups to `user_id` at registration time.
- **Effort:** M

#### C10 — Alert dispatch processes max 40 rules per cron run (unbounded users)

- **Severity:** Medium (availability / fairness)
- **Location:** `api/jobs.js:653-657`
- **Issue:** `.limit(40)` on active alerts with no ordering guarantee can starve rules.
- **Why it matters:** Not authz, but operational risk as user count grows; unrelated users’ alerts may never run in a given day.
- **Fix:** Order by `last_matched_at` / round-robin; paginate cron invocations. (No schema change if using existing columns + query tweak.)
- **Effort:** M

---

### Low

#### C11 — SSRF: fixed-URL fetches correctly skip `safeFetch`; user URL paths covered

- **Severity:** Low (informational positive with minor notes)
- **Location:** `api/_ssrf.js`; `api/rss.js:141`; `api/fetch-article.js:72`; `api/jobs.js:497`; `api/rss.js:226,253` (Telegram/Bluesky)
- **Issue:** User-controlled URLs (`rss?url=`, `fetch-article?url=`, alert `webhook_url`) use `safeFetch` with IP pinning and manual redirect validation. Telegram/Bluesky/rss2json use hardcoded upstream templates (acceptable). `api/jobs.js:1359,1432` uses self-HTTP to production RSS or `safeFetch` for discovery homepages.
- **Why it matters:** Confirms SSRF controls are in place for the riskiest paths.
- **Fix:** None required; optionally consolidate Telegram fetch behind allowlisted host check for consistency.
- **Effort:** S

#### C12 — CORS allowlist and `Vary: Origin` correctly applied on data proxies

- **Severity:** Low (positive)
- **Location:** `api/_cors.js:1-16`
- **Issue:** Allowlist matches production, preview, and localhost; `Vary: Origin` set when reflecting origin.
- **Why it matters:** Meets convention.
- **Fix:** N/A
- **Effort:** —

#### C13 — Rate limiting fails open except `suggest-llm`

- **Severity:** Low
- **Location:** `api/_ratelimit.js:4-5,33-54`
- **Issue:** `FAIL_CLOSED_BUCKETS = ['suggest-llm']`; all other endpoints allow on Supabase/RPC error.
- **Why it matters:** Matches spec (“fails open”) with a deliberate LLM cost guard.
- **Fix:** Document in ops runbook.
- **Effort:** S

#### C14 — Contact action: POST-only, rate-limited, validated, recipient server-resolved

- **Severity:** Low (positive)
- **Location:** `api/jobs.js:1044-1108`
- **Issue:** Recipient from `CONTACT_TO` env (not body); inputs clamped; HTML escaped via `esc()`; rate limit 5/min/IP.
- **Why it matters:** Meets convention aside from C6/C8.
- **Fix:** Address C6/C8.
- **Effort:** S

#### C15 — Email HTML injection mitigated; no `dangerouslySetInnerHTML` on remote content

- **Severity:** Low (positive)
- **Location:** `api/jobs.js:37-44,121-238,410-429`; repo-wide grep
- **Issue:** Server-rendered email uses `esc()` on dynamic strings; links require `isHttpUrl()`. No `dangerouslySetInnerHTML` in `src/`.
- **Why it matters:** Meets convention.
- **Fix:** N/A
- **Effort:** —

#### C16 — Secrets not exposed via `VITE_` client vars

- **Severity:** Low (positive)
- **Location:** `.env.example:1-14`; `src/lib/supabase.js:4-5`; `src/widgets/AtlasWorldGlobe.jsx:641`
- **Issue:** Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAPTILER_KEY` on client. Service role, Stripe, Resend, DeepSeek, etc. are server-only.
- **Why it matters:** Anon key exposure is expected for Supabase client; no secret keys in bundle.
- **Fix:** N/A
- **Effort:** —

#### C17 — RLS own-row enforcement on user tables; server-authoritative writes where required

- **Severity:** Low (positive with notes)
- **Location:** migrations `0001`–`0007`
- **Issue:** `workspaces`, `sources`: full own-row CRUD. `subscriptions`, `briefs`: SELECT-only for clients (writes via service role / `brief_insert_capped`). `alerts` / `alert_events` / `brief_schedules`: own-row client CRUD (counts not enforced — see C2). `feed_cache`, `rate_limits`: RLS on, no client policies. `email_signups`: no policies after `0006` (server insert only). `brief_insert_capped` revoked from `authenticated`.
- **Why it matters:** Core isolation holds; cap enforcement is the gap.
- **Fix:** See C2.
- **Effort:** M

#### C18 — Cron / webhook endpoints appropriately secret-gated (no public rate limit needed)

- **Severity:** Low (positive)
- **Location:** `api/jobs.js:803-806,818-821,897-900`
- **Issue:** `alert-dispatch`, `alert-poll`, `telegram-webhook` require shared secrets; not IP-rate-limited.
- **Why it matters:** Acceptable for non-public triggers.
- **Fix:** N/A
- **Effort:** —

---

## G — Dependency health

### Medium

#### G1 — Duplicate HTTP stacks: `node-fetch`, `undici`, and global `fetch`

- **Severity:** Medium (maintainability / bundle size on server)
- **Location:** `package.json:19,24`; `api/_yahoo.js:1`; `api/_ssrf.js:4`; other `api/*.js` use global `fetch`
- **Issue:** Node 18+ provides global `fetch`. `undici` is justified for pinned `Agent` in SSRF. `node-fetch` is used only in `_yahoo.js` for cookie/`headers.raw` handling.
- **Why it matters:** Three fetch implementations increase supply-chain surface and cognitive load.
- **Fix:** Migrate `_yahoo.js` to global `fetch` + `res.headers.getSetCookie?.()` (Node 18.14+) or share undici from `_ssrf.js`; drop `node-fetch` dependency if cookie parsing can be replicated.
- **Effort:** M

---

### Low

#### G2 — `npm audit`: zero vulnerabilities

- **Severity:** Low (positive)
- **Location:** `package.json` / lockfile (audit run 2025-06-30)
- **Issue:** `npm audit` reported **0 vulnerabilities**.
- **Why it matters:** Clean baseline at audit time.
- **Fix:** Re-run in CI periodically.
- **Effort:** S

#### G3 — `stripe` package: used server-side only; dormant relative to UI

- **Severity:** Low
- **Location:** `package.json:23`; `api/stripe.js:1-4`; no `src/` imports
- **Issue:** Stripe SDK is active in `api/stripe.js` but unused in client bundle. Pricing CTAs use email capture.
- **Why it matters:** Confirms dormant/TEST posture in UI; server checkout still live (see C1/C3).
- **Fix:** Align code with product (C3).
- **Effort:** S

#### G4 — No obviously unused runtime dependencies

- **Severity:** Low (positive)
- **Location:** `package.json`
- **Issue:** Spot-check: `jspdf` (dynamic import in `BriefPanel.jsx`), `fast-xml-parser` (`rss.js`), `maplibre-gl`, `react-grid-layout`, `@vercel/analytics` — all referenced. `undici` required for SSRF pinning.
- **Why it matters:** No clear dead weight beyond `node-fetch` overlap (G1).
- **Fix:** Remove `node-fetch` after G1.
- **Effort:** S

---

## H — Test coverage

### High

#### H1 — No automated tests in repository

- **Severity:** High
- **Location:** `package.json:6-10` (no `test` script); no `test/` or `*.test.*` files (only unrelated `LatestTicker.jsx` filename match)
- **Issue:** Zero unit, integration, or e2e tests.
- **Why it matters:** High-risk logic is unguarded against regressions.
- **Fix:** Add test runner when permitted; prioritize paths below.
- **Effort:** L

#### H2 — Highest-risk unguarded paths (priority order)

| Priority | Path | Risk |
|----------|------|------|
| 1 | `src/entitlements/resolve.js` | Wrong plan/capability → free Pro features or blocked paid users |
| 2 | `brief_insert_capped` RPC (`0006_settings_v11.sql`) | Race on monthly brief cap; billing integrity |
| 3 | `cloneRoom` (`src/data/workspacesRepo.js:101-136`) | ID remap bugs → broken widget/source graph after clone |
| 4 | `runAlertMatch` (`api/jobs.js:650-801`) | Three-layer match + dedup + channel dispatch; email/webhook/Telegram |
| 5 | `handleDeleteAccount` (`api/jobs.js:931-993`) | GDPR cascade completeness |

- **Severity:** High
- **Location:** files above
- **Issue:** No tests cover these paths.
- **Why it matters:** Silent failures have security, billing, and compliance impact.
- **Fix:** Characterization tests with fixtures for entitlements matrix, RPC cap edge cases, clone ID maps, alert merge/dedup snapshots, delete-account DB state assertions.
- **Effort:** L

---

## J — GDPR deletion & PII inventory

### Account-deletion cascade map

**Handler flow** (`api/jobs.js:931-993`): authenticated POST → rate limit → `confirm === 'DELETE'` → manual deletes → `email_signups` by email → log Stripe customer → `auth.admin.deleteUser`.

| Store | Deleted on account delete? | Mechanism |
|-------|---------------------------|-----------|
| `workspaces` | Yes | Manual delete + `ON DELETE CASCADE` from `auth.users` |
| `sources` | Yes | Manual delete + CASCADE |
| `subscriptions` | Yes | Manual delete + CASCADE |
| `briefs` | Yes | Manual delete + CASCADE |
| `alerts` | Yes | Manual delete + CASCADE |
| `alert_events` | Yes | Manual delete + CASCADE (also via alert FK) |
| `brief_schedules` | Yes | Manual delete + CASCADE |
| `email_signups` | Partial | Deleted only if `user.email` matches (`ilike`) |
| `feed_cache` | No | `tglink:*` rows may retain `user_id` in JSON (C4) |
| `rate_limits` | No | IP/bucket counters; not user-scoped |
| `auth.users` (+ metadata e.g. `telegram_chat_id`) | Yes | `auth.admin.deleteUser` |
| Stripe customer | No | Logged only (C5) |
| Resend / Telegram message history | N/A | Third-party processor retention outside DB |

**FK baseline:** `workspaces`, `sources`, `subscriptions`, `briefs`, `alerts`, `alert_events`, `brief_schedules` all reference `auth.users(id) ON DELETE CASCADE` (see migrations).

### GDPR findings (J section)

#### J1 — `email_signups` orphan gap for non-account and email-mismatch cases

- **Severity:** Medium
- **Location:** `api/jobs.js:971-980`; `0002_email_signups.sql`
- **Issue:** See C9.
- **Why it matters:** Art. 17 erasure for marketing data not tied to auth email.
- **Fix:** See C9.
- **Effort:** M

#### J2 — `feed_cache` tglink PII orphan

- **Severity:** High
- **Location:** See C4.
- **Issue:** See C4.
- **Why it matters:** UUID retained after erasure.
- **Fix:** See C4.
- **Effort:** S

#### J3 — Stripe processor data not erased

- **Severity:** Medium
- **Location:** See C5.
- **Issue:** See C5.
- **Why it matters:** Processor-held PII/identifiers.
- **Fix:** See C5.
- **Effort:** S

---

### PII inventory (10 tables)

| Table | PII fields | Cascaded on account delete? |
|-------|------------|----------------------------|
| **workspaces** | `name` (may identify topic/focus); `settings` JSON (e.g. weather city); `widgets`/`layout` JSON (monitoring interests); `share_token`, `public_slug` if shared | **Yes** (manual + CASCADE) |
| **sources** | `identifier`, `label`, `meta` (feed URLs, handles, symbols — interest/behavioral) | **Yes** |
| **subscriptions** | `user_id`; `stripe_customer_id`, `stripe_subscription_id` (indirect identifiers) | **Yes** (DB row); Stripe object **No** (J3) |
| **feed_cache** | Generally none; **exception:** `tglink:*` entries store `user_id` in `items` JSON | **No** (C4/J2) |
| **email_signups** | `email`; `source` (campaign tag) | **Partial** — only if email matches auth user (C9/J1) |
| **briefs** | `content` JSON (headlines, article titles/URLs monitored); `period` | **Yes** |
| **alerts** | `keyword`, `region` (monitoring intent); `webhook_url` (may embed tokens) | **Yes** |
| **alert_events** | `item_url`, `item_title`, `source`; timestamps | **Yes** (also cleaned >30d by cron) |
| **rate_limits** | `bucket` may embed endpoint + IP or `user.id` key suffix | **No** — ephemeral ops data, not user FK |
| **brief_schedules** | `user_id`, `workspace_id`, cadence/channel prefs | **Yes** |

**Additional PII outside these 10:** `auth.users` email, `user_metadata` (`telegram_chat_id`, notification prefs) — deleted with auth user. Contact form and email sends pass PII to Resend (processor DPA required for German registration).

---

## Prioritized punch list (this scope)

| # | Severity | Effort | Item |
|---|----------|--------|------|
| 1 | Critical | M | C1 — Authenticate Stripe checkout; bind uid/email server-side |
| 2 | High | M | C2 — Server-side workspace + alert cap enforcement |
| 3 | High | S | C3 — Disable/guard checkout until billing launch |
| 4 | High | S | C4/J2 — Purge `feed_cache` tglink rows on delete |
| 5 | High | L | H1/H2 — Add tests for entitlements, brief cap RPC, cloneRoom, alert match, delete cascade |
| 6 | Medium | S | C5/J3 — Delete Stripe customer on account erasure |
| 7 | Medium | S | C6 — Remove hardcoded `CONTACT_TO` fallback |
| 8 | Medium | S | C7 — Add rate limit + CORS to Stripe checkout |
| 9 | Medium | S | C8 — Contact `RESEND_API_KEY` guard |
| 10 | Medium | M | C9/J1 — Resolve `email_signups` erasure for landing-only / mismatch emails |
| 11 | Medium | M | G1 — Consolidate `node-fetch` into global fetch/undici |
| 12 | Medium | M | C10 — Fair alert-dispatch scheduling beyond `.limit(40)` |
| 13 | Low | S | G2 — Keep `npm audit` in CI |

---

*End of AUDIT_2. No files were modified except this report. No fixes were applied.*
