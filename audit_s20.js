import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = __dirname

function sep(title) {
  console.log('\n' + '═'.repeat(70))
  console.log(`  ${title}`)
  console.log('═'.repeat(70))
}

function readFileSafe(fp) {
  try { return fs.readFileSync(fp, 'utf8') } catch { return null }
}

function walkDir(dir, exts = null) {
  const results = []
  if (!fs.existsSync(dir)) return results
  function recurse(cur) {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) recurse(full)
      else if (!exts || exts.some(e => entry.name.endsWith(e))) results.push(full)
    }
  }
  recurse(dir)
  return results
}

// ─── 1. vercel.json ───────────────────────────────────────────────────────────
sep('1. vercel.json')
const vercelPath = path.join(ROOT, 'vercel.json')
const vercelRaw = readFileSafe(vercelPath)
if (vercelRaw) {
  console.log(vercelRaw)
  const v = JSON.parse(vercelRaw)
  console.log('  build command   :', v.buildCommand ?? '(not set — Vercel auto-detects)')
  console.log('  outputDirectory :', v.outputDirectory ?? '(not set — defaults to dist/)')
  console.log('  rewrites        :', JSON.stringify(v.rewrites ?? []))
  console.log('  headers         :', JSON.stringify(v.headers ?? []))
} else {
  console.log('  ⚠ vercel.json not found')
}

// ─── 2. supabase/ folder ─────────────────────────────────────────────────────
sep('2. supabase/ folder')
const supaDir = path.join(ROOT, 'supabase')
if (!fs.existsSync(supaDir)) {
  console.log('  ⚠ supabase/ folder does not exist')
} else {
  const files = walkDir(supaDir)
  if (files.length === 0) {
    console.log('  (empty)')
  } else {
    files.forEach(f => console.log(' ', path.relative(ROOT, f)))
  }
}

// ─── 3. /api/ folder ─────────────────────────────────────────────────────────
sep('3. api/ folder')
const apiDir = path.join(ROOT, 'api')
if (!fs.existsSync(apiDir)) {
  console.log('  ⚠ api/ folder does not exist')
} else {
  const apiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith('.js')).sort()
  for (const name of apiFiles) {
    const fp = path.join(apiDir, name)
    const content = readFileSafe(fp) ?? ''
    const lines = content.split('\n')

    // grep process.env vars
    const envVars = []
    const envRe = /process\.env\.([A-Z0-9_]+)/g
    let m
    while ((m = envRe.exec(content)) !== null) {
      if (!envVars.includes(m[1])) envVars.push(m[1])
    }

    console.log(`\n  ┌─ ${name}`)
    console.log(`  │  process.env refs: ${envVars.length ? envVars.join(', ') : '(none)'}`)
    console.log('  │  First 30 lines:')
    lines.slice(0, 30).forEach((l, i) => console.log(`  │  ${String(i + 1).padStart(3)}: ${l}`))
    console.log('  └' + '─'.repeat(60))
  }
}

// ─── 4. Grep for http:// and localhost ───────────────────────────────────────
sep('4. Hardcoded http:// URLs and localhost references')

const grepDirs = [path.join(ROOT, 'src'), path.join(ROOT, 'api')]
const httpRe = /http:\/\/[^'"`\s<>]+/g
const locRe  = /localhost/g

let httpHits = []
let locHits  = []

for (const dir of grepDirs) {
  const files = walkDir(dir, ['.js', '.jsx', '.ts', '.tsx'])
  for (const fp of files) {
    const content = readFileSafe(fp)
    if (!content) continue
    const rel = path.relative(ROOT, fp)
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      const lineNo = idx + 1
      let hm
      // reset lastIndex
      httpRe.lastIndex = 0
      while ((hm = httpRe.exec(line)) !== null) {
        httpHits.push({ file: rel, line: lineNo, match: hm[0], context: line.trim() })
      }
      locRe.lastIndex = 0
      if (locRe.test(line)) {
        locHits.push({ file: rel, line: lineNo, context: line.trim() })
      }
    })
  }
}

console.log('\n  ── http:// matches ──')
if (httpHits.length === 0) {
  console.log('  (none)')
} else {
  httpHits.forEach(h => console.log(`  ${h.file}:${h.line} → ${h.match}\n    ctx: ${h.context.slice(0, 120)}`))
}

console.log('\n  ── localhost matches ──')
if (locHits.length === 0) {
  console.log('  (none)')
} else {
  locHits.forEach(h => console.log(`  ${h.file}:${h.line}\n    ctx: ${h.context.slice(0, 120)}`))
}

// ─── 5. .env.local — names only ──────────────────────────────────────────────
sep('5. .env.local — variable names only')
const envPath = path.join(ROOT, '.env.local')
const envRaw = readFileSafe(envPath)
if (!envRaw) {
  console.log('  ⚠ .env.local not found')
} else {
  envRaw.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (trimmed.startsWith('#')) {
      // try to extract a var name from commented lines like: # VAR=...
      const inner = trimmed.replace(/^#+\s*/, '')
      const eqIdx = inner.indexOf('=')
      if (eqIdx > 0) {
        const varName = inner.slice(0, eqIdx).trim()
        console.log(`  [COMMENTED] ${varName}`)
      } else {
        console.log(`  [COMMENTED] ${inner}`)
      }
    } else {
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        console.log(`  ${trimmed.slice(0, eqIdx).trim()}`)
      }
    }
  })
}

// ─── 6. Widget fetch calls ────────────────────────────────────────────────────
sep('6. Widget files — fetch / axios / XHR calls')
const widgetsDir = path.join(ROOT, 'src', 'components', 'widgets')
if (!fs.existsSync(widgetsDir)) {
  console.log('  ⚠ widgets directory not found')
} else {
  const widgetFiles = walkDir(widgetsDir, ['.js', '.jsx', '.ts', '.tsx']).sort()
  // Match fetch( or axios( or new XMLHttpRequest
  const callRe = /\b(fetch|axios|XMLHttpRequest)\s*[.(]/g
  // Try to capture URL on same line — string literal after (
  const urlRe  = /(?:fetch|axios\.\w+|axios)\s*\(\s*[`'"]([^`'"]+)[`'"]/

  for (const fp of widgetFiles) {
    const content = readFileSafe(fp)
    if (!content) continue
    const rel = path.relative(ROOT, fp)
    const lines = content.split('\n')
    const hits = []
    lines.forEach((line, idx) => {
      callRe.lastIndex = 0
      if (callRe.test(line)) {
        const urlMatch = urlRe.exec(line)
        const url = urlMatch ? urlMatch[1] : '(URL not on this line)'
        hits.push(`    ${String(idx + 1).padStart(4)}: ${line.trim().slice(0, 120)}`)
        hits.push(`          → URL: ${url}`)
      }
    })
    if (hits.length) {
      console.log(`\n  ${rel}`)
      hits.forEach(h => console.log(h))
    }
  }
}

sep('AUDIT COMPLETE')
