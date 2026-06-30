#!/usr/bin/env node
// Vigil ticket B4+A7+B5: clean the server/client module boundary.
// Moves the 3 framework-free modules that api/ imports into a top-level shared/ dir,
// rewrites every importer, repoints gatherRoomItems off the .jsx re-export path (A7),
// and dedups isHttpUrl into api/_jobs_util.js (B5).
// Self-proving: every edit asserts its anchor exists. Runs git mv so renames are tracked.
// Usage: node tools/boundary_refactor.mjs --write   (omit --write for a dry run)

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) }
    else if (/\.(js|jsx)$/.test(e)) out.push(p)
  }
  return out
}

const WRITE = process.argv.includes('--write')
const log = (...a) => console.log(...a)
let failed = false
function must(cond, msg) { if (!cond) { console.error('PROOF FAIL:', msg); failed = true } }

// --- 1. git mv the 3 modules + their 2 co-located tests into shared/ ---
const MOVES = [
  ['src/lib/feedSources.js',          'shared/feedSources.js'],
  ['src/entitlements/resolve.js',     'shared/resolve.js'],
  ['src/entitlements/resolve.test.js','shared/resolve.test.js'],
  ['src/lib/briefFormat.js',          'shared/briefFormat.js'],
  ['src/lib/briefFormat.test.js',     'shared/briefFormat.test.js'],
]
for (const [from] of MOVES) must(existsSync(from), `expected source file missing: ${from}`)
if (failed) process.exit(1)

// --- 2. exact-string import rewrites: [file, old, new] ---
const EDITS = [
  // feedSources importers
  ['api/_brief_gather.js',            "'../src/lib/feedSources.js'",        "'../shared/feedSources.js'"],
  ['src/widgets/AtlasWidget.jsx',     "'../lib/feedSources.js'",            "'../../shared/feedSources.js'"],
  ['src/widgets/RssFeedWidget.jsx',   "'../lib/feedSources.js'",            "'../../shared/feedSources.js'"],
  ['src/widgets/NewsSearchWidget.jsx',"'../lib/feedSources.js'",            "'../../shared/feedSources.js'"],
  // resolve importers (server)
  ['api/_jobs_alerts.js',             "'../src/entitlements/resolve.js'",   "'../shared/resolve.js'"],
  ['api/brief.js',                    "'../src/entitlements/resolve.js'",   "'../shared/resolve.js'"],
  ['api/_jobs_scheduled.js',          "'../src/entitlements/resolve.js'",   "'../shared/resolve.js'"],
  // resolve importers (client)
  ['src/shell/EntitlementDebug.jsx',  "'../entitlements/resolve.js'",       "'../../shared/resolve.js'"],
  ['src/shell/Shell.jsx',             "'../entitlements/resolve.js'",       "'../../shared/resolve.js'"],
  ['src/settings/SettingsModal.jsx',  "'../entitlements/resolve.js'",       "'../../shared/resolve.js'"],
  ['src/data/useShellPersistence.js', "'../entitlements/resolve.js'",       "'../../shared/resolve.js'"],
  ['src/state/shellStore.js',         "'../entitlements/resolve.js'",       "'../../shared/resolve.js'"],
  // briefFormat importers
  ['api/_jobs_email.js',              "'../src/lib/briefFormat.js'",        "'../shared/briefFormat.js'"],
  ['src/shell/BriefPanel.jsx',        "'../lib/briefFormat.js'",            "'../../shared/briefFormat.js'"],
  // vitest glob so the moved tests stay discovered
  ['vitest.config.js',
    "include: ['src/**/*.test.js', 'api/**/*.test.js'],",
    "include: ['src/**/*.test.js', 'api/**/*.test.js', 'shared/**/*.test.js'],"],
]

// src/entitlements/index.js: JSDoc-only refs to ./resolve.js (4x), update for correctness
const JSDOC = ['src/entitlements/index.js', "import('./resolve.js')", "import('../../shared/resolve.js')", true]

// A7: gatherRoomItems collapses the two .jsx constant imports into one shared/feedSources import (PLATFORMS stays)
const A7 = ['src/lib/gatherRoomItems.js',
  "import { GN_SEARCH_URL, KF_DEFAULT_TABS, nsExtractSource, nsCleanTitle } from '../widgets/NewsSearchWidget.jsx'\nimport { SUGGESTIONS } from '../widgets/RssFeedWidget.jsx'\n",
  "import { GN_SEARCH_URL, KF_DEFAULT_TABS, nsExtractSource, nsCleanTitle, SUGGESTIONS } from '../../shared/feedSources.js'\n"]

// B5: _brief_core imports isHttpUrl from _jobs_util and re-exports it; local def removed
const B5_IMP = ['api/_brief_core.js',
  "import { fetchBriefLLM, BriefLLMNotConfiguredError } from './_brief_llm.js'\n",
  "import { fetchBriefLLM, BriefLLMNotConfiguredError } from './_brief_llm.js'\nimport { isHttpUrl } from './_jobs_util.js'\n\nexport { isHttpUrl }\n"]
const B5_DEF = ['api/_brief_core.js',
  "export function isHttpUrl(u) {\n  if (typeof u !== 'string') return false\n  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' } catch { return false }\n}\n\n",
  ""]

// verify every anchor BEFORE writing anything
function check(file, old, optional = false) {
  if (!existsSync(file)) { must(false, `file missing: ${file}`); return }
  const s = readFileSync(file, 'utf8')
  if (!s.includes(old)) must(optional, `anchor not found in ${file}: ${JSON.stringify(old.slice(0, 60))}`)
}
for (const [f, o] of EDITS) check(f, o)
check(JSDOC[0], JSDOC[1])
check(A7[0], A7[1])
check(B5_IMP[0], B5_IMP[1])
check(B5_DEF[0], B5_DEF[1])
if (failed) { console.error('Aborting: anchors missing, no files changed.'); process.exit(1) }

if (!WRITE) { log('Dry run OK. All anchors found. Re-run with --write to apply.'); process.exit(0) }

// apply moves
mkdirSync('shared', { recursive: true })
for (const [from, to] of MOVES) execSync(`git mv "${from}" "${to}"`, { stdio: 'inherit' })

// apply single-occurrence edits
function edit(file, old, neu, all = false) {
  const s = readFileSync(file, 'utf8')
  const out = all ? s.split(old).join(neu) : s.replace(old, neu)
  writeFileSync(file, out)
}
for (const [f, o, n] of EDITS) edit(f, o, n)
edit(JSDOC[0], JSDOC[1], JSDOC[2], true)
edit(A7[0], A7[1], A7[2])
edit(B5_IMP[0], B5_IMP[1], B5_IMP[2])
edit(B5_DEF[0], B5_DEF[1], B5_DEF[2])

// post proofs (cross-platform, no shell deps)
const STALE = ["src/lib/feedSources", "'../lib/feedSources", 'src/entitlements/resolve', "'../entitlements/resolve", 'src/lib/briefFormat', "'../lib/briefFormat"]
const staleHits = []
for (const f of [...walk('api'), ...walk('src')]) {
  const s = readFileSync(f, 'utf8')
  for (const pat of STALE) if (s.includes(pat)) staleHits.push(`${f}: ${pat}`)
}
must(staleHits.length === 0, `stale import paths remain:\n${staleHits.join('\n')}`)
must(!readFileSync('src/lib/gatherRoomItems.js', 'utf8').includes('NewsSearchWidget.jsx'), 'gatherRoomItems still imports NewsSearchWidget.jsx')
must((readFileSync('api/_brief_core.js', 'utf8').match(/function isHttpUrl/g) || []).length === 0, '_brief_core still defines isHttpUrl')

if (failed) { console.error('PROOFS FAILED after write. Inspect git diff before committing.'); process.exit(1) }
log('OK: boundary refactor applied and proofs passed. Now run: npm run build && npx vitest run')
