# Vigil Architecture Audit 1

**HEAD:** `e99640a39344190e5102ebdbd6d5c1bafdff357c`  
**Date:** 2025-06-30

Vigil is in workable shape for a ~20k-line SPA: routing, Zustand, lazy widgets, and action-routed `api/jobs.js` are coherent. Health is dragged down by confirmed dead code (conflict-detail pipeline, vestigial EU seed, Leaflet CSS, unused modules), four monolith files that resist review, duplicate pause/settings utilities, and a Shell chunk that eagerly pulls grid layout plus every shell overlay. Bundle work is mostly structural (split CSS, lazy shell panels, optional manual chunks) rather than new dependencies.

---

## Recent drift (git log)

Recent commits (last ~2 weeks) focused on go-to-market surfaces, not core grid/globe refactors:

- **Pricing / About / Contact / FAQ:** dedicated `?p=` routes, `ContactForm`, footer and account-menu links, Impressum/Privacy copy updates.
- **Onboarding seed:** newcomers get `UKRAINE_TEMPLATE` via `cloneRoom`; legacy `SEED_WORKSPACES` in `shellStore` was not removed.
- **Contact backend:** `jobs?action=contact` (Resend, rate-limited).
- **Alerts:** per-rule snooze, in-app activity order aligned with outbound channels.
- **Entitlements:** realtime + full widgets free; tier caps 2/6/12 workspaces.

The repo is actively shipping product polish while structural debt (globe dead code, monolith CSS, `jobs.js` size) accumulates.

---

## A) Structure and bloat

### A1. Confirmed dead code (known + additional)

| Item | Location | Status |
|------|----------|--------|
| `fetchConflictArticles` | `src/widgets/AtlasWorldGlobe.jsx:958` | Defined, never called (only definition hits) |
| `conflictArticlesHtml` | `src/widgets/AtlasWorldGlobe.jsx:975` | Defined, never called |
| `source=conflict-detail` branch | `api/geo.js:543-558`, handler `483-499` | Only reachable from dead client helper |
| `SEED_WORKSPACES` | `src/state/shellStore.js:9-76` | Superseded by `UKRAINE_TEMPLATE` in `useShellPersistence`; only used as initial store default before hydrate |
| `BL10_TEMPLATE` | `src/data/seedTemplate.js:1` | Exported, never imported (UKRAINE template is the live seed) |
| `UpgradeModal.jsx` | `src/shell/UpgradeModal.jsx` | Entire component unused after pricing-page retire |
| Leaflet / conflict-map CSS | `src/App.css:372-443` | No `leaflet` references in any `.jsx`/`.js` |
| `flyToStub` / `fitBoundsStub` | `src/widgets/AtlasWorldGlobe.jsx:1058-1069` | Explicit stubs, `void`-suppressed, not wired |
| `WHeader` default export | `src/components/shared/WHeader.jsx:44` | Unused; only `InfoTooltip` imported (`NewsSearchWidget.jsx:4`) |
| `WIDGET_TYPES`, `SOURCE_TYPES` | `src/domain/types.js:31-38` | Exported, never imported |
| `settingsStore` pause API | `src/utils/settingsStore.js:22-29` | `isWorkspacePaused` / `toggleWorkspacePause` unused; shell uses Zustand |
| `settingsStore.saveSettings` | `src/utils/settingsStore.js:10` | Only called internally by `toggleWorkspacePause` (also dead) |
| `BriefLLMNotConfiguredError` | `api/_brief_core.js:1` | ESLint: defined, never used |
| `DISCOVERY_PROBE_TIMEOUT_MS` | `api/jobs.js:1282` | Assigned, never used |

---

### A2. Vestigial-folder export audit

| Path | Export | Used? |
|------|--------|-------|
| `src/domain/types.js` | JSDoc typedefs | N/A (types only) |
| | `WIDGET_TYPES`, `SOURCE_TYPES` | **No** |
| | `PLANS`, `ADDONS` | Yes (`EntitlementDebug.jsx`, dev only) |
| `src/hooks/useFocusTrap.js` | `useFocusTrap` | Yes (BriefPanel, SettingsModal, WelcomeTour) |
| `src/hooks/usePageVisibility.js` | default | Yes (RSS, Social, News, Weather, Livestream) |
| `src/hooks/usePolling.js` | `usePolling` | Yes (RSS, Social) |
| `src/state/shellStore.js` | `useShellStore`, `isWorkspacePaused` | Yes |
| | `SEED_WORKSPACES` | Dead initial default (see A1) |
| `src/utils/settingsStore.js` | `getSettings`, `subscribeSettings` | Yes (WHeader LiveBtn, usePolling) |
| | `saveSettings`, `isWorkspacePaused`, `toggleWorkspacePause` | **No** |
| `src/utils/theme.js` | all four exports | Yes (`main.jsx`, Shell) |
| `src/components/shared/SkeletonLoader.jsx` | `SkeletonLine`, `SkeletonFeedItems` | Yes |
| `src/components/shared/WHeader.jsx` | `InfoTooltip` | Yes |
| | default `WHeader` | **No** (WidgetHost owns headers now) |

---

### A3. Monolith splittability (concrete cut lines)

#### `src/App.css` (2952 lines)

Split into co-located CSS modules imported by the owning surface (no new deps):

| New file | Source lines | Contents |
|----------|--------------|----------|
| `src/shell/shell.css` | 8-241 | Nav, workspace tabs, save indicator, live button, grid area |
| `src/shell/grid.css` | 247-276 | react-grid-layout overrides, resize handles |
| `src/widgets/widgets-shared.css` | 278-340, 479-530 | Tokens aliases, widget shell, skeleton, info tooltip |
| `src/widgets/atlas.css` | 340-371, 504-528, 2414-2455, 2501-2515 | Atlas tabs, loading bar, fullscreen |
| `src/widgets/news-search.css` | 556-690 | News Search tabs and sidebar |
| `src/widgets/rss.css` | 691-1240 | RSS filters, feed layout, autocomplete |
| `src/widgets/weather.css` | 1241-1307 | Weather widget |
| `src/widgets/chart.css` | 1308-1313 | TV Chart |
| `src/widgets/reader.css` | 1314-1426 | Reader / browser |
| `src/widgets/social.css` | 1427-1469 | Social feed |
| `src/widgets/livestream.css` | 1470-1503 | Livestream |
| `src/shell/modals.css` | 1504-1678 | Nav buttons, context menu, FAB, add-widget modal |
| `src/shell/brief.css` | 1679-1973 | Brief panel |
| `src/shell/alerts.css` | 1974-2407 | Alerts drawer |
| `src/shell/ticker.css` | 2516-end | Latest ticker |
| **Delete** | 372-443 | Leaflet block (dead) |

Keep a thin `App.css` for splash and cross-route primitives only.

#### `src/widgets/AtlasWorldGlobe.jsx` (2083 lines)

| New module | Lines | Responsibility |
|------------|-------|----------------|
| `atlasGlobeTheme.js` | 44-130, 470-535 | Theme, layer colors, swatch CSS |
| `atlasGeoUtils.js` | 164-252, 1051-1056 | Point-in-polygon, country hit-test, TC filter |
| `atlasPopups.js` | 650-1050 | Popup HTML builders (delete 958-997 with conflict-detail) |
| `atlasLayers.js` | 579-648, 1300-1380 | Fetch/geo helpers, style chain |
| `AtlasWorldGlobe.jsx` | 1071-end | Component, map init (~1402+), effects, imperative handle |

#### `api/jobs.js` (1888 lines, 9 actions)

Stay within action-router constraint; split into private modules imported by `jobs.js` (no new Vercel functions):

| Module | Approx lines | Actions / scope |
|--------|--------------|-----------------|
| `api/_jobs_brief_email.js` | 1-400 | `email-brief`, sanitizers, email HTML/text |
| `api/_jobs_alerts.js` | 399-832 | `alert-dispatch`, `alert-poll`, match geometry |
| `api/_jobs_telegram.js` | 833-930 | `telegram-link-start`, `telegram-webhook` |
| `api/_jobs_account.js` | 931-1110 | `delete-account`, `email-signup`, `contact` |
| `api/_jobs_scheduled.js` | 1111-1300 | Scheduled brief dispatch, cleanup |
| `api/_jobs_suggest.js` | 1301-1857 | `suggest-sources` (RSS discovery, symbols, social) |
| `jobs.js` | ~80 | CORS, rate limit, action switch only |

#### `src/shell/BriefPanel.jsx` (1147 lines)

| Module | Lines | Responsibility |
|--------|-------|----------------|
| `briefPanelFormat.js` | 10-254 | `isHttpUrl`, plaintext/PDF item formatters, `briefToPlainText` |
| `briefPanelPdf.js` | 147-218, 557-848 | SVG/PNG rasterize, jsPDF (already dynamic `import('jspdf')`) |
| `BriefPanel.jsx` | 256-556, 851-1147 | State, fetch brief, schedule, JSX |

---

### A4. Convention: em-dashes

**Severity: Low** (copy/comments convention, widespread)

Em-dashes (`—`, U+2014) appear in src comments, CSS section headers, and some UI strings. Examples:

- `src/App.css:262,274,556,...` (section comments)
- `src/index.css:2,118,308,326`
- `src/widgets/NewsSearchWidget.jsx:63` user-facing: `Rate limited — retrying shortly`
- `src/widgets/LivestreamWidget.jsx:108`: `No stream — YouTube links only`
- `src/widgets/AtlasWorldGlobe.jsx:753,883` (empty time placeholder)
- `src/components/shared/WHeader.jsx:54` collapse glyph `'—'`
- Multiple file-header comments (`AccountMenu.jsx`, `SettingsModal.jsx`, `theme.js`, etc.)

**Fix:** Replace with periods, commas, parentheses, or the word "to" for ranges. For the collapse control, use `-` or an icon.  
**Effort:** M (mechanical sweep)

---

### A5. Convention: raw hex in UI CSS

**Severity: Medium**

Documented exceptions: MapLibre markers (`AtlasWorldGlobe.jsx:44-489`), canvas charts (`TrendsChart.jsx` uses semantic tokens), PDF/email surfaces.

Violations / gray areas:

- `src/App.css:432` `#0a0e1a` on `.leaflet-container` (dead Leaflet block)
- `src/App.css:1478` `#000` iframe background (Livestream)
- `src/App.css:2420` `var(--bg, #0A0C10)` fallback hex
- `src/shell/WidgetHost.jsx:64` inline `var(--color-bg, #0A0C10)`

`index.css` primitive palette hex is acceptable as token source.

**Fix:** Remove Leaflet block; replace remaining UI hex with semantic tokens or documented exceptions.  
**Effort:** S

---

### A6. Duplicate utilities

**Severity: Medium**

- `isHttpUrl` / `hostnameOf`: duplicated in `BriefPanel.jsx:13-18`, `api/jobs.js:17-22`, `api/_brief_core.js:17`, `SuggestSourcesPanel.jsx:11` (partial).
- Workspace pause: Zustand (`shellStore`) is canonical; `settingsStore` still exports a parallel pause API (dead).
- `widgetRegistry.js:18-20` comment says weather/map never in brief; `BRIEF_ELIGIBLE_TYPES` includes `weather`; `gatherRoomItems.js` implements `gatherWeather` (lines 254+). Comment is stale, not behavior.

**Fix:** Centralize URL helpers in `src/lib/briefFormat.js` or `api/_brief_core.js` and import everywhere; delete dead `settingsStore` pause exports; align `BRIEF_ELIGIBLE_TYPES` comment with `gatherWeather`.  
**Effort:** S

---

### A7. `gatherRoomItems` couples lib to widgets

**Severity: Medium**  
**Location:** `src/lib/gatherRoomItems.js:1-3`

Imports `GN_SEARCH_URL`, `KF_DEFAULT_TABS` from `NewsSearchWidget.jsx`, `SUGGESTIONS` from `RssFeedWidget.jsx`, `PLATFORMS` from `SocialFeedWidget.jsx`. Pulling brief gather into a widget file creates a reverse dependency risk (widget bundle ↔ brief).

**Fix:** Move shared constants (`GN_SEARCH_URL`, default tabs, platform list) to `src/lib/feedSources.js` or a small `src/lib/widgetDefaults.js`.  
**Effort:** M

---

## B) Architecture

### B1. App.jsx routing: early-return chain

**Severity: Medium**  
**Location:** `src/App.jsx:129-243`

Routing uses sequential `?p=` checks (`impressum|privacy|terms|faq|about|pricing|contact`) plus `?r=` share slug, then auth-gated Shell vs Landing. Works but scales poorly: each new public page adds another branch, duplicates `Suspense`/`AppErrorBoundary` wrappers, and extends the auth `useEffect` guard list (lines 141-162).

**Fix:** Replace with a small route table: `{ id, test: (p) => ..., component, skipAuth: true }` and a single map/render. No router dependency required.  
**Effort:** M

---

### B2. Single Zustand store for entire shell

**Severity: Low**  
**Location:** `src/state/shellStore.js`

One `useShellStore` holds workspaces, layout, sources, entitlements, pause flags, and mutations. Clear for now; `Shell.jsx` and `Grid.jsx` subscribe broadly. Fine at current scale.

**Fix:** If perf issues appear, split `sources` into a selector hook or slice pattern (Zustand middleware). Not urgent.  
**Effort:** L

---

### B3. Shell eagerly imports heavy shell panels

**Severity: High**  
**Location:** `src/shell/Shell.jsx:8-14,21`

`Grid`, `BriefPanel`, `AlertsDrawer`, `WelcomeTour`, `SuggestSourcesPanel`, and `AuthScreen` are static imports. Only `SettingsModal` is `lazy()`. Opening the app authenticated loads brief UI, alerts, tour, and suggest-sources code even if never opened.

`BriefPanel` synchronously imports `TrendsChart` (`BriefPanel.jsx:8`), pulling chart code into the Shell chunk.

**Fix:** `lazy()` + `Suspense` for BriefPanel, AlertsDrawer, WelcomeTour, SuggestSourcesPanel; keep Grid eager (needed immediately). Lazy `TrendsChart` inside BriefPanel when brief opens.  
**Effort:** M

---

### B4. `api/jobs.js` cross-imports `src/`

**Severity: Medium**  
**Location:** `api/jobs.js:5,10`

Server imports `../src/entitlements/resolve.js` and `../src/lib/briefFormat.js`. Works on Vercel but couples API deployment to client tree layout; entitlements logic changes can break cron jobs silently.

**Fix:** Move shared pure modules to `api/_shared/` or top-level `shared/` imported by both `src` and `api` (no new npm deps).  
**Effort:** M

---

### B5. Action-router pattern is sound; `suggest-sources` is the growth risk

**Severity: Medium**  
**Location:** `api/jobs.js:1802-1888`

Nine actions in one handler matches project rules. `handleSuggestSources` plus RSS discovery (~550 lines) dominates file size and cold-start time. Comment at 1863 correctly forbids per-job functions.

**Fix:** Extract modules per A3; consider tighter deadline budgets for discovery (already has soft/hard deadlines).  
**Effort:** M

---

### B6. API helper layout

**Severity: Low**

Helpers (`_supabase`, `_yahoo`, `_ssrf`, `_cors`, `_ratelimit`, `_brief_core`, `_brief_gather`, `_brief_llm`) are consistently prefixed and scoped. `brief.js` remains a separate on-demand endpoint (appropriate). `geo.js`, `rss.js`, `trends.js`, `search.js`, `stripe.js` are thin proxies.

**Fix:** None required; keep new backend actions on `jobs.js` only.  
**Effort:** N/A

---

### B7. Persistence vs seed inconsistency

**Severity: Medium**  
**Location:** `src/state/shellStore.js:76`, `src/data/useShellPersistence.js:28-30`

Store boots with `SEED_WORKSPACES` ("EU & China" demo); persistence clones `UKRAINE_TEMPLATE` for empty accounts. Until `hydrate` runs, devtools and tests see the wrong default room.

**Fix:** Initialize `workspaces: []` and `loaded: false`; remove `SEED_WORKSPACES` export.  
**Effort:** S

---

### B8. Public share path

**Severity: Low**  
**Location:** `src/App.jsx:214-221`, `src/shell/PublicRoom.jsx`

Share route lazy-loads `PublicRoom`, which duplicates grid setup (`react-grid-layout` + `WidgetHost`) outside Shell. Intentional fork; acceptable duplication for read-only rooms.

**Fix:** Optional shared `ReadOnlyGrid.jsx` if a third read-only view appears.  
**Effort:** M

---

## C) Performance and bundle

### C1. `App.css` loaded on every route

**Severity: High**  
**Location:** `src/App.jsx:2`, 2952 lines

All public pages (legal, pricing, landing) import the full widget stylesheet. No code-splitting for CSS beyond Vite's default chunking.

**Fix:** Split per A3; import only `landing.css` / `legal.css` / `pricing.css` on those routes; defer widget CSS to Shell chunk.  
**Effort:** M

---

### C2. MapLibre isolation

**Severity: Low** (adequate)

`maplibre-gl` is only imported in `AtlasWorldGlobe.jsx:2-3`. `widgetRegistry.js:29` lazy-loads `AtlasWidget.jsx`, which statically imports the globe. MapLibre should land in the Atlas widget async chunk, not the main bundle.

`IntroGlobe.jsx` uses canvas + `landData.js` (large coordinate array, ~4 lines minified), not MapLibre. About page stays lighter.

**Fix:** Optional `React.lazy` split inside `AtlasWidget` for `AtlasWorldGlobe` if Atlas chunk is still too heavy for first map open.  
**Effort:** S

---

### C3. `vite.config.js` has no manual chunks

**Severity: Medium**  
**Location:** `vite.config.js:90-93`

No `build.rollupOptions.output.manualChunks`. Large deps (`maplibre-gl`, `react-grid-layout`, `jspdf`, `lucide-react`) rely on automatic splitting.

**Fix:** Add manual chunks, e.g. `maplibre`, `grid-layout`, `pdf` (jspdf only used from BriefPanel dynamic import). Verify with `vite build --analyze` or Rollup visualizer (dev-only, no new prod dep required for audit).  
**Effort:** S

---

### C4. `react-grid-layout` in Shell and PublicRoom

**Severity: Medium**  
**Location:** `src/shell/Grid.jsx:1-2`, `src/shell/PublicRoom.jsx:2-4`

Grid layout CSS and JS load with Shell (authenticated path) and PublicRoom (share path). Unavoidable for grid UX; not needed on Landing/legal/pricing.

**Fix:** Already isolated from marketing routes; no change unless marketing pages import Shell transitively (they do not).  
**Effort:** N/A

---

### C5. Dev middleware article API duplicates production

**Severity: Low**  
**Location:** `vite.config.js:10-87`

`articleApiPlugin` reimplements `/api/fetch-article` with Readability/jsdom for local dev. Production uses `api/fetch-article.js`. Two paths to maintain.

**Fix:** Document in README; or proxy dev to Vercel CLI.  
**Effort:** S

---

### C6. Render / fetch inefficiencies

**Severity: Medium**

- **AlertsDrawer** (`AlertsDrawer.jsx:63`): `Date.now()` during render for snooze check; ESLint flags impure render. Causes unnecessary recalculations.
- **AlertsDrawer** (`134-150`): `loadRules` / `loadEvents` called synchronously in `useEffect` (cascading setState).
- **usePolling** (`usePolling.js:6`): assigns `fetchRef.current = fetchFn` during render (React 19 lint violation).
- **Widgets:** Multiple feeds poll on interval without central backoff when tab hidden (mitigated partially by `usePageVisibility` + `inactiveTabPause`; not universal).

**Fix:** Move snooze check to memo with tick or server-side filter; load alerts on drawer open via event handler; move `fetchRef` update to `useEffect`; audit widgets missing visibility gating.  
**Effort:** M

---

### C7. `landData.js` bundle weight

**Severity: Low**  
**Location:** `src/landing/landData.js`

Single-line huge array for IntroGlobe. Loaded with About/Landing globe paths. Acceptable but opaque to tree-shaking.

**Fix:** Keep as-is or load via dynamic `import()` in `IntroGlobe` if About chunk size matters.  
**Effort:** S

---

### C8. ESLint sample (read-only run)

Notable src issues beyond api `process` env (expected for server files):

- `SettingsModal.jsx:78` `onSignOut` unused prop
- `AlertsDrawer.jsx` purity and set-state-in-effect
- `usePolling.js` ref-during-render
- `gatherRoomItems.js:159` useless escape

**Fix:** Triage src/ issues; add `eslint-env node` or flat config `globals` for `api/` if desired.  
**Effort:** S

---

## Prioritized punch list

| Priority | Severity | Effort | Item |
|----------|----------|--------|------|
| 1 | High | S | Remove dead conflict-detail pipeline (`AtlasWorldGlobe.jsx` 958-997, `api/geo.js` 483-558 branch) |
| 2 | High | M | Lazy-load Shell overlays: BriefPanel, AlertsDrawer, WelcomeTour, SuggestSourcesPanel |
| 3 | High | M | Split `App.css`; drop Leaflet block (372-443); route-level CSS imports |
| 4 | Medium | S | Remove `SEED_WORKSPACES`, `BL10_TEMPLATE` export dead weight, `UpgradeModal.jsx` |
| 5 | Medium | S | Delete unused `WHeader` default export or wire WidgetHost to it; prune `settingsStore` dead exports |
| 6 | Medium | M | Extract `api/jobs.js` into `_jobs_*.js` modules (same action router) |
| 7 | Medium | M | Split `AtlasWorldGlobe.jsx` (popups, theme, geo utils) |
| 8 | Medium | M | Refactor `App.jsx` routing to route table |
| 9 | Medium | S | `manualChunks` in `vite.config.js` for maplibre / grid-layout |
| 10 | Medium | M | Decouple `gatherRoomItems` from widget files |
| 11 | Low | M | Em-dash convention sweep (src UI copy + comments) |
| 12 | Low | S | Centralize `isHttpUrl` / `hostnameOf`; fix `BRIEF_ELIGIBLE_TYPES` comment |
| 13 | Low | M | Split `BriefPanel` format/PDF modules |
| 14 | Low | M | Fix AlertsDrawer / usePolling React 19 lint patterns |

---

*Audit performed read-only at HEAD `e99640a`. No source files modified except this report.*
