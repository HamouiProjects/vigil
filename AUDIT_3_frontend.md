# AUDIT 3: Product, Frontend & SEO

**HEAD:** `e99640a39344190e5102ebdbd6d5c1bafdff357c` (verified)  
**Date:** 2026-06-30

Vigil’s core shell is calm and token-driven, and the pricing table matches `resolve.js` on the numbers that matter (rooms, briefs, alerts, included live data). Launch readiness is held back by honest-copy drift in the shell and marketing pages (room/widget limits and paid-feature promises stated as if they apply to everyone), incomplete SEO plumbing (`robots.txt`, `sitemap.xml`, canonical tags), and uneven modal accessibility (focus trapping is only wired on settings and the welcome tour). Social preview assets are mostly correct: `og-image.png` exists at 1200×630 and meta tags are present, but brand casing in `<title>` and single-page OG metadata weaken share cards for deep links.

---

## Drift / recent-change note

Recent commits (`e99640a`, `0db54ce`, `4f7cd58`, `baf4a28`) focused on pricing reachability, contact form, Ukraine seed room, and About copy. Pricing footer links were pulled from the public landing footer pending Impressum completion; pricing remains reachable via direct URL, account menu, and Settings. Shell entitlement copy (`one room`, `12 widgets`, Stripe success nudges) was not updated alongside the `resolve.js` model where free tier gets **2 rooms** and **unlimited widgets**.

---

## D — Product, copy & design

### Critical

**D-1 · Room-cap modal contradicts entitlements**  
- **Severity:** Critical  
- **Location:** `src/shell/Shell.jsx:418-419`  
- **Issue:** Modal copy says “Free includes one room.” `resolve.js` grants free users `workspaces: 2`.  
- **Why it matters:** Users who already have two rooms see a false limit explanation; undermines trust and misstates the product.  
- **Fix:** Change copy to “Free includes 2 rooms” (or derive the number from `resolveEntitlements('free').limits.workspaces`).  
- **Effort:** S

**D-2 · Widget-cap nudge contradicts entitlements**  
- **Severity:** Critical  
- **Location:** `src/shell/Shell.jsx:317`  
- **Issue:** Nudge reads “Free includes 12 widgets per room. Upgrade for unlimited.” All tiers have `widgetsPerWorkspace: Infinity`; the nudge can never reflect real enforcement.  
- **Why it matters:** Dead, false copy; if it ever surfaces it promises a limit that does not exist and a paid unlock that is not real.  
- **Fix:** Remove the nudge path or replace with accurate messaging tied to `withinLimit` and actual caps.  
- **Effort:** S

**D-3 · Marketing pages promise paid features without qualification**  
- **Severity:** Critical  
- **Location:** `src/landing/Landing.jsx:217-221`, `src/landing/Landing.jsx:18-19`, `src/info/AboutPage.jsx:52-56`  
- **Issue:** Hero and cards describe scheduled briefs, alerts, email/Telegram/Slack/webhook delivery as general Vigil capabilities. Alerts and scheduled briefs are paid-only per `resolve.js`; Pro/Team are not live yet per pricing page.  
- **Why it matters:** Violates honest-copy convention; Reddit/HN visitors may believe free tier includes alerts and scheduled delivery.  
- **Fix:** Qualify paid-only features (“on Pro and Team, when available”) or move them behind the pricing/early-access framing used on `PricingPage.jsx`.  
- **Effort:** M

**D-4 · Post-upgrade nudge claims real-time is unlocked**  
- **Severity:** Critical  
- **Location:** `src/shell/Shell.jsx:267`  
- **Issue:** After `?upgraded=1`, nudge says “Welcome to Individual. Real-time data unlocked.” Real-time news and prices are free on all tiers (`resolve.js` capabilities).  
- **Why it matters:** Implies free tier lacks real-time data; contradicts entitlements and pricing table.  
- **Fix:** Replace with accurate plan welcome copy (rooms, briefs, alerts) or remove the nudge if checkout is not live.  
- **Effort:** S

### High

**D-5 · Legacy checkout copy in shell**  
- **Severity:** High  
- **Location:** `src/shell/Shell.jsx:275-276`  
- **Issue:** URL param `upgrade=cancelled` shows “Checkout cancelled.” Stripe is TEST; paid CTAs should be early-access email capture, not checkout.  
- **Why it matters:** Suggests live payment flow; mismatches legal copy and pricing page (“No payment is taken today”).  
- **Fix:** Remove Stripe return-param handling or retitle to early-access list messaging.  
- **Effort:** S

**D-6 · Plan naming inconsistency (Pro vs Individual)**  
- **Severity:** High  
- **Location:** `src/pricing/PricingPage.jsx:121` vs `src/settings/SettingsModal.jsx:24` vs `src/shell/Shell.jsx:267`  
- **Issue:** Pricing column is “Pro”; Settings and upgrade nudge use “Individual” for the same `pro` plan.  
- **Why it matters:** Confusing at purchase/settings boundary; weakens launch polish.  
- **Fix:** Pick one customer-facing name and use it in pricing, settings, and nudges.  
- **Effort:** S

**D-7 · Welcome tour unlock list overclaims widget limits**  
- **Severity:** High  
- **Location:** `src/shell/WelcomeTour.jsx:23-27`  
- **Issue:** `UNLOCK_FEATURES` includes “More rooms and widgets.” Widgets are already unlimited on free.  
- **Why it matters:** Misstates what paid plans add; tour is first-run product education.  
- **Fix:** List only real paid deltas (alerts, scheduled briefs, more rooms, team seats, white-label).  
- **Effort:** S

**D-8 · Impressum still placeholder**  
- **Severity:** High  
- **Location:** `src/legal/legalContent.jsx:7-24`  
- **Issue:** `[FULL LEGAL NAME]`, `[CONTACT EMAIL]`, register/VAT placeholders remain. Recent commit notes Impressum fill is pending.  
- **Why it matters:** EU launch and footer links to Impressum expose incomplete legal page.  
- **Fix:** Fill operator details before public launch; block footer links until ready or add visible “pending” banner.  
- **Effort:** M

### Medium

**D-9 · Em-dashes in user-visible UI copy**  
- **Severity:** Medium  
- **Location:** `src/widgets/NewsSearchWidget.jsx:63`, `src/widgets/LivestreamWidget.jsx:108`, `src/components/shared/WHeader.jsx:54`, `src/widgets/AtlasWorldGlobe.jsx:753` (missing-time glyph)  
- **Issue:** User-facing strings use `—` / `–` (rate-limit message, livestream empty state, collapse control, globe timestamps). Convention forbids em-dashes everywhere.  
- **Why it matters:** Style-spec violation; reads less calm/consistent than the rest of the product voice.  
- **Fix:** Replace with comma, colon, hyphen, or rephrase (“Rate limited. Retrying shortly.”, collapse “−” or “Collapse”).  
- **Effort:** S

**D-10 · Em-dashes in code comments (convention sweep)**  
- **Severity:** Medium  
- **Location:** Multiple, e.g. `src/App.css:262`, `src/settings/SettingsModal.jsx:1`, `src/index.css:2`, `src/shell/WidgetHost.jsx:28-29`  
- **Issue:** Numerous comments and section headers use em-dashes and `──` decorative rules.  
- **Why it matters:** Project convention is zero em-dashes in copy **or** comments.  
- **Fix:** Mechanical replace with commas or plain hyphen section labels.  
- **Effort:** M

**D-11 · Raw hex in UI outside documented exceptions**  
- **Severity:** Medium  
- **Location:** `src/App.css:432` (Leaflet `.leaflet-container`), `src/App.css:1478` (`.stream-iframe`), `src/widgets/RssFeedWidget.jsx:9,102`, `src/widgets/AtlasWidget.jsx:76,122,131`  
- **Issue:** Hard-coded `#0a0e1a`, `#000`, feed chip palette, aircraft chip color. Allowed exceptions are MapLibre globe markers, canvas charts, PDF/email surfaces only.  
- **Why it matters:** Breaks semantic token discipline; light theme and future palette changes will not flow through.  
- **Fix:** Map surfaces to `var(--color-*)` tokens; keep hex only in `AtlasWorldGlobe.jsx`, `TrendsChart`, and brief PDF paths.  
- **Effort:** M

**D-12 · Corner radius exceeds 4px cap**  
- **Severity:** Medium  
- **Location:** `src/App.css:1113,1131` (`border-radius: 10px`), `src/App.css:2820` (`5px` tour spotlight), `src/App.css:1716` and others at exactly `4px` (OK)  
- **Issue:** RSS filter chips and add affordance use 10px radius; tour spotlight uses 5px. Spec: calm, flat, at most 4px (circles excepted).  
- **Why it matters:** Visual drift from design system; chips look pill-shaped vs rest of UI.  
- **Fix:** Set to `var(--radius)` or `4px` max.  
- **Effort:** S

**D-13 · Pricing page aligned with `resolve.js` (positive check)**  
- **Severity:** N/A (no finding)  
- **Location:** `src/pricing/PricingPage.jsx:138-203` vs `src/entitlements/resolve.js:1-16`  
- **Issue:** None. Rooms 2/6/12, briefs 15/100/300, alerts 0/10/25, full widget library and real-time data included on all tiers, scheduled briefs and webhooks gated correctly. Early-access CTAs are honest.  
- **Why it matters:** Pricing is the entitlement source-of-truth mirror for launch.  
- **Fix:** N/A  
- **Effort:** N/A

**D-14 · “Vigil tracks, it does not verify” placement (positive check)**  
- **Severity:** N/A (no finding)  
- **Location:** `index.html:14`, `src/pricing/PricingPage.jsx:107`, `src/landing/Landing.jsx:267`, `src/shell/Shell.jsx:631`, brief/alerts surfaces  
- **Issue:** Disclaimer appears on meta, pricing, landing footer, shell bottom bar, and verification-adjacent flows.  
- **Fix:** N/A  
- **Effort:** N/A

### Low

**D-15 · Social feed “SOON” teasers**  
- **Severity:** Low  
- **Location:** `src/widgets/SocialFeedWidget.jsx:471-478`  
- **Issue:** Premium-layer platforms labeled SOON with tooltip; honest but easy to miss.  
- **Why it matters:** Minor clarity; not a false promise because platforms are disabled.  
- **Fix:** Optional: align label with “premium add-on” language used elsewhere.  
- **Effort:** S

**D-16 · Privacy page date placeholder**  
- **Severity:** Low  
- **Location:** `src/legal/legalContent.jsx:39`  
- **Issue:** `Last updated: [DATE]` not filled.  
- **Why it matters:** Legal polish for launch.  
- **Fix:** Insert actual date on publish.  
- **Effort:** S

---

## F — Accessibility

### High

**F-1 · Room-cap modal lacks focus trap and initial focus**  
- **Severity:** High  
- **Location:** `src/shell/Shell.jsx:398-441`  
- **Issue:** `role="dialog"` and `aria-modal` are set, but `useFocusTrap` is not used (unlike settings and welcome tour). Tab can escape to the shell behind the overlay.  
- **Why it matters:** Keyboard and screen-reader users lose context; violates expected modal pattern.  
- **Fix:** Apply `useFocusTrap` to the dialog container; focus first button on open.  
- **Effort:** S

**F-2 · Widget picker modal: no dialog semantics or focus trap**  
- **Severity:** High  
- **Location:** `src/shell/WidgetPicker.jsx:14-51`  
- **Issue:** Overlay modal has no `role="dialog"`, `aria-modal`, or focus trap. Close control has `title` only, no `aria-label`.  
- **Why it matters:** Primary “Add widget” flow is keyboard-hostile.  
- **Fix:** Add dialog role, label (“Add widget”), `useFocusTrap`, and `aria-label` on close.  
- **Effort:** S

**F-3 · Suggest sources panel: same modal gaps**  
- **Severity:** High  
- **Location:** `src/shell/SuggestSourcesPanel.jsx:177-183`  
- **Issue:** No `role="dialog"`, no focus trap, close is `title="Close"` only.  
- **Why it matters:** Long forms and async loading; trapping focus prevents accidental background interaction.  
- **Fix:** Mirror `SettingsModal` pattern.  
- **Effort:** S

**F-4 · Alerts drawer: no focus trap or `aria-modal`**  
- **Severity:** High  
- **Location:** `src/shell/AlertsDrawer.jsx:244-245`  
- **Issue:** `role="dialog"` and `aria-label` present; Escape closes (line 127), but focus is not trapped and `aria-modal="true"` is missing.  
- **Why it matters:** Drawer is a full-height panel; background shell remains tabbable.  
- **Fix:** Add `aria-modal="true"`, trap focus inside drawer on open, return focus to alerts launcher on close.  
- **Effort:** S

**F-5 · Brief panel: focus trap without dialog semantics**  
- **Severity:** High  
- **Location:** `src/shell/BriefPanel.jsx:288`, `src/shell/BriefPanel.jsx:851-853`  
- **Issue:** `useFocusTrap(modalRef)` is used, but the panel lacks `role="dialog"`, `aria-modal`, and accessible name.  
- **Why it matters:** Screen readers may not announce it as a modal; inconsistent with settings/tour.  
- **Fix:** Add `role="dialog"`, `aria-modal="true"`, `aria-label="Room brief"`.  
- **Effort:** S

**F-6 · Nav reveal handle not keyboard-operable**  
- **Severity:** High  
- **Location:** `src/shell/Shell.jsx:473-475`  
- **Issue:** `div.nav-reveal-handle` has `onClick` and `aria-label` but no `role="button"`, `tabIndex={0}`, or key handler.  
- **Why it matters:** When the toolbar is collapsed, keyboard users cannot restore it.  
- **Fix:** Use `<button type="button">` or add `role="button"`, `tabIndex={0}`, Enter/Space handler.  
- **Effort:** S

### Medium

**F-7 · `.widget-btn` lacks visible focus style**  
- **Severity:** Medium  
- **Location:** `src/App.css:514-522`  
- **Issue:** Icon buttons (widget chrome, many modal closes) have hover styles only; no `:focus-visible` ring. `.nav-add-btn` has focus-visible (line 1513); widget buttons do not.  
- **Why it matters:** Keyboard users cannot see focus on high-frequency controls.  
- **Fix:** Add `:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }` matching nav buttons.  
- **Effort:** S

**F-8 · Workspace tabs suppress focus outline**  
- **Severity:** Medium  
- **Location:** `src/App.css:113-117`  
- **Issue:** `.ws-tab:focus-visible { outline: none; }` relies on background change only.  
- **Why it matters:** Focus indicator may be insufficient on greige light theme or for low-vision users.  
- **Fix:** Keep background cue and add visible outline or high-contrast ring.  
- **Effort:** S

**F-9 · Account menu missing `aria-expanded` and Escape**  
- **Severity:** Medium  
- **Location:** `src/shell/AccountMenu.jsx:22-29`  
- **Issue:** Launcher has `aria-label` but not `aria-expanded`; menu does not close on Escape; no roving focus.  
- **Why it matters:** Standard disclosure pattern for avatar menus.  
- **Fix:** Toggle `aria-expanded`; close on Escape; optional focus first menu item on open.  
- **Effort:** S

**F-10 · Upgrade nudge not announced to assistive tech**  
- **Severity:** Medium  
- **Location:** `src/shell/Shell.jsx:67-103`  
- **Issue:** Toast-like nudge has no `role="status"` or `aria-live="polite"`. Dismiss control lacks `aria-label` (only `title="Dismiss"`).  
- **Why it matters:** Screen-reader users miss entitlement/limit feedback.  
- **Fix:** Wrap message in `role="status"` + `aria-live="polite"`; label dismiss button.  
- **Effort:** S

**F-11 · Alerts tabs incomplete tab pattern**  
- **Severity:** Medium  
- **Location:** `src/shell/AlertsDrawer.jsx:252-270`  
- **Issue:** Tabs use `role="tab"` and `aria-selected` but lack `aria-controls`, associated tabpanels, and `id` wiring.  
- **Why it matters:** Screen readers may not connect tabs to panel content.  
- **Fix:** Add `id`/`aria-controls`/`role="tabpanel"` pairs per WAI-ARIA tabs pattern.  
- **Effort:** M

**F-12 · `prefers-reduced-motion` gaps on ambient pulses**  
- **Severity:** Medium  
- **Location:** `src/App.css:177` (`.status-dot::before`), `src/App.css:1346` (`.article-loading-text`), `src/App.css:1501` (`.stream-live-badge::before`)  
- **Issue:** `animation: pulse` runs without `@media (prefers-reduced-motion: reduce)` overrides. Welcome tour, modal overlays, latest ticker, and landing globe honor reduced motion.  
- **Why it matters:** Vestibular sensitivity; inconsistent with stated design intent elsewhere.  
- **Fix:** Set `animation: none` under `prefers-reduced-motion: reduce` for these selectors.  
- **Effort:** S

**F-13 · Latest ticker manual step ignores reduced motion**  
- **Severity:** Low  
- **Location:** `src/shell/LatestTicker.jsx:131-139`  
- **Issue:** `step()` always runs fade transition; `advance()` respects `reduceMotion` but manual prev/next does not.  
- **Why it matters:** Minor motion when user requested reduced motion.  
- **Fix:** Skip fade timeout when `reduceMotion` is true.  
- **Effort:** S

### Low

**F-14 · Share notice and anon nudge: no focus management**  
- **Severity:** Low  
- **Location:** `src/shell/Shell.jsx:444-469`, `src/App.jsx:72-100`  
- **Issue:** `role="status"` dialogs lack focus trap and initial focus (acceptable for passive notices, but buttons are not focused on open).  
- **Why it matters:** Minor keyboard friction on dismissible notices.  
- **Fix:** Focus primary button on mount or use alertdialog only when action is required.  
- **Effort:** S

**F-15 · Settings modal and welcome tour (positive check)**  
- **Severity:** N/A  
- **Location:** `src/settings/SettingsModal.jsx:89,109-114`, `src/shell/WelcomeTour.jsx:77,322-328`  
- **Issue:** Both use `useFocusTrap`, `aria-modal`, Escape handling, and reduced-motion classes on tour.  
- **Fix:** N/A  
- **Effort:** N/A

---

## I — SEO & social meta

### Critical

**I-1 · `robots.txt` missing**  
- **Severity:** Critical  
- **Location:** `public/` (file absent; confirmed `Test-Path` false)  
- **Issue:** No `public/robots.txt`.  
- **Why it matters:** Crawlers lack explicit allow/disallow and sitemap pointer; weakens indexing control at launch.  
- **Fix:** Add `public/robots.txt` with `User-agent: *`, `Allow: /`, and `Sitemap: https://thevigilroom.com/sitemap.xml`.  
- **Effort:** S

**I-2 · `sitemap.xml` missing**  
- **Severity:** Critical  
- **Location:** `public/` (file absent)  
- **Issue:** No sitemap for homepage and `/?p=` routes (about, faq, pricing, legal).  
- **Why it matters:** Slower discovery of marketing and legal pages for launch channels.  
- **Fix:** Add static `public/sitemap.xml` listing `https://thevigilroom.com/` and key `?p=` URLs with `lastmod`.  
- **Effort:** S

### High

**I-3 · `<title>` brand casing inconsistent with OG/Twitter**  
- **Severity:** High  
- **Location:** `index.html:13` vs `index.html:17,24`  
- **Issue:** `<title>vigil</title>` (lowercase) vs `og:title` / `twitter:title` “Vigil”.  
- **Why it matters:** Browser tab and search result title look off-brand next to social cards saying “Vigil”.  
- **Fix:** Set `<title>Vigil</title>` or “Vigil | calm operations room” with consistent casing.  
- **Effort:** S

**I-4 · No `link rel="canonical"`**  
- **Severity:** High  
- **Location:** `index.html` (entire `<head>`)  
- **Issue:** Canonical URL not declared; only `og:url` points to `https://thevigilroom.com/`.  
- **Why it matters:** SPA query routes (`/?p=pricing`, etc.) may dilute signals without per-route or root canonical strategy.  
- **Fix:** Add `<link rel="canonical" href="https://thevigilroom.com/" />` at minimum; consider build-time or server headers for subpages.  
- **Effort:** S

**I-5 · Single OG/Twitter set for all SPA routes**  
- **Severity:** High  
- **Location:** `index.html:14-26`, `src/App.jsx:130-188`  
- **Issue:** All routes share one description and `og:url` (homepage). Sharing `/?p=pricing` or `/?p=about` still previews as generic homepage.  
- **Why it matters:** Launch posts to specific pages will show wrong or thin previews.  
- **Fix:** Per-route meta via small head manager, or prerender/static HTML for marketing routes.  
- **Effort:** M

### Medium

**I-6 · `theme-color` / manifest locked to dark palette**  
- **Severity:** Medium  
- **Location:** `index.html:10-11`, `public/site.webmanifest:22-23`  
- **Issue:** `#0B0E13` always, though app supports warm greige light theme.  
- **Why it matters:** Mobile browser chrome stays dark when user prefers light; minor brand inconsistency in shares/install.  
- **Fix:** Match `theme-color` to active theme or use neutral token; optional `media="(prefers-color-scheme: dark)"` pair.  
- **Effort:** S

**I-7 · OG image and dimensions (positive check)**  
- **Severity:** N/A  
- **Location:** `public/og-image.png`, `index.html:20-22`  
- **Issue:** Asset exists (72,701 bytes), measures **1200×630**, meta width/height match. URLs use absolute `https://thevigilroom.com/og-image.png`.  
- **Fix:** N/A  
- **Effort:** N/A

**I-8 · Core meta description and verification line (positive check)**  
- **Severity:** N/A  
- **Location:** `index.html:14-15,18`  
- **Issue:** Description includes “Vigil tracks, it does not verify.” OG and Twitter descriptions match.  
- **Fix:** N/A  
- **Effort:** N/A

### Low

**I-9 · No `twitter:site` or `og:locale`**  
- **Severity:** Low  
- **Location:** `index.html`  
- **Issue:** Optional tags absent.  
- **Why it matters:** Minor; cards still render with `summary_large_image`.  
- **Fix:** Add `@handle` and `og:locale` when social accounts are fixed.  
- **Effort:** S

**I-10 · `mask-icon` uses raw hex**  
- **Severity:** Low  
- **Location:** `index.html:8`  
- **Issue:** `color="#46C2B6"` on mask icon (outside CSS token system).  
- **Why it matters:** Negligible for SEO; minor convention drift in HTML head.  
- **Fix:** Acceptable as brand pin color or document as fourth static exception.  
- **Effort:** S

---

## Prioritized punch list (this audit scope)

| Priority | ID | Severity | Effort | Summary |
|----------|-----|----------|--------|---------|
| 1 | D-1 | Critical | S | Fix room-cap copy: 2 rooms on free, not 1 |
| 2 | D-2 | Critical | S | Remove or fix false 12-widget / unlimited nudge |
| 3 | D-3 | Critical | M | Qualify paid features on landing and About |
| 4 | I-1, I-2 | Critical | S | Add `robots.txt` and `sitemap.xml` |
| 5 | D-4, D-5 | Critical/High | S | Fix Stripe-era upgrade/checkout strings in shell |
| 6 | F-1–F-6 | High | S–M | Focus traps and keyboard fixes on all modals/drawer/nav reveal |
| 7 | I-3, I-4 | High | S | Align `<title>` casing; add canonical link |
| 8 | D-6, D-7 | High | S | Unify Pro/Individual naming; fix tour unlock list |
| 9 | I-5 | High | M | Per-route OG/meta for shareable deep links |
| 10 | D-8 | High | M | Complete Impressum placeholders |
| 11 | D-9, D-10 | Medium | S–M | Em-dash sweep (UI + comments) |
| 12 | D-11, D-12 | Medium | S–M | Tokenize stray hex; cap border-radius at 4px |
| 13 | F-7–F-12 | Medium | S | Focus rings, account menu, aria-live, reduced-motion pulses |
| 14 | I-6 | Medium | S | Theme-aware `theme-color` / manifest colors |

---

*Audit performed read-only at `e99640a`. No application files were modified except this report.*
