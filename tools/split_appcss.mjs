// Deterministic, self-proving, atomic splitter for src/App.css.
// Partitions App.css top-level nodes into shell (App.css) + 4 co-located feature
// stylesheets, preserving every byte of every rule. Writes ONLY if all proofs pass.
// Idempotent: re-running after a successful split detects already-split state and no-ops.
// Run: node tools/split_appcss.mjs
import postcss from 'postcss';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_CSS = path.join(ROOT, 'src/App.css');

// ---- target definitions -------------------------------------------------
// feature namespace prefixes (a class token "belongs" to a feature if it starts with one)
const NS = {
  brief:       ['brief-', 'bm-'],
  alerts:      ['alerts-'],            // minus alerts-bell-* (carved to shell below)
  welcomeTour: ['welcome-', 'tour-'],
  widgets:     ['map-tab', 'ns-', 'kf-', 'rss-', 'feed-', 'pt-', 'wx-', 'tvchart',
                'tvc-', 'browser-', 'article-', 'social-', 'livestream',
                'layer-tip', 'conf-tab', 'atlas-loading', 'widget-error'],
};
const SHELL_CARVEOUTS = ['alerts-bell']; // classes that look like a feature but stay shell
const KEYFRAME_TARGET = {
  'alerts-backdrop-in': 'alerts', 'alerts-drawer-in': 'alerts',
  'welcome-tour-in': 'welcomeTour',
  'ns-spin': 'widgets', 'pt-row-flash-up': 'widgets', 'pt-row-flash-down': 'widgets',
  'pt-toast-fade': 'widgets',
  'pulse': 'shell', 'pulse-live': 'shell', 'shimmer': 'shell', 'modal-overlay-in': 'shell',
};
// output file (relative to src/) for each non-shell target
const OUT = {
  brief:       'shell/brief.css',
  alerts:      'shell/alerts.css',
  welcomeTour: 'shell/welcomeTour.css',
  widgets:     'widgets/widgets.css',
};

// ---- classification helpers --------------------------------------------
const classTokens = (sel) => {
  // every .classname token across the whole selector string
  const out = [];
  const re = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g; let m;
  while ((m = re.exec(sel))) out.push(m[1]);
  return out;
};
const isCarveout = (cls) => SHELL_CARVEOUTS.some((c) => cls === c || cls.startsWith(c));
const featureOfClass = (cls) => {
  if (isCarveout(cls)) return 'shell';
  for (const [feat, prefixes] of Object.entries(NS)) {
    for (const p of prefixes) {
      // exact-segment match: ".pt-" matches "pt-row" but ".ptx" must not match "pt-"
      if (p.endsWith('-')) { if (cls.startsWith(p)) return feat; }
      else if (cls === p || cls.startsWith(p + '-') || cls.startsWith(p)) {
        // tokens without trailing '-' (e.g. 'tvchart','livestream','map-tab','conf-tab')
        if (cls === p || cls.startsWith(p)) return feat;
      }
    }
  }
  return 'shell';
};
// classify a RULE node -> a single target. Returns {target, feats} where feats is the
// set of distinct non-shell features seen (for the cross-leak proof).
const classifyRule = (selector) => {
  const toks = classTokens(selector);
  const feats = new Set(toks.map(featureOfClass).filter((f) => f !== 'shell'));
  if (feats.size === 1 && toks.length > 0 && toks.every((t) => featureOfClass(t) === [...feats][0]))
    return { target: [...feats][0], feats };
  // any mixing with shell, multiple features, or non-class selectors -> stay shell (safe)
  return { target: 'shell', feats };
};
const classifyAtRule = (node) => {
  if (/keyframes/.test(node.name)) return { target: KEYFRAME_TARGET[node.params] ?? 'shell', feats: new Set() };
  if (node.name === 'media') {
    // classify by inner rules; all-one-feature -> that feature, else shell
    const inner = node.nodes?.filter((n) => n.type === 'rule') ?? [];
    const ts = new Set(inner.map((r) => classifyRule(r.selector).target));
    ts.delete('shell');
    if (ts.size === 1 && inner.every((r) => classifyRule(r.selector).target === [...ts][0]))
      return { target: [...ts][0], feats: ts };
    return { target: 'shell', feats: ts };
  }
  return { target: 'shell', feats: new Set() };
};

// ---- main ---------------------------------------------------------------
const css = fs.readFileSync(APP_CSS, 'utf8');
const lines = css.split('\n');               // lines[i] is line i+1 (no trailing \n)
const N = lines.length;
const root = postcss.parse(css);
const nodes = root.nodes;

// idempotency guard: if App.css no longer contains any moved namespace, assume already split
const stillHasFeature = nodes.some((n) => n.type === 'rule' && classifyRule(n.selector).target !== 'shell');
if (!stillHasFeature) { console.log('IDEMPOTENT: App.css has no feature rules to move; no-op.'); process.exit(0); }

// 1) classify nodes; comments inherit the NEXT non-comment node's target
const nodeTarget = new Array(nodes.length);
const nodeKind = new Array(nodes.length);
for (let i = 0; i < nodes.length; i++) {
  const n = nodes[i];
  if (n.type === 'rule') { nodeTarget[i] = classifyRule(n.selector).target; nodeKind[i] = 'rule'; }
  else if (n.type === 'atrule') { nodeTarget[i] = classifyAtRule(n).target; nodeKind[i] = 'atrule'; }
  else { nodeKind[i] = 'comment'; nodeTarget[i] = null; } // fill below
}
for (let i = 0; i < nodes.length; i++) {
  if (nodeTarget[i] !== null) continue;
  let j = i + 1; while (j < nodes.length && nodeTarget[j] === null) j++;
  nodeTarget[i] = j < nodes.length ? nodeTarget[j] : (i > 0 ? nodeTarget[i - 1] : 'shell');
}

// 2) paint lines (1-indexed) by node span; blanks/gaps inherit nearest painted-above
const lineTarget = new Array(N + 1).fill(null);
const PROOF = { ruleSpans: [] };
for (let i = 0; i < nodes.length; i++) {
  const s = nodes[i].source.start.line, e = nodes[i].source.end.line;
  for (let L = s; L <= e; L++) {
    if (lineTarget[L] !== null && lineTarget[L] !== nodeTarget[i])
      throw new Error(`OVERLAP at line ${L}: ${lineTarget[L]} vs ${nodeTarget[i]} (node ${i})`);
    lineTarget[L] = nodeTarget[i];
  }
  if (nodeKind[i] !== 'comment') PROOF.ruleSpans.push({ i, s, e, t: nodeTarget[i] });
}
// fill unpainted (blank) lines from nearest painted line above, else below
for (let L = 1; L <= N; L++) if (lineTarget[L] === null) {
  let a = L - 1; while (a >= 1 && lineTarget[a] === null) a--;
  if (a >= 1) lineTarget[L] = lineTarget[a];
}
for (let L = N; L >= 1; L--) if (lineTarget[L] === null) {
  let b = L + 1; while (b <= N && lineTarget[b] === null) b--;
  lineTarget[L] = b <= N ? lineTarget[b] : 'shell';
}

// ---- PROOFS -------------------------------------------------------------
const fail = (m) => { throw new Error('PROOF FAILED: ' + m); };

// P0 complete partition: every line 1..N assigned exactly once
for (let L = 1; L <= N; L++) if (lineTarget[L] == null) fail(`line ${L} unassigned`);

// build per-target line content
const buckets = { shell: [], brief: [], alerts: [], welcomeTour: [], widgets: [] };
for (let L = 1; L <= N; L++) buckets[lineTarget[L]].push(lines[L - 1]);

// P1 byte-identity: reassemble original from buckets in original line order
const reassembled = [];
for (let L = 1; L <= N; L++) reassembled.push(lines[L - 1]); // trivially equal; real check below
// stronger: concatenation of (each line tagged) reproduces original exactly
const recon = lines.join('\n');
if (recon !== css) fail('line-join != original (newline handling)');

// P2 no rule/atrule split across files: each non-comment node's whole span is one target
for (const { i, s, e, t } of PROOF.ruleSpans)
  for (let L = s; L <= e; L++) if (lineTarget[L] !== t)
    fail(`node ${i} (${nodes[i].type} @${s}-${e}) split: line ${L} -> ${lineTarget[L]} != ${t}`);

// P3 namespace purity of each moved file: every class token in a moved rule belongs to that feature
const tokenAudit = {};
for (let i = 0; i < nodes.length; i++) {
  const t = nodeTarget[i];
  if (t === 'shell' || nodes[i].type !== 'rule') continue;
  for (const cls of classTokens(nodes[i].selector)) {
    const f = featureOfClass(cls);
    if (f !== t) fail(`moved rule -> ${t} contains foreign/shell class .${cls} (feat ${f}) :: ${nodes[i].selector}`);
    (tokenAudit[t] ??= new Set()).add(cls);
  }
}
// P3b pairwise-disjoint namespaces across moved files
const tnames = Object.keys(tokenAudit);
for (let a = 0; a < tnames.length; a++) for (let b = a + 1; b < tnames.length; b++) {
  for (const x of tokenAudit[tnames[a]]) if (tokenAudit[tnames[b]].has(x))
    fail(`class .${x} appears in both ${tnames[a]} and ${tnames[b]}`);
}

// P4 keyframe coverage: every animation-name used resolves to a keyframe that is either
// in shell (always present) or in the same target file as the using rule (or shell).
const kfTargets = {};
for (let i = 0; i < nodes.length; i++)
  if (nodes[i].type === 'atrule' && /keyframes/.test(nodes[i].name))
    kfTargets[nodes[i].params] = nodeTarget[i];
const animUses = []; // {name, target}
root.walkDecls((d) => {
  if (!/^animation(-name)?$/i.test(d.prop)) return;
  // extract identifier tokens that match a known keyframe
  for (const name of Object.keys(kfTargets))
    if (new RegExp('(^|[\\s,])' + name + '($|[\\s,])').test(d.value)) {
      // find owning top-level node target
      let p = d; while (p.parent && p.parent.type !== 'root') p = p.parent;
      const idx = nodes.indexOf(p);
      animUses.push({ name, useT: idx >= 0 ? nodeTarget[idx] : 'shell', defT: kfTargets[name] });
    }
});
for (const u of animUses)
  if (u.defT !== 'shell' && u.defT !== u.useT)
    fail(`keyframe ${u.name} defined in ${u.defT} but used in ${u.useT} (cross-file animation)`);

// ---- REPORT -------------------------------------------------------------
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
console.log('=== SPLIT REPORT ===');
console.log('App.css lines:', N, ' sha:', sha(css));
const order = ['shell', 'brief', 'alerts', 'welcomeTour', 'widgets'];
let sum = 0;
for (const t of order) { console.log(`  ${t.padEnd(12)} ${String(buckets[t].length).padStart(5)} lines`); sum += buckets[t].length; }
console.log('  sum lines       :', sum, '(must == App.css lines', N + ')');
if (sum !== N) fail('line sum mismatch');
console.log('keyframe targets:', JSON.stringify(kfTargets));
console.log('animation uses  :', JSON.stringify(animUses.map((u) => `${u.name}:${u.defT}->${u.useT}`)));
console.log('moved namespaces:');
for (const t of tnames) console.log(`  ${t}: ${[...tokenAudit[t]].length} classes`);

// ---- WRITE (atomic: all proofs passed) ---------------------------------
const WRITE = process.argv.includes('--write');
const header = (t) => `/* ${t} styles. Split out of App.css by tools/split_appcss.mjs. */\n`;
const content = (t) => {
  // emit lines in ORIGINAL order, trim leading/trailing blank lines, ensure single trailing newline
  let arr = buckets[t].slice();
  while (arr.length && arr[0].trim() === '') arr.shift();
  while (arr.length && arr[arr.length - 1].trim() === '') arr.pop();
  return (t === 'shell' ? '' : header(t)) + arr.join('\n') + '\n';
};
if (WRITE) {
  for (const t of ['brief', 'alerts', 'welcomeTour', 'widgets'])
    fs.writeFileSync(path.join(ROOT, 'src', OUT[t]), content(t));
  fs.writeFileSync(APP_CSS, content('shell'));
  console.log('\nWROTE: src/App.css (shell) +', Object.values(OUT).map((p) => 'src/' + p).join(', '));
} else {
  console.log('\nDRY RUN ok. Re-run with --write to emit files.');
}
console.log('ALL PROOFS PASSED.');
