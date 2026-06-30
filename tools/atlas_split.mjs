// tools/atlas_split.mjs
// T10: split src/widgets/AtlasWorldGlobe.jsx into 6 leaf modules under src/widgets/atlas/.
// Deterministic + self-proving: computes the split in memory, runs three proofs against the
// in-memory original (name-completeness, byte-identity of every moved member, scope-aware
// unbound-identifier audit), and writes files ONLY if all proofs pass. On any failure it
// writes nothing and exits 1, leaving the working tree untouched.
//
// Run from the repo root:  node tools/atlas_split.mjs
// Requires @babel/parser + @babel/traverse (already present via the vite toolchain).

import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
const traverse = _traverse.default || _traverse

const SRC = 'src/widgets/AtlasWorldGlobe.jsx'
const OUTDIR = 'src/widgets/atlas'

const source = fs.readFileSync(SRC, 'utf8')
if (source.includes("./atlas/atlasStyle")) {
  console.log('Already split (main imports ./atlas/atlasStyle). Nothing to do.')
  process.exit(0)
}
const lines = source.split('\n')
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })

const members = new Map()
let rtlCallStmt = null
function declNames(node) {
  if (node.type === 'FunctionDeclaration') return [node.id.name]
  if (node.type === 'VariableDeclaration') return node.declarations.map((d) => d.id.name)
  return []
}
for (const node of ast.program.body) {
  let target = node, exported = false
  if (node.type === 'ExportNamedDeclaration' && node.declaration) { target = node.declaration; exported = true }
  const names = declNames(target)
  const startLine = node.loc.start.line, endLine = node.loc.end.line
  if (names.length) for (const n of names) members.set(n, { startLine, endLine, exported, node, inner: target })
  else if (node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' &&
    node.expression.callee.type === 'Identifier' && node.expression.callee.name === 'ensureRtlTextPlugin') {
    rtlCallStmt = { startLine, endLine }
  }
}
function attachedStart(startLine) {
  let s = startLine
  for (let i = startLine - 1; i >= 1; i--) {
    const t = lines[i - 1].trim()
    if (t === '') break
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.endsWith('*/')) { s = i; continue }
    break
  }
  return s
}
function sliceMember(name) {
  const m = members.get(name)
  const start = attachedStart(m.startLine)
  return { text: lines.slice(start - 1, m.endLine).join('\n'), start, end: m.endLine }
}

const MODULES = {
  atlasStyle: ['RTL_TEXT_PLUGIN_URL','rtlTextPluginRequested','ensureRtlTextPlugin','OPENFREEMAP_STYLE','DEMOTILES_STYLE','STYLE_WATCHDOG_MS','IDLE_MS','ROTATE_LNG_PER_FRAME','ROTATE_MAX_ZOOM','DEFAULT_GLOBE_ZOOM','DEFAULT_GLOBE_LAT','DEFAULT_VIEW','GLOBE_SPACE_BG','GLOBE_SKY','readGlobeTheme','applyGlobeTheme','buildStyleChain'],
  atlasLabels: ['PLACE_LABEL_LAYER_RE','COUNTRY_MIN_ZOOM','COUNTRY_LABEL_RE','NON_PLACE_LABEL_LAYER_RE','isPlaceLabelLayer','isCountryLabelLayer','calmBasemapLabels'],
  atlasGeo: ['countryNameFromProps','pointInRing','pointInGeometry','bboxOfGeometry','countryFeatureAtLngLat','featurePoint','containedMarkers','countryNameAtLngLat'],
  atlasLayers: ['EMPTY_GEOJSON','COUNTRIES_GEO_URL','USGS_QUAKES_URL','GDACS_STORMS_URL','AIRCRAFT_GEO_URL','WILDFIRES_GEO_URL','CONFLICT_GEO_URL','QUAKES_REFRESH_MS','STORMS_REFRESH_MS','AIRCRAFT_REFRESH_MS','WILDFIRES_REFRESH_MS','CONFLICT_REFRESH_MS','LAYER_COLORS','LAYER_SWATCH_CSS','LAYER_ORDER','resolveLayerMarkerColors','applyLayerMarkerColors','createDefaultProvenance','featureCollectionFromGeoResponse','CIRCLE_STROKE_COLOR','CIRCLE_STROKE_WIDTH','AIRCRAFT_ICON_ID','PLANE_OUTLINE','tracePlanePath','createAircraftPlaneImageData','registerAircraftIcon'],
  atlasAircraft: ['ICAO_COUNTRY_RANGES','PLANESPOTTERS_PHOTO_API','countryFromHex','parsePlanespottersPhoto','fetchPlanespottersPhoto'],
  atlasPopups: ['formatRelativeTime','formatTime','formatIsoDate','escapeHtml','escapeAttr','safeHttpUrl','POPUP_BODY_STYLE','DATA_MARKER_LAYERS','dispatchNewsSearch','earthquakeNewsSearchQuery','stormNewsSearchQuery','buildNewsSearchButtonHtml','attachPopupNewsSearchButton','wirePopupDismiss','buildSourceLinkHtml','popupRowsHtml','buildPhotoBlock','buildPopupCard','buildEarthquakePopupHtml','buildStormPopupHtml','confidenceLabel','fmtAcqTime','buildWildfirePopupHtml','buildConflictPopupHtml','buildAircraftPopupHtml','filterTcStorms'],
}
const PUBLIC_REEXPORT = { atlasLayers: ['LAYER_COLORS','LAYER_SWATCH_CSS','LAYER_ORDER'], atlasPopups: ['formatRelativeTime'] }

const allAssigned = Object.values(MODULES).flat()
const assignedSet = new Set(allAssigned)
if (allAssigned.length !== assignedSet.size) throw new Error('a name assigned to two modules')
for (const n of allAssigned) if (!members.has(n)) throw new Error('assigned unknown name: ' + n)
for (const n of members.keys()) if (!assignedSet.has(n) && n !== 'AtlasWorldGlobe') throw new Error('unassigned top-level member: ' + n)

// build module texts in memory
const moduleText = {}
for (const [mod, names] of Object.entries(MODULES)) {
  const slices = names.map((n) => ({ n, ...sliceMember(n) })).sort((a, b) => a.start - b.start)
  let ordered = slices.map((s) => s.text)
  if (mod === 'atlasStyle' && rtlCallStmt) {
    const callText = lines.slice(rtlCallStmt.startLine - 1, rtlCallStmt.endLine).join('\n')
    const idx = slices.findIndex((s) => s.n === 'ensureRtlTextPlugin')
    ordered.splice(idx + 1, 0, callText)
  }
  const body = ordered.join('\n\n')
  const needsMaplibre = /\bmaplibregl\b/.test(body)
  const header = needsMaplibre ? "import maplibregl from 'maplibre-gl'\n\n" : ''
  const toExport = names.filter((n) => !members.get(n).exported)
  const exportBlock = toExport.length ? '\n\nexport {\n  ' + toExport.join(',\n  ') + ',\n}\n' : '\n'
  moduleText[mod] = header + body + exportBlock
}

// build slim main text in memory
const removed = new Set()
for (const names of Object.values(MODULES)) for (const n of names) {
  const m = members.get(n); for (let i = attachedStart(m.startLine); i <= m.endLine; i++) removed.add(i)
}
if (rtlCallStmt) for (let i = rtlCallStmt.startLine; i <= rtlCallStmt.endLine; i++) removed.add(i)
const keptLines = []
for (let i = 1; i <= lines.length; i++) if (!removed.has(i)) keptLines.push({ i, text: lines[i - 1] })
const mainRemaining = keptLines.map((l) => l.text).join('\n')
function usedInMain(name) { return new RegExp('(?<![\\w$.])' + name.replace(/[$]/g, '\\$') + '(?![\\w$])').test(mainRemaining) }
let lastImportLine = 0
for (const node of ast.program.body) if (node.type === 'ImportDeclaration') lastImportLine = Math.max(lastImportLine, node.loc.end.line)
const importBlocks = [], reexportBlocks = []
for (const [mod, names] of Object.entries(MODULES)) {
  const used = names.filter(usedInMain)
  if (used.length) importBlocks.push(`import { ${used.join(', ')} } from './atlas/${mod}'`)
  if (PUBLIC_REEXPORT[mod]) reexportBlocks.push(`export { ${PUBLIC_REEXPORT[mod].join(', ')} } from './atlas/${mod}'`)
}
const head = [], tail = []
for (const l of keptLines) (l.i <= lastImportLine ? head : tail).push(l.text)
while (tail.length && tail[0].trim() === '') tail.shift()
const inject = '\n' + importBlocks.join('\n') + '\n\n' + reexportBlocks.join('\n') + '\n'
let mainText = (head.join('\n') + inject + '\n' + tail.join('\n')).replace(/\n{4,}/g, '\n\n\n')
if (!mainText.endsWith('\n')) mainText += '\n'

const TEST_TEXT = `import { describe, it, expect } from 'vitest'
import { pointInRing, pointInGeometry, bboxOfGeometry, countryNameAtLngLat } from './atlasGeo'
import { countryFromHex } from './atlasAircraft'
import { formatRelativeTime, confidenceLabel, fmtAcqTime, escapeHtml, safeHttpUrl } from './atlasPopups'

// T10 split smoke test. These helpers were extracted verbatim out of AtlasWorldGlobe.jsx
// into ./atlas/*.js leaf modules. This asserts the extracted, node-safe pure helpers
// still behave, so a regression in the move surfaces in CI rather than only on the globe.

const UNIT_SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
const SQUARE_POLY = { type: 'Polygon', coordinates: [UNIT_SQUARE] }

describe('atlasGeo', () => {
  it('pointInRing detects inside vs outside', () => {
    expect(pointInRing(5, 5, UNIT_SQUARE)).toBe(true)
    expect(pointInRing(20, 5, UNIT_SQUARE)).toBe(false)
  })
  it('pointInGeometry respects polygon bounds', () => {
    expect(pointInGeometry(5, 5, SQUARE_POLY)).toBe(true)
    expect(pointInGeometry(-1, -1, SQUARE_POLY)).toBe(false)
  })
  it('bboxOfGeometry returns [minX,minY,maxX,maxY]', () => {
    expect(bboxOfGeometry(SQUARE_POLY)).toEqual([0, 0, 10, 10])
  })
  it('countryNameAtLngLat reads NAME from a matching feature', () => {
    const geo = { features: [{ geometry: SQUARE_POLY, properties: { NAME: 'Testland' } }] }
    expect(countryNameAtLngLat(5, 5, geo)).toBe('Testland')
    expect(countryNameAtLngLat(50, 50, geo)).toBe(null)
  })
})

describe('atlasAircraft.countryFromHex', () => {
  it('maps an ICAO transponder hex to its country', () => {
    expect(countryFromHex('7c0abc')).toBe('Australia')
    expect(countryFromHex('3c6444')).toBe('Germany')
  })
  it('rejects malformed or unmatched hex', () => {
    expect(countryFromHex('zzzzzz')).toBe(null)
    expect(countryFromHex('')).toBe(null)
    expect(countryFromHex(null)).toBe(null)
  })
})

describe('atlasPopups formatters', () => {
  it('formatRelativeTime buckets and guards null', () => {
    expect(formatRelativeTime(null)).toBe(null)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hr ago')
  })
  it('confidenceLabel maps FIRMS codes', () => {
    expect(confidenceLabel('l')).toBe('Low')
    expect(confidenceLabel('n')).toBe('Nominal')
    expect(confidenceLabel('h')).toBe('High')
  })
  it('fmtAcqTime formats HHMM', () => {
    expect(fmtAcqTime('0930')).toBe('09:30')
  })
  it('escapeHtml escapes markup', () => {
    expect(escapeHtml('<a>&')).toBe('&lt;a&gt;&amp;')
  })
  it('safeHttpUrl allows http(s) only', () => {
    expect(safeHttpUrl('https://example.com/')).toBe('https://example.com/')
    expect(safeHttpUrl('javascript:alert(1)')).toBe(null)
  })
})
`

// ============ PROOFS (in memory, against the original `source`) ============
function topLevelDecls(code) {
  const a = parse(code, { sourceType: 'module', plugins: ['jsx'] })
  const out = new Map()
  for (const node of a.program.body) {
    let t = node
    if (node.type === 'ExportNamedDeclaration' && node.declaration) t = node.declaration
    if (node.type === 'ExportDefaultDeclaration') continue
    if (t.type === 'FunctionDeclaration') out.set(t.id.name, { start: t.start, end: t.end })
    else if (t.type === 'VariableDeclaration') for (const d of t.declarations) out.set(d.id.name, { start: t.start, end: t.end })
  }
  return out
}
const origDecls = topLevelDecls(source)
const moduleDeclMap = new Map()
for (const [mod, text] of Object.entries(moduleText)) for (const [n, span] of topLevelDecls(text)) moduleDeclMap.set(n, { mod, span })
const mainDecls = topLevelDecls(mainText)

// proof 1: name-completeness
const origNames = new Set(origDecls.keys())
const newNames = new Set([...moduleDeclMap.keys(), ...mainDecls.keys()])
const missing = [...origNames].filter((n) => !newNames.has(n))
const extra = [...newNames].filter((n) => !origNames.has(n))
const p1 = missing.length === 0 && extra.length === 0

// proof 2: byte-identity of moved members + component
const mismatches = []
for (const [name, { mod, span }] of moduleDeclMap) {
  const o = origDecls.get(name)
  if (!o) { mismatches.push(name + '(no-orig)'); continue }
  if (source.slice(o.start, o.end) !== moduleText[mod].slice(span.start, span.end)) mismatches.push(name)
}
const co = origDecls.get('AtlasWorldGlobe'), cn = mainDecls.get('AtlasWorldGlobe')
const compIdentical = !!(co && cn && source.slice(co.start, co.end) === mainText.slice(cn.start, cn.end))
const p2 = mismatches.length === 0 && compIdentical

// proof 3: scope-aware unbound audit
const GLOBALS = new Set(['document','window','globalThis','getComputedStyle','fetch','CustomEvent','URL','URLSearchParams','Date','Math','Number','JSON','Infinity','NaN','isNaN','isFinite','parseInt','parseFloat','String','Boolean','Array','Object','Set','Map','WeakMap','WeakSet','Promise','Symbol','RegExp','Error','console','navigator','location','history','localStorage','sessionStorage','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','performance','structuredClone','undefined','Intl','TextEncoder','TextDecoder','AbortController','Image','FormData','MutationObserver','ResizeObserver','IntersectionObserver','Element','HTMLElement','Node','maplibregl'])
function auditFile(code) {
  const a = parse(code, { sourceType: 'module', plugins: ['jsx'] })
  const unbound = new Set()
  traverse(a, { ReferencedIdentifier(p) {
    const name = p.node.name
    if (p.scope.getBinding(name)) return
    if (GLOBALS.has(name)) return
    unbound.add(name)
  } })
  return [...unbound]
}
const unboundReport = {}
let p3 = true
for (const [mod, text] of Object.entries(moduleText)) { const u = auditFile(text); if (u.length) { p3 = false; unboundReport[mod] = u } }
const um = auditFile(mainText); if (um.length) { p3 = false; unboundReport['AtlasWorldGlobe.jsx'] = um }

console.log('PROOF 1 name-completeness:', p1 ? 'PASS' : 'FAIL', `(orig ${origNames.size}, new ${newNames.size}` + (missing.length ? `, MISSING ${missing.join(',')}` : '') + (extra.length ? `, EXTRA ${extra.join(',')}` : '') + ')')
console.log('PROOF 2 byte-identity   :', p2 ? 'PASS' : 'FAIL', `(${moduleDeclMap.size} members, component identical ${compIdentical}` + (mismatches.length ? `, MISMATCH ${mismatches.join(',')}` : '') + ')')
console.log('PROOF 3 unbound audit   :', p3 ? 'PASS' : 'FAIL', p3 ? '' : JSON.stringify(unboundReport))

if (!(p1 && p2 && p3)) {
  console.error('\nProofs FAILED. No files written. Working tree untouched.')
  process.exit(1)
}

// all proofs pass -> write files
fs.mkdirSync(OUTDIR, { recursive: true })
for (const [mod, text] of Object.entries(moduleText)) fs.writeFileSync(path.join(OUTDIR, mod + '.js'), text)
fs.writeFileSync(path.join(OUTDIR, 'atlasSplit.test.js'), TEST_TEXT)
fs.writeFileSync(SRC, mainText)

console.log('\nAll proofs PASS. Wrote:')
for (const mod of Object.keys(moduleText)) console.log('  ' + path.join(OUTDIR, mod + '.js'))
console.log('  ' + path.join(OUTDIR, 'atlasSplit.test.js'))
console.log('  ' + SRC + ' (slim, ' + mainText.split('\n').length + ' lines, was ' + lines.length + ')')
