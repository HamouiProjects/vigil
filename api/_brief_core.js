import { fetchBriefLLM, BriefLLMNotConfiguredError } from './_brief_llm.js'

export class BriefParseError extends Error {
  constructor() {
    super('Brief parse failed')
    this.code = 'BRIEF_PARSE_FAILED'
  }
}

const SYSTEM_PROMPT = 'You write a calm operational news brief. Summarize ONLY the provided items for each labeled group. Do not add any fact, context, or analysis not present in the items. Do not assert anything as verified or true. Output ONLY valid minified JSON, no markdown and no code fences, exactly: {"headline":string,"sections":[{"index":number,"summary":string}]}. The headline is a one-line room summary across all groups. For each section, set index to the [i] number of the group it covers and write one concise summary of ONLY that group\'s items. Include one summary per content-bearing group. Never use em-dashes; use periods, commas, or parentheses.'

const BRIEF_PARSE_FALLBACK = {
  headline: 'Brief unavailable',
  sections: [{ index: 0, summary: '' }],
}

export function isHttpUrl(u) {
  if (typeof u !== 'string') return false
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' } catch { return false }
}

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) return []
  return items
    .filter((i) => i?.title?.trim())
    .map((i) => ({
      source: String(i.source ?? '').trim(),
      title: String(i.title).trim().slice(0, 200),
      url: String(i.url ?? '').trim(),
      publishedAt: i.publishedAt,
      excerpt: String(i.excerpt ?? '').slice(0, 300),
    }))
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .slice(0, 18)
}

export function normalizeWidgetGroups(widgetGroups) {
  if (!Array.isArray(widgetGroups)) return []
  return widgetGroups.map((g) => ({
    widgetId: String(g?.widgetId ?? ''),
    widgetType: String(g?.widgetType ?? ''),
    label: String(g?.label ?? '').trim() || 'Source',
    sourceUrl: isHttpUrl(g?.sourceUrl) ? g.sourceUrl : null,
    includeInBrief: g?.includeInBrief !== false,
    items: normalizeItems(g?.items),
  }))
}

function buildUserContent(contentGroups) {
  const parts = []
  contentGroups.forEach((group, idx) => {
    parts.push(`[${idx + 1}] ${group.label}`)
    for (const item of group.items) {
      parts.push(`${item.source} | ${item.title} | ${item.url}`)
    }
    parts.push('')
  })
  return parts.join('\n').trim()
}

function parseBriefContent(raw) {
  let text = (raw || '').trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    const parsed = JSON.parse(text)
    if (parsed?.headline != null && Array.isArray(parsed?.sections)) return parsed
  } catch { /* fallback below */ }
  return BRIEF_PARSE_FALLBACK
}

function assembleBrief(includedGroups, modelParsed) {
  const summaryByIndex = new Map()
  for (const s of (modelParsed.sections ?? [])) {
    const idx = Number(s?.index)
    if (Number.isFinite(idx) && idx >= 1) {
      summaryByIndex.set(idx, String(s?.summary ?? ''))
    }
  }

  let contentIdx = 0
  const sections = includedGroups.map((group) => {
    if (!group.items.length) {
      return {
        widgetId: group.widgetId,
        widgetType: group.widgetType,
        label: group.label,
        sourceUrl: group.sourceUrl,
        status: 'no_update',
        summary: '',
        items: group.items,
      }
    }
    contentIdx += 1
    return {
      widgetId: group.widgetId,
      widgetType: group.widgetType,
      label: group.label,
      sourceUrl: group.sourceUrl,
      status: 'update',
      summary: summaryByIndex.get(contentIdx) || '',
      items: group.items,
    }
  })

  return {
    headline: String(modelParsed.headline ?? ''),
    sections,
  }
}

function isBriefFallback(brief) {
  return brief?.headline === BRIEF_PARSE_FALLBACK.headline
}

export async function buildFeedBrief({ included, contentGroups }) {
  if (contentGroups.length > 0) {
    const raw = await fetchBriefLLM({ system: SYSTEM_PROMPT, user: buildUserContent(contentGroups) })
    const parsed = parseBriefContent(raw)
    if (isBriefFallback(parsed)) throw new BriefParseError()
    return assembleBrief(included, parsed)
  }
  return {
    headline: 'No updates from tracked feeds',
    sections: included.map((group) => ({
      widgetId: group.widgetId,
      widgetType: group.widgetType,
      label: group.label,
      sourceUrl: group.sourceUrl,
      status: 'no_update',
      summary: '',
    })),
  }
}
