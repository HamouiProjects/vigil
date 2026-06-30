export function formatRelativeTime(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 45) return 'just now'
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.floor(hr / 24)
  return `${day} day ago`
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function safeHttpUrl(value) {
  try { const u = new URL(String(value)); return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null }
  catch { return null }
}

const DATA_MARKER_LAYERS = [
  'quakes-layer',
  'storms-layer',
  'aircraft-layer',
  'wildfires-layer',
  'conflict-layer',
]

function dispatchNewsSearch(query) {
  const q = (query || '').trim()
  if (!q) return
  window.dispatchEvent(new CustomEvent('vigil:search', { detail: { query: q } }))
}

function earthquakeNewsSearchQuery(place) {
  const p = (place || '').trim()
  if (!p) return 'earthquake'
  const parts = p.split(',')
  const region = (parts[parts.length - 1] || p).trim()
  return region ? `${region} earthquake` : 'earthquake'
}

function stormNewsSearchQuery(name) {
  const n = (name || '').trim()
  if (!n) return ''
  return n.replace(/-\d+$/, '').trim()
}

// Dead after the Atlas popup cleanup, removal is a separate tidy.
function buildNewsSearchButtonHtml(query) {
  const q = (query || '').trim()
  if (!q) return ''
  return `<button type="button" class="vigil-popup-news-search" data-vigil-search="${escapeAttr(q)}" style="display:inline-flex;align-items:center;gap:5px;margin-top:10px;padding:5px 10px;border:1px solid var(--color-brand);border-radius:3px;background:var(--color-brand-tint);color:var(--color-brand);font-size:11px;letter-spacing:0.04em;cursor:pointer;font-family:inherit;">Search news ↗</button>`
}

function attachPopupNewsSearchButton(popup) {
  const root = popup.getElement()
  if (!root) return
  const btn = root.querySelector('[data-vigil-search]')
  if (!btn) return
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'var(--color-brand)'
    btn.style.color = 'var(--color-on-brand)'
  })
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'var(--color-brand-tint)'
    btn.style.color = 'var(--color-brand)'
  })
  btn.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    dispatchNewsSearch(btn.getAttribute('data-vigil-search'))
    popup.remove()
  })
}

function wirePopupDismiss(popup, map) {
  const onKeyDown = (e) => {
    if (e.key === 'Escape') popup.remove()
  }
  const onMapClick = (e) => {
    const root = popup.getElement()
    if (!root) return
    const target = e.originalEvent?.target
    if (target && root.contains(target)) return
    const markerHits = map.queryRenderedFeatures(e.point, { layers: DATA_MARKER_LAYERS })
    if (markerHits.length) return
    popup.remove()
  }
  document.addEventListener('keydown', onKeyDown)
  map.on('click', onMapClick)
  popup.once('close', () => {
    document.removeEventListener('keydown', onKeyDown)
    map.off('click', onMapClick)
  })
}

function buildSourceLinkHtml(sourceName, sourceUrl) {
  if (!sourceName || !sourceUrl) return ''
  const raw = String(sourceUrl)
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) return ''
  const href = safeHttpUrl(raw)
  if (!href) return ''
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:var(--color-text-muted);text-decoration:none;">Source: ${escapeHtml(sourceName)} \u2197</a>`
}

function formatTime(epochMs) {
  if (epochMs == null || Number.isNaN(Number(epochMs))) return '—'
  return new Date(Number(epochMs)).toLocaleString()
}

function formatIsoDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const POPUP_BODY_STYLE =
  'padding:10px 12px;color:var(--color-text-primary);font-size:12px;line-height:1.45;min-width:200px;'

function popupRowsHtml(rows) {
  return rows
    .map(
      ([label, value]) =>
        `<div style="margin-bottom:3px;font-size:12px;line-height:1.4;">
          <span style="color:var(--color-text-muted);">${escapeHtml(label)}</span>
          <span style="color:var(--color-text-primary);"> ${escapeHtml(value)}</span>
        </div>`,
    )
    .join('')
}

function buildPhotoBlock(photo) {
  const safeSrc = safeHttpUrl(photo?.src)
  if (!safeSrc) return ''
  const photographer = photo.photographer || 'Unknown'
  const safeLink = safeHttpUrl(photo.link)
  const creditInner = safeLink
    ? `<a href="${escapeAttr(safeLink)}" target="_blank" rel="noopener" style="color:var(--color-text-muted);text-decoration:none;">© ${escapeHtml(photographer)} · Planespotters</a>`
    : `© ${escapeHtml(photographer)} · Planespotters`
  return `<div>
    <img src="${escapeAttr(safeSrc)}" alt="" style="width:100%;max-height:180px;object-fit:cover;display:block;border-radius:3px 3px 0 0;" />
    <div style="font-size:9px;padding:6px 12px;color:var(--color-text-muted);border-bottom:1px solid var(--color-border);background:var(--color-surface-2);">${creditInner}</div>
  </div>`
}

function buildPopupCard({
  dotColor,
  kicker,
  title,
  titleRows,
  rows,
  footerExtra,
  bodyExtraHtml,
  photoHtml,
  newsSearchQuery,
  sourceName,
  sourceUrl,
}) {
  const titleRowsHtml = titleRows?.length ? popupRowsHtml(titleRows) : ''
  const rowsHtml = rows?.length ? popupRowsHtml(rows) : ''
  const searchBtn = buildNewsSearchButtonHtml(newsSearchQuery)
  const sourceLink = buildSourceLinkHtml(sourceName, sourceUrl)
  const footerExtraHtml = footerExtra
    ? `<span style="color:var(--color-text-muted);font-size:10px;">${escapeHtml(footerExtra)}</span>`
    : ''
  const footerParts = [sourceLink, footerExtraHtml].filter(Boolean)
  const footerBlock = footerParts.length
    ? `<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--color-border);display:flex;flex-wrap:wrap;gap:4px;align-items:center;">${footerParts.join('<span style="color:var(--color-text-muted);font-size:10px;opacity:0.5;"> · </span>')}</div>`
    : ''
  const bodyExtraBlock = bodyExtraHtml ? `<div style="margin-top:6px;">${bodyExtraHtml}</div>` : ''

  return `${photoHtml || ''}<div style="${POPUP_BODY_STYLE}">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
      <span style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0;border:1px solid var(--color-border);"></span>
      <span style="font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-text-muted);">${escapeHtml(kicker)}</span>
    </div>
    <div style="font-weight:600;font-size:13px;margin-bottom:6px;line-height:1.35;color:var(--color-text-primary);">${escapeHtml(title)}</div>
    ${titleRowsHtml}
    ${rowsHtml}
    ${bodyExtraBlock}
    ${footerBlock}
    ${searchBtn}
  </div>`
}

function buildEarthquakePopupHtml(feature, prov) {
  const props = feature.properties || {}
  const mag = props.mag
  const place = props.place || 'Unknown location'
  const title =
    mag != null && !Number.isNaN(Number(mag))
      ? `M${mag} · ${place}`
      : place

  const rows = []
  if (mag != null && !Number.isNaN(Number(mag))) rows.push(['Magnitude', String(mag)])
  const depth = feature.geometry?.coordinates?.[2]
  if (depth != null && !Number.isNaN(Number(depth))) {
    rows.push(['Depth', `${Number(depth).toFixed(1)} km`])
  }
  if (props.time != null) {
    const t = formatTime(props.time)
    if (t !== '—') rows.push(['Time', t])
  }

  const updatedAtMs = prov?.fetchedAt ? Date.parse(prov.fetchedAt) : null
  const updated = formatTime(props.updated ?? updatedAtMs)
  const footerExtra = updated !== '—' ? `Updated ${updated}` : null

  return buildPopupCard({
    dotColor: 'var(--color-warning)',
    kicker: 'EARTHQUAKE',
    title,
    rows,
    footerExtra,
    sourceName: prov?.sourceName,
    sourceUrl: prov?.sourceUrl,
  })
}

function buildStormPopupHtml(props, prov) {
  const name = props.name || props.eventname || 'Unknown event'
  const rows = []
  if (props.country) rows.push(['Region', props.country])
  if (props.alertlevel) rows.push(['Alert level', props.alertlevel])
  const from = formatIsoDate(props.fromdate)
  const to = formatIsoDate(props.todate)
  if (from || to) {
    const active = from && to ? `${from} to ${to}` : from || to
    rows.push(['Active', active])
  }

  return buildPopupCard({
    dotColor: 'var(--color-info)',
    kicker: 'TROPICAL CYCLONE',
    title: name,
    rows,
    sourceName: prov?.sourceName,
    sourceUrl: prov?.sourceUrl,
  })
}

// Map FIRMS confidence codes l/n/h to readable labels, parity with the sidebar.
function confidenceLabel(v) {
  const s = String(v).toLowerCase()
  if (s === 'l') return 'Low'
  if (s === 'n') return 'Nominal'
  if (s === 'h') return 'High'
  return String(v)
}

function fmtAcqTime(t) {
  const s = String(t ?? '').padStart(4, '0')
  if (!/^\d{4}$/.test(s)) return t
  return `${s.slice(0, 2)}:${s.slice(2)}`
}

function buildWildfirePopupHtml(props, prov) {
  const rows = []
  if (props.frp != null && props.frp !== '' && !Number.isNaN(Number(props.frp))) {
    rows.push(['Radiative power', `${props.frp} MW`])
  }
  if (props.confidence) rows.push(['Confidence', confidenceLabel(props.confidence)])
  const detected = [props.acq_date, props.acq_time != null && props.acq_time !== '' ? fmtAcqTime(props.acq_time) : null].filter(Boolean).join(' ')
  if (detected) rows.push(['Detected', `${detected} UTC`])

  return buildPopupCard({
    dotColor: 'var(--color-wildfire)',
    kicker: 'ACTIVE WILDFIRE',
    title: 'Active fire detection',
    rows,
    sourceName: prov?.sourceName,
    sourceUrl: prov?.sourceUrl,
  })
}

function buildConflictPopupHtml(props, prov) {
  const kind = props.kind || 'Conflict event'
  const place = (props.place || '').trim()
  const titleRows = place ? [['', place]] : []
  const rel = formatRelativeTime(prov?.fetchedAt)
  const summary = place ? `${kind} reported near ${place}.` : `${kind} reported.`
  const footerExtra = [summary, rel ? `Updated ${rel}` : null].filter(Boolean).join(' · ')

  return buildPopupCard({
    dotColor: 'var(--color-conflict-mid)',
    kicker: 'REPORTED CONFLICT',
    title: kind,
    titleRows,
    footerExtra,
  })
}

function buildAircraftPopupHtml(props, { country = null, photo = null, prov = null } = {}) {
  const callsign = (props.callsign || '').trim()
  const titleBase = callsign || props.hex || 'Unknown aircraft'
  const title = props.type ? `${titleBase} · ${props.type}` : titleBase

  const titleRows = []
  if (country) titleRows.push(['Country', country])

  const rows = []
  if (props.reg) rows.push(['Registration', props.reg])
  if (props.alt != null && props.alt !== '' && !Number.isNaN(Number(props.alt))) {
    rows.push(['Altitude', `${props.alt} ft`])
  }
  if (props.speed != null && props.speed !== '' && !Number.isNaN(Number(props.speed))) {
    rows.push(['Speed', `${props.speed} kts`])
  }
  if (typeof props.track === 'number' && !Number.isNaN(props.track)) {
    rows.push(['Heading', `${props.track}°`])
  }
  if (props.squawk != null && props.squawk !== '') {
    rows.push(['Squawk', String(props.squawk)])
  }

  return buildPopupCard({
    dotColor: 'var(--color-text-primary)',
    kicker: 'MILITARY AIRCRAFT',
    title,
    titleRows,
    rows,
    sourceName: prov?.sourceName,
    sourceUrl: prov?.sourceUrl,
    photoHtml: buildPhotoBlock(photo),
  })
}

function filterTcStorms(geojson) {
  const features = (geojson?.features || []).filter(
    (f) => f.properties?.eventtype === 'TC',
  )
  return { type: 'FeatureCollection', features }
}

export {
  formatTime,
  formatIsoDate,
  escapeHtml,
  escapeAttr,
  safeHttpUrl,
  POPUP_BODY_STYLE,
  DATA_MARKER_LAYERS,
  dispatchNewsSearch,
  earthquakeNewsSearchQuery,
  stormNewsSearchQuery,
  buildNewsSearchButtonHtml,
  attachPopupNewsSearchButton,
  wirePopupDismiss,
  buildSourceLinkHtml,
  popupRowsHtml,
  buildPhotoBlock,
  buildPopupCard,
  buildEarthquakePopupHtml,
  buildStormPopupHtml,
  confidenceLabel,
  fmtAcqTime,
  buildWildfirePopupHtml,
  buildConflictPopupHtml,
  buildAircraftPopupHtml,
  filterTcStorms,
}
