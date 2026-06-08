# Vigil — Pre-Launch Audit Report

**Date:** 2026-06-08
**Scope:** Full repository — React + Vite SPA, Vercel serverless functions (`/api`), Supabase (auth + Postgres + RLS), Stripe billing.
**Type:** Read-only audit. No code was modified. `npm audit` was run read-only.
**Method:** Direct source inspection of every file under `src/`, `api/`, `supabase/`, plus config/root files. Findings are evidenced with `file:line` references.

---

## 1. Executive Summary

Vigil is in good shape for an early-stage product. The hardest security boundaries are correct: **RLS is sound** (clients cannot write their own subscription plan, `feed_cache` is deny-all, users reach only their own rows), **all secrets are server-side** (`.env.local` is untracked; only `VITE_*` keys reach the bundle), the **Stripe webhook verifies signatures**, **`npm audit` reports 0 vulnerabilities**, and the **one-widget-crash-can't-take-down-the-room** invariant holds via `WidgetErrorBoundary`.

The launch-blocking issues are concentrated in the **serverless proxy layer (SSRF) and one XSS sink**, amplified by the **absence of HTTP security headers (no CSP)**. There is also a cluster of **billing-integrity gaps** (Pro capabilities are defined but never enforced; the webhook keeps users "pro" on failed payments) and a sizable amount of **dead/unshipped code** (Portfolio + brokerage endpoints, two unused constants files, vestigial dual state stores).

### Counts by severity

| Severity | Count | Headline items |
|---|---|---|
| **Critical** | 0 | — |
| **High** | 3 | SSRF in `api/rss.js`; SSRF in `api/fetch-article.js`; DOM XSS in Reader widget |
| **Medium** | 10 | No security headers; webhook ignores sub status; Pro capabilities unenforced; unauth brokerage endpoints; open-proxy + no rate-limit; Atlas popup attribute-injection; Livestream arbitrary iframe; no code-splitting; modal a11y; non-keyboard controls |
| **Low** | 27 | Misc hardening, dead code, token/contrast/a11y polish |

### What's already correct (verified PASS)

- RLS: `subscriptions` is SELECT-only for `authenticated`, **no client write policy** → no self-granting a plan (`0001_initial_schema.sql:95-100`). `feed_cache` RLS enabled with **zero policies** → deny-all to clients (`:78-84`). `sources`/`workspaces` scoped to `auth.uid() = user_id` (`:87-93`).
- `get_public_room` is `security definer` with `set search_path to ''` and filters `is_public = true` (`:103-138`).
- Secrets: service-role/Stripe/SnapTrade/FIRMS keys are all `process.env` in `/api`; client uses only `VITE_*` (`api/_supabase.js:3-4`, `src/lib/supabase.js:3-6`). `.env.local` is gitignored and **not tracked** (`git ls-files` shows only `.env.example`).
- Stripe webhook signature verification with raw body (`api/stripe.js:51-63`).
- `WidgetErrorBoundary` wraps every widget body; header lives outside it (`WidgetHost.jsx:119-130`).
- `npm audit` → **found 0 vulnerabilities**.

---

## 2. Security

### 🔴 HIGH

#### S1 — SSRF / open proxy in `api/rss.js`
**File:** `api/rss.js:262-270` (validation), `:133-143` (`fetchViaDirect`)
The only validation on the `url` query param is `/^https?:\/\//i`. There is **no private/internal-host filtering**, and the direct-fetch fallback uses `fetch(feedUrl, …)` with the default `redirect: 'follow'`. Any caller (CORS is `*`, `:263`) can make the Vercel function fetch arbitrary internal/cloud hosts (`http://169.254.169.254/…`, `http://localhost:…`, private ranges, or an attacker feed that 302-redirects to an internal host). Content that parses as RSS/Atom/RDF is reflected back; non-XML targets still allow blind SSRF (port/service probing). This is also driven automatically when anyone views a public room containing an RSS/Social widget.
**Fix:** Resolve the hostname and reject loopback/link-local/private/ULA ranges and non-public IPs **before and after redirects** (disable auto-redirect or re-validate each hop); add an allowlist or, at minimum, block metadata IPs; consider requiring an authenticated session and rate-limiting. Mirror the (stronger) approach intended in `fetch-article.js`.

#### S2 — SSRF with bypassable filter in `api/fetch-article.js`
**File:** `api/fetch-article.js:1` (`PRIVATE_HOST`), `:60-61`, `:67-76` (`redirect: 'follow'`), `:82-86`
The `PRIVATE_HOST` regex blocks `localhost`/`127.`/`10.`/`172.16-31.`/`192.168.` but **misses** `169.254.0.0/16` (cloud metadata/link-local), `0.0.0.0`, IPv6 (`::1`, `fc00::/7`), and alternate IP encodings (`http://2130706433/`, `0x7f000001`, octal). It also `redirect: 'follow'`s, so an external page can redirect to an internal host after the initial check passes. Because the handler **reflects response bodies** as article paragraphs and accepts `text/plain` (`:83`), this is a *reflected* SSRF that can read internal HTTP/IMDS responses.
**Fix:** Re-resolve and re-validate the host on every redirect (or set `redirect:'manual'` and re-check); block link-local/IPv6/0.0.0.0/encoded forms; keep the content-type allowlist but drop `text/plain` unless required.

#### S3 — DOM XSS in Reader widget (`dangerouslySetInnerHTML`)
**File:** `src/widgets/ReaderWidget.jsx:94`; source of payload `api/fetch-article.js:23-29` (`stripToText`), `:96` (`<p>${p}</p>`)
`article.content` is injected via `dangerouslySetInnerHTML`. The server "sanitizer" strips tags **then** decodes HTML entities (`stripToText`: `.replace(/<[^>]+>/g,'')` runs *before* `decodeEntities`). So a remote page whose `<p>` contains `&lt;img src=x onerror=…&gt;` survives tag-stripping as text, gets decoded into a live `<img onerror>`, is wrapped in `<p>…</p>`, and executes on render. With **no CSP** (see S4) and the Supabase session JWT stored in `localStorage`, this escalates to **session theft / account takeover**. Exploitation requires the user to load an attacker URL in the Reader (low-friction social engineering; a shared room can pre-fill the URL).
**Fix:** Sanitize on the client with a real sanitizer (e.g. DOMPurify) before `dangerouslySetInnerHTML`, **or** have `fetch-article` decode entities *before* stripping and then output escaped text / a strict allowlist. Add CSP as defense-in-depth.

### 🟠 MEDIUM

#### S4 — No HTTP security headers (no CSP, X-Frame-Options, etc.)
**File:** `vercel.json:1-3` (only a no-op rewrite), `index.html` (no CSP meta)
There is no Content-Security-Policy, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, or `Permissions-Policy`. This removes the primary mitigation for S3 and allows the app to be framed (clickjacking).
**Fix:** Add a `headers` block in `vercel.json` (or middleware). Start with `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN` (or `frame-ancestors 'self'`), HSTS, and a CSP that allows the known third parties (TradingView, YouTube, fonts, MapTiler/OpenFreeMap, unpkg, Supabase, Stripe) while disallowing inline script except the theme boot hash.

#### S5 — Webhook grants "pro" regardless of subscription status; entitlements ignore status
**File:** `api/stripe.js:88-102` (and `:71-87`); `src/data/subscriptionRepo.js:3-12`; `src/entitlements/resolve.js`
`customer.subscription.updated` always writes `plan: 'pro'` with `status: sub.status`, even for `past_due`, `unpaid`, `incomplete`. Entitlement resolution reads only `plan` + `add_ons` and **never consults `status`**, so a user whose payment fails retains full Pro until Stripe eventually fires `subscription.deleted` (potentially weeks of dunning).
**Fix:** Gate Pro on `status ∈ {active, trialing}` — either in the webhook (write `plan:'free'`/a `past_due` marker on non-active statuses) or in `resolveEntitlements`/`loadSubscription` (select `status` and downgrade when not active).

#### S6 — Pro capabilities are defined but never enforced (revenue leak)
**File:** `src/entitlements/index.js:2-20` (`can`, `priceMode` unused), `src/shell/WidgetHost.jsx:54` (`void entitlements`), all widgets
`resolveEntitlements` produces `capabilities` (`realtime_news`, `realtime_prices`, `full_widget_library`, `white_label`) and `priceMode`, but `can()`/`priceMode()` are **never called** anywhere (verified by grep). The widget picker (`Shell.jsx:440-465`) lists every widget for all plans, and `WidgetHost` explicitly discards `entitlements`. Only the free **count caps** (`workspaces`/`widgetsPerWorkspace`) are enforced (`shellStore.js:88,134`). Net effect: Pro's headline features (full widget library, realtime data, white-label) are not actually gated.
**Fix:** Decide what's gated, then enforce it — gate the widget picker and/or widget render on `can(ent, 'full_widget_library')`, and drive realtime/delayed behavior off `priceMode`. (Note: the *plan itself* is server-authoritative and safe; this is a client-side feature-gating gap, not a data-security one.)

#### S7 — Unauthenticated brokerage endpoints (third-party resource abuse)
**File:** `api/snaptrade-register.js:15-16`, `api/snaptrade-connect.js`, `api/snaptrade-accounts.js`, `api/snaptrade-holdings.js`, `api/snaptrade-brokers.js:10`, `api/bybit-portfolio.js:5-6`
These endpoints accept `userId`/`userSecret` (or raw `apiKey`/`apiSecret`) from the body with **no Supabase auth check and no rate limiting**. `snaptrade-register` will register arbitrary users against your SnapTrade account (consuming a paid quota) for any anonymous caller. They are also **not called by any client code** (no `src` reference — the Portfolio widget is unshipped, see H6), so this is live attack surface with zero current product benefit.
**Fix:** Remove these endpoints until the Portfolio feature ships, or bind them to a verified Supabase session (validate the bearer JWT server-side) and add rate limiting. Never accept exchange API secrets without an authenticated, consenting session.

#### S8 — Open-proxy CORS `*` + no rate limiting across `/api`
**File:** `api/rss.js:263`, `api/geo.js:245`, `api/fetch-article.js:49`, `api/search.js:4`, `api/symbol-search.js:79`
All data proxies send `Access-Control-Allow-Origin: *` and none are rate-limited, so any website can use Vigil's backend as a free proxy (and, via S1/S2, as an SSRF pivot).
**Fix:** Restrict CORS to the app origin(s) for non-public endpoints, add per-IP rate limiting, and (ideally) require a session for the fetch proxies.

#### S9 — Atlas popup attribute-injection XSS (escapeHtml used where escapeAttr/scheme-check needed)
**File:** `src/widgets/AtlasWorldGlobe.jsx:580-585` (`buildPhotoBlock`), helpers `:484-493`
Map popups are built as HTML strings and injected via maplibre `setHTML`. Most values are escaped correctly, but `buildPhotoBlock` interpolates `photo.src`/`photo.link` into double-quoted `src="…"`/`href="…"` attributes using `escapeHtml` — which does **not** escape `"`. A Planespotters photo whose metadata contains `"` can break out of the attribute and add an `onerror`/`onload` handler; `photo.link` is also not scheme-checked (`javascript:` possible). Data is third-party (user-contributed photo site) and requires clicking a specific aircraft, hence Medium.
**Fix:** Use `escapeAttr` for all attribute contexts and validate `photo.link`/`photo.src` are `http(s):` before emitting.

#### S10 — Livestream widget embeds arbitrary URLs, not just YouTube
**File:** `src/widgets/LivestreamWidget.jsx:10-24` (`toEmbedUrl` falls through to `return s`), `:103` (iframe `src`)
`toEmbedUrl` returns the raw input for any parseable non-YouTube URL, so the widget will iframe **any** site. In a shared/public room, a malicious author can embed attacker-controlled content that loads in every visitor's browser (the iframe has no `sandbox`).
**Fix:** Return `null` unless the resolved host is a YouTube embed host; render nothing for non-YouTube URLs. Add `sandbox` to the iframe.

### 🟡 LOW

- **S11 — Atlas third-party iframes lack `sandbox`/`referrerPolicy`.** `src/widgets/AtlasWidget.jsx:349-355` (liveuamap, shipfinder, adsbexchange, checkpoint). Add `sandbox="allow-scripts allow-same-origin allow-popups"` (tuned per embed) and `referrerPolicy="no-referrer"`.
- **S12 — Weak `postMessage` origin check.** `src/widgets/ChartWidget.jsx:51` uses `String(e.origin).includes('tradingview')` — matches `tradingview.evil.com`. Impact is limited (sets a URL-encoded `config.symbol`), but use an exact-origin allowlist.
- **S13 — `get_public_room` doesn't scope returned sources to the room owner.** `supabase/migrations/0001_initial_schema.sql:122-135` selects `sources` by id referenced in widget config without `s.user_id = room.user_id`. Source UUIDs are unguessable so practical risk is low, but add the owner filter as defense-in-depth (a malicious public room could otherwise surface another user's source row by id).
- **S14 — MapTiler key in client bundle.** `src/widgets/AtlasWorldGlobe.jsx:475-481`. Unavoidable for client maps, but ensure `VITE_MAPTILER_KEY` is domain-restricted in the MapTiler dashboard to prevent quota theft.
- **S15 — RTL text plugin loaded from `unpkg.com` without SRI.** `src/widgets/AtlasWorldGlobe.jsx:5-6`. Pin a version + add Subresource Integrity, or self-host.
- **S16 — Inconsistent password policy.** Signup requires 8+/mixed (`AuthScreen.jsx:4-10`) but the anonymous→Pro upgrade only requires 6 (`UpgradeModal.jsx:28`). Align them (and ensure Supabase Auth enforces the policy server-side, since client validation is bypassable).
- **S17 — Stripe success/cancel URL derived from the `Origin` header.** `api/stripe.js:35,43-44`. Low impact (attacker pays for their own session) but pin to an allowlist of known origins.
- **S18 — `.env.example` is stale/misleading.** `.env.example:1-6` references `VITE_MAPBOX_TOKEN` and "MapWidget.jsx" (neither exists) and omits every real variable (`VITE_SUPABASE_URL/ANON_KEY`, `VITE_MAPTILER_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_*`, `SNAPTRADE_*`, `FIRMS_MAP_KEY`, `RSS2JSON_KEY`). This risks launch misconfiguration (e.g. missing `STRIPE_WEBHOOK_SECRET` → webhook 400s; missing service role → subscription/feed writes silently skipped). Rewrite to list all required vars.

**XSS checked and SAFE:** `SocialFeedWidget.jsx:171-176` decodes entities via `textarea.innerHTML`→`.value` (RCDATA — tags not parsed); rendered as React text. RSS/News/Social titles & descriptions are rendered as escaped React children with tags pre-stripped (`RssFeedWidget.jsx:57`, `NewsSearchWidget.jsx:32`). Atlas non-photo popup rows use `escapeHtml`/`escapeAttr` correctly.

---

## 3. Dependencies

- **PASS — `npm audit`: found 0 vulnerabilities.**
- **D1 (Low) — Unused production dependencies.** `package.json:15` `leaflet`, `:16` `lightweight-charts`, `:22` `react-ts-tradingview-widgets` are not imported anywhere (charts/heatmap/prices use TradingView **iframes**, the globe uses `maplibre-gl`). They don't bloat the client bundle (Vite tree-shakes un-imported modules) but add install weight and supply-chain surface. Remove them.
- **D2 (Low) — `node-fetch` is only used server-side** (`api/_yahoo.js:1`); modern Vercel Node runtimes have global `fetch`, so it can likely be dropped. Verify the runtime, then remove.
- Versions are notably ahead of current GA (React 19.2, Vite 8, ESLint 10, Stripe SDK 22). Confirm these are intended/locked and that the deployed Vercel runtime matches.

---

## 4. Correctness & Robustness

**Verified correct:**
- **Error boundaries wrap every widget.** Both render paths (`Grid.jsx:71-84`, `PublicRoom.jsx:115-123`) go through `WidgetHost`, which wraps only the widget body in `WidgetErrorBoundary` with `resetKeys=[id, JSON.stringify(config)]` (`WidgetHost.jsx:119-129`). Header/controls stay outside, so a crashed widget can still be closed. ✔ (Invariant c)
- **Pause formula.** `isWorkspacePaused = pausedWorkspaces.includes(ws) || !globalLive || (ws !== activeWs && inactiveTabPause)` (`shellStore.js:201-205`), folded with per-widget pause as `effectivePaused = workspacePaused || widgetPaused` (`WidgetHost.jsx:56-57`). Correct and complete. ✔
- **react-grid-layout key === layout `i`.** `key={widget.id}` with `data-grid` from the layout item matched by `item.i === widget.id` (`Grid.jsx:61-68`, `PublicRoom.jsx:106-113`). ✔
- **Clone regenerates ids.** `cloneRoom` mints new widget ids via `genId('w')`, remaps `layout[].i` and filters orphans, and remaps `config.feeds[].sourceId` to freshly created sources (`workspacesRepo.js:101-133`). ✔
- **Entitlements resolution.** `resolveEntitlements` normalizes unknown plans→free and filters invalid add-ons (`resolve.js:30-51`); free caps enforced at `addWorkspace`/`addWidget` (`shellStore.js:88,134`). Plan is server-authoritative (only the webhook writes `subscriptions`). ✔

**Findings:**
- **C1 (Medium) — Two divergent `globalLive` sources.** `usePolling.js:8-11` and `WHeader.jsx:14-16` read `globalLive` from `settingsStore` (localStorage `vigil_global_settings`, default `true`), while the real toggle writes the **zustand** store (`Shell.jsx:24-27`). Nothing ever calls `saveSettings`, so `settingsStore.globalLive` is permanently `true` and `subscribeSettings` never fires. It currently works only because the actual pause flows through the `paused`/`isLive` prop path — but this is a latent bug and confusing dead state (the `settingsStore` default for `inactiveTabPause` is even the opposite of the zustand default). Consolidate onto the zustand store and delete `settingsStore`.
- **C2 (Low) — Clone keeps original `sourceId` when a feed references an unreturned source.** `workspacesRepo.js:115` falls back to `f.sourceId` when not in `idMap`, leaving a cloned widget pointing at the original owner's source id (unreadable under RLS, so it just silently yields no items). Drop unmapped feed refs instead.
- **C3 (Informational) — Caps are client-side only.** Acceptable: bypassing them only lets a user create extra *own* rows; it cannot grant paid capabilities or expose others' data (RLS). Document the decision.

---

## 5. Dead Code & Hygiene

- **H1 (Low) — `src/constants/templates.js` is entirely unused.** `DEFAULT_TEMPLATES`, `TEMPLATE_KEYWORDS`, `TEMPLATE_RSS_DEFAULTS`, `MIGRATION_FLAG` have no importers (seeding uses `SEED_WORKSPACES` in `shellStore.js:10-25`). Delete the file.
- **H2 (Low) — `src/constants/widgetTypes.js` is entirely unused.** `WIDGET_TYPES`/`WIDGET_CATALOG`/`WIDGET_DEFAULTS` have no importers; the live registry is `shell/widgetRegistry.js`. It also still lists retired/unshipped types (`feeds`, `conflict`, `portfolio`). Delete.
- **H3 (Low) — `src/domain/types.js` is mostly dead.** Only `PLANS`/`ADDONS` are used (by the DEV-only `EntitlementDebug`). `WIDGET_TYPES`, `SOURCE_TYPES`, and the typedefs (incl. the only `shareToken` reference) are unused. Trim to what's used.
- **H4 (Low) — `settingsStore.js` dead exports.** `saveSettings`, `toggleWorkspacePause`, `isWorkspacePaused` have no callers (`settingsStore.js:10-30`); duplicates of `shellStore` logic. Remove with C1.
- **H5 (Low) — `WHeader` default export + `LiveBtn` are unused.** Only `InfoTooltip` is imported (`NewsSearchWidget.jsx:4`). The `WHeader`/`LiveBtn` component (`WHeader.jsx:13-60`) is dead and carries the C1 vestige. Keep `InfoTooltip`, drop the rest.
- **H6 (Medium) — Portfolio/brokerage feature is half-wired.** `portfolio` appears in `constants/widgetTypes.js:14,30,46`, `domain/types.js:33`, and `index.css` (`.pf-*`, e.g. `:587,708`), but there is **no Portfolio component and no `widgetRegistry` entry**, so it can't render. Meanwhile the SnapTrade/Bybit endpoints (S7) are deployed and reachable. Either finish & gate the feature or remove the endpoints + CSS + constants before launch.
- **H7 (Low) — Unused entitlement helpers.** `can()` and `priceMode()` (`entitlements/index.js:2-20`) are never called (see S6).
- **H8 (Low) — Duplicate DB index.** `workspaces_user_local_uidx` duplicates the `workspaces_user_id_local_id_key` unique constraint on the same columns (documented at `0001_initial_schema.sql:72-75`). Drop one post-launch.
- **H9 (Low) — Legacy `share_token` column.** `workspaces.share_token` + its unique constraint (`0001_initial_schema.sql:50,67`) are unused at runtime — publishing uses `public_slug`/`get_public_room` (`workspacesRepo.js:62-99`). Plan a migration to drop it.
- **H10 (Low) — Dead globe stubs.** `flyToStub`/`fitBoundsStub` are defined and `void`-ed (`AtlasWorldGlobe.jsx:765-775`).
- **H11 (Low) — `README.md` is the default Vite template.** Replace with real setup/run/env/deploy docs (ties into S18).

---

## 6. Performance

- **P1 (Medium) — No code-splitting; all widgets + `maplibre-gl` load eagerly.** `shell/widgetRegistry.js:1-25` statically imports all 10 widgets, so the heavy `maplibre-gl` (and the full widget set) is in the initial bundle even for a room that shows only Weather. Use `React.lazy` + `Suspense` for widgets (especially `AtlasWorldGlobe`) and route-split `PublicRoom` vs `Shell`.
- **P2 (Low) — Globe rAF rotation loop runs continuously.** `AtlasWorldGlobe.jsx:1427-1444` reschedules `requestAnimationFrame(tick)` every frame for the widget's lifetime; only the rotation *math* is gated by `paused`. Stop scheduling when paused/offscreen. (Browsers throttle rAF on hidden tabs, so impact is small.)
- **P3 (Low) — Globe poll intervals aren't cleared on pause.** The four fetch effects (`AtlasWorldGlobe.jsx:802-894`) keep their `setInterval`s running and early-return inside the callback when paused, rather than clearing the timer. Functionally fine, minor waste.
- **Positives:** RSS/Social fan-out uses `Promise.allSettled` (parallel); widgets honor `usePageVisibility` + pause; iframes set `src=''`/`about:blank` when paused/inactive (`AtlasWidget.jsx:186`, `ChartWidget.jsx:81`, `HeatmapWidget.jsx:141`); sensible poll cadences (RSS 5m, Social 10m, news 2m, aircraft 20s, quakes 2m, storms 5m, wildfires 10m).

---

## 7. Accessibility

- **A1 (Medium) — Modals lack dialog semantics & focus management.** `UpgradeModal.jsx:89-90`, `AuthScreen` overlay (`Shell.jsx:497-506`, `AuthScreen.jsx:64-65`) have no `role="dialog"`/`aria-modal`, no focus trap, no Escape-to-close, and no focus restoration on close. Add these (a small focus-trap hook + `role="dialog" aria-modal="true"` + Esc handler + return focus to the trigger).
- **A2 (Medium) — Interactive `div`/`span`s aren't keyboard-operable.** Workspace tabs (`Shell.jsx:353-365`), RSS source rows/toggles (`RssFeedWidget.jsx:376-404`), filter chips, and similar use `onClick` on non-button elements with no `role`, `tabIndex`, or key handler — unreachable by keyboard and invisible to AT. Convert to `<button>` or add `role`/`tabIndex`/`onKeyDown`.
- **A3 (Low) — Popovers close on outside-click but not Escape; toggles miss ARIA.** The widget-picker button (`Shell.jsx:421-466`) lacks `aria-haspopup`/`aria-expanded` and Esc-to-close. (The Account menu does set `aria-expanded` on Appearance — good.)
- **A4 (Low) — `InfoTooltip` is a hover-only, non-focusable `span`.** `WHeader.jsx:4-10` — not keyboard/screen-reader reachable. Make it a `<button>` with `aria-describedby` and show on focus.
- **A5 (Low) — Borderline contrast for muted text on elevated dark surfaces.** `--color-text-muted:#7A8494` (`index.css:20`) over `--color-surface-2:#1A1F28` (`:14`) is ≈4.3:1 — under the 4.5:1 AA threshold for normal text, and muted text is used at 9–11px in many places. Verify with a contrast tool and nudge the token darker/lighter where it sits on surface-2.
- **Positives:** key icon buttons carry `aria-label`/`title` (`WidgetHost.jsx:102`, nav buttons); `prefers-reduced-motion` disables globe auto-rotation (`AtlasWorldGlobe.jsx:1368,1374`); `<html lang="en">`; heatmap selects/groups have `aria-label`/`role="group"`.

> Note: the design system *claims* WCAG-AA. Contrast was spot-checked manually, not exhaustively measured — run an automated audit (axe/Lighthouse) before asserting AA compliance.

---

## 8. Project Invariants

| Invariant | Status | Evidence |
|---|---|---|
| **(a)** Never hardcode fake/static data | ✅ Hold | All widgets fetch live sources (open-meteo, Google News, RSS, TradingView, USGS/GDACS/adsb.lol/NASA FIRMS). `DEFAULT_SYMBOLS`/`DEFAULT_ACCOUNTS`/`DEFAULT_STREAMS`/`SEED_WORKSPACES` are real default *configs*, not fabricated data. |
| **(b)** Components use semantic `--color-*` tokens | ⚠️ Mostly | Two token namespaces coexist — semantic `--color-*` and legacy aliases (`--bg`,`--surface`,`--accent`,`--green/red/amber`,`--text-*`) defined as live `var()` refs (`index.css:32-46`), so theming is correct. Genuine raw-hex violations beyond the documented exceptions (Atlas markers, RSS source colors): `#ff4d4f` error text in `RssFeedWidget.jsx:479` and `LivestreamWidget.jsx:98`, and `#1a2535` border in `RssFeedWidget.jsx:436`. Also scattered hex *fallbacks* in inline styles (e.g. `var(--bg,#0A0C10)` `Shell.jsx`, `WidgetHost.jsx`) whose literals don't even match the tokens. Low. |
| **(c)** One widget crashing never takes down the room | ✅ Hold | `WidgetErrorBoundary` per widget (`WidgetHost.jsx:119-130`); async/event errors handled with local try/catch + 200 responses. |
| **(d)** Only externally-embedded Atlas iframe tabs are credited | ✅ Hold | Each iframe tab has a credit (`AtlasWidget.jsx:46-51`, surfaced in the Sources panel `:317-324`). Globe data layers are *also* attributed in popups/panel (USGS/GDACS/adsb.lol/NASA FIRMS) and basemap via maplibre `attributionControl` — appropriate, not a violation. |

---

## 9. Prioritized "Fix-First" List

**Before launch (blockers):**
1. **S1 — SSRF in `api/rss.js`** — add host allow/deny filtering + redirect re-validation. *(High)*
2. **S2 — SSRF in `api/fetch-article.js`** — close the `PRIVATE_HOST` gaps (169.254/IPv6/encoded) + re-validate on redirect. *(High)*
3. **S3 — Reader XSS** — sanitize with DOMPurify (and fix decode-before-strip ordering). *(High)*
4. **S4 — Add security headers (CSP foremost)** in `vercel.json`. *(Medium; directly mitigates S3)*
5. **S7 / H6 — Remove or authenticate the SnapTrade/Bybit endpoints** (and the unshipped Portfolio scaffolding). *(Medium)*

**Before charging customers (billing integrity):**
6. **S5 — Gate Pro on subscription `status`** so failed payments downgrade. *(Medium)*
7. **S6 — Actually enforce Pro capabilities** (widget library / realtime / white-label) via `can()`/`priceMode()`. *(Medium)*

**Hardening (fast follows):**
8. **S8 — Lock down CORS + add rate limiting** on `/api`.
9. **S9 — `escapeAttr` + URL-scheme checks** in Atlas popups.
10. **S10 — Restrict Livestream to YouTube** + sandbox the iframe.
11. **S16/S17/S11–S15** — password-policy parity, origin allowlist for Stripe URLs, iframe sandboxing, exact postMessage origin, MapTiler domain-lock, SRI for unpkg.

**Correctness & a11y:**
12. **C1 — Consolidate `globalLive` onto the zustand store**; delete `settingsStore`/`WHeader` dead code.
13. **A1/A2 — Modal focus management + keyboard-operable controls.**

**Hygiene / cleanup (low risk, do anytime):**
14. **D1 — Remove unused deps** (`leaflet`, `lightweight-charts`, `react-ts-tradingview-widgets`).
15. **H1–H11 — Delete dead files/exports**; drop duplicate index + legacy `share_token`; rewrite `README.md` and `.env.example` (S18).
16. **P1 — Code-split widgets / `maplibre-gl`.**

---

*End of report. No source files were modified during this audit.*
