import { useState, useRef, useEffect, useCallback } from 'react'
import { Bell } from 'lucide-react'
import AtlasWorldGlobe, { LAYER_COLORS, LAYER_ORDER, LAYER_SWATCH_CSS, formatRelativeTime } from './AtlasWorldGlobe'
import { GN_SEARCH_URL, nsExtractSource, nsCleanTitle } from '../lib/feedSources.js'

const INDICATOR_LAYER_LABELS = {
  conflict: 'Conflict',
  wildfires: 'Wildfires',
  earthquakes: 'Earthquakes',
  storms: 'Storms',
  aircraft: 'Aircraft',
}

const ALERT_CAP = (v) => (v ? String(v).charAt(0).toUpperCase() + String(v).slice(1) : '')
const CONF_LABEL = (v) => {
  const s = String(v).toLowerCase()
  if (s === 'l') return 'Low'
  if (s === 'n') return 'Nominal'
  if (s === 'h') return 'High'
  return String(v)
}
const COUNT_NOUNS = {
  earthquakes: ['earthquake', 'earthquakes'],
  storms: ['tropical cyclone', 'tropical cyclones'],
  aircraft: ['military aircraft', 'military aircraft'],
  wildfires: ['fire detection', 'fire detections'],
  conflict: ['reported conflict event', 'reported conflict events'],
}
const indicatorRowText = (layer, item) => {
  if (layer === 'earthquakes') return item.mag != null ? `M${item.mag} · ${item.label}` : item.label
  if (layer === 'storms') return item.alertlevel ? `${item.label} · ${ALERT_CAP(item.alertlevel)}` : item.label
  if (layer === 'wildfires') {
    const parts = []
    if (item.frp != null && item.frp !== '' && !Number.isNaN(Number(item.frp))) parts.push(`${item.frp} MW`)
    if (item.confidence) parts.push(CONF_LABEL(item.confidence))
    return parts.length ? parts.join(' · ') : item.label
  }
  if (layer === 'conflict') return item.kind ? `${item.label} · ${item.kind}` : item.label
  return item.label
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function newsExcerpt(description, title) {
  const s = stripHtml(description)
  if (!s) return null
  if (title && s === stripHtml(title)) return null
  if (s.length <= 140) return s
  let cut = s.slice(0, 140)
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > 100) cut = cut.slice(0, lastSpace)
  return `${cut.replace(/[\s.,;:!?]+$/, '')}…`
}

function newsRelativeDate(pubDate) {
  const rel = formatRelativeTime(pubDate)
  if (rel) return rel
  if (!pubDate) return null
  const t = new Date(pubDate).getTime()
  if (Number.isNaN(t)) return null
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (diffSec < 60) return 'just now'
  const m = Math.floor(diffSec / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

const DEFAULT_GLOBE_LAYERS = { wildfires: false, earthquakes: true, storms: false, aircraft: false, conflict: false }

/** Muted chip only — globe marker stays on LAYER_COLORS.aircraft */
const AIRCRAFT_CHIP_COLOR = '#92A2B5'

const LAYER_DEFS = [
  { key: 'wildfires',   label: 'Wildfires',   color: LAYER_COLORS.wildfires },
  { key: 'earthquakes', label: 'Earthquakes', color: LAYER_COLORS.earthquakes },
  { key: 'storms',      label: 'Storms',      color: LAYER_COLORS.storms },
  { key: 'aircraft',    label: 'Aircraft',    color: LAYER_COLORS.aircraft, chipColor: AIRCRAFT_CHIP_COLOR },
  { key: 'conflict',    label: 'Conflict',    color: LAYER_COLORS.conflict },
]

function layerChipColor(def, on) {
  if (!on) return null
  return def.chipColor ?? def.color
}

const IFRAME_URLS = {
  conflict: 'https://liveuamap.com/',
  marine:   'https://www.shipfinder.com/?mmsi=&imo=',
  flights:  'https://globe.adsbexchange.com/?lat=20&lon=0&zoom=3',
  cyber:    'https://threatmap.checkpoint.com/',
}

const IFRAME_CREDIT = {
  conflict: 'via Liveuamap',
  marine:   'via ShipFinder',
  flights:  'via ADS-B Exchange',
  cyber:    'via Check Point',
}

const EMBEDDED_SOURCE_LABELS = {
  conflict: 'Conflict',
  marine: 'Ships',
  flights: 'Flights',
  cyber: 'Cyber',
}

const TABS = [
  { key: 'world',    label: 'GLOBE' },
  { key: 'conflict', label: 'CONFLICT' },
  { key: 'marine',   label: 'SHIPS' },
  { key: 'flights',  label: 'FLIGHTS' },
  { key: 'cyber',    label: 'CYBER' },
]

const barStyle = {
  display: 'flex', gap: 6, padding: '6px 12px', alignItems: 'center',
  background: 'var(--surface, #0d1117)', borderBottom: '1px solid var(--border, #1e2329)',
  overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', flexShrink: 0,
}

const tabBtnStyle = (active) => ({
  padding: '3px 8px',
  border: `1px solid ${active ? 'var(--color-brand)' : 'rgba(255,255,255,0.15)'}`,
  borderRadius: 2,
  background: active ? 'var(--color-brand-tint)' : 'transparent',
  color: active ? 'var(--color-brand)' : 'var(--text-muted, #484f58)',
  fontFamily: 'var(--font-mono, JetBrains Mono)', fontSize: 11, textTransform: 'uppercase',
  letterSpacing: '0.5px', lineHeight: 1, cursor: 'pointer', flexShrink: 0,
  transition: 'color 0.15s, border-color 0.15s',
})

const sourcesPanelStyle = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 25,
  maxWidth: 280,
  padding: '10px 28px 10px 12px',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 3,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  lineHeight: 1.45,
  color: 'var(--color-text-secondary)',
}

export default function AtlasWidget({ id, paused, config, onSaveConfig, setActions }) {
  const layers = config.layers ?? DEFAULT_GLOBE_LAYERS
  const mapMode = config.mapMode ?? 'world'

  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig

  const [barsCollapsed, setBarsCollapsed] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [provenance, setProvenance] = useState(null)
  const [, setProvTick] = useState(0)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [refreshSpinning, setRefreshSpinning] = useState(false)
  const [homeNonce, setHomeNonce] = useState(0)
  const [countrySel, setCountrySel] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [newsItems, setNewsItems] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)

  const globeContainerRef = useRef(null)
  const worldGlobeRef = useRef(null)
  const sidebarDragRef = useRef(false)

  const sourcesPanelRef = useRef(null)
  const sourcesToggleRef = useRef(null)

  function toggleLayer(key) {
    const cur = configRef.current.layers ?? DEFAULT_GLOBE_LAYERS
    onSaveConfigRef.current({ ...configRef.current, layers: { ...cur, [key]: !cur[key] } })
  }

  function switchTab(mode) {
    if (mode === (configRef.current.mapMode ?? 'world')) return
    onSaveConfigRef.current({ ...configRef.current, mapMode: mode })
  }

  function handleRefresh() {
    setRefreshNonce((n) => n + 1)
    setRefreshSpinning(true)
    window.setTimeout(() => setRefreshSpinning(false), 800)
  }

  useEffect(() => {
    if (!showSources) return
    const id = setInterval(() => setProvTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [showSources])

  useEffect(() => {
    if (!showSources) return
    const onPointerDown = (e) => {
      if (sourcesPanelRef.current?.contains(e.target)) return
      if (sourcesToggleRef.current?.contains(e.target)) return
      setShowSources(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [showSources])

  useEffect(() => {
    if (!countrySel) {
      setSidebarVisible(false)
      return undefined
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) setSidebarVisible(true)
    else requestAnimationFrame(() => setSidebarVisible(true))

    const onKey = (e) => {
      if (e.key === 'Escape') setCountrySel(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [countrySel])

  useEffect(() => {
    if (!countrySel?.name) {
      setNewsItems([])
      setNewsLoading(false)
      return undefined
    }
    let cancelled = false
    setNewsLoading(true)
    setNewsItems([])
    fetch(`/api/rss?url=${encodeURIComponent(GN_SEARCH_URL(countrySel.name))}`, {
      signal: AbortSignal.timeout(12000),
    })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (!cancelled) setNewsItems(Array.isArray(data?.items) ? data.items : [])
      })
      .catch(() => {
        if (!cancelled) setNewsItems([])
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false)
      })
    return () => { cancelled = true }
  }, [countrySel?.name])

  const onSidebarResizeStart = useCallback((e) => {
    e.preventDefault()
    sidebarDragRef.current = true
    const container = globeContainerRef.current
    if (!container) return
    const containerLeft = container.getBoundingClientRect().left
    const containerWidth = container.getBoundingClientRect().width

    const onMove = (ev) => {
      if (!sidebarDragRef.current) return
      const next = ev.clientX - containerLeft
      setSidebarWidth(Math.min(Math.max(next, 280), Math.min(containerWidth - 40, 720)))
    }
    const onUp = () => {
      sidebarDragRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    setActions?.(
      <>
        <button
          type="button"
          className="widget-btn"
          onClick={() => setBarsCollapsed((v) => !v)}
          title={barsCollapsed ? 'Expand' : 'Collapse'}
        >
          {barsCollapsed ? '▴' : '▾'}
        </button>
        {mapMode === 'world' && (
          <button
            type="button"
            className="widget-btn"
            onClick={() => setHomeNonce((n) => n + 1)}
            title="Reset view"
          >
            ⌂
          </button>
        )}
        <button
          type="button"
          className="widget-btn"
          onClick={handleRefresh}
          title="Refresh"
        >
          <span
            style={
              refreshSpinning
                ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' }
                : undefined
            }
          >
            ↻
          </span>
        </button>
        <button
          ref={sourcesToggleRef}
          type="button"
          className="widget-btn"
          onClick={() => setShowSources((v) => !v)}
          title="Sources & attribution"
        >
          ?
        </button>
      </>,
    )
  }, [setActions, barsCollapsed, showSources, refreshSpinning, mapMode])

  const iframeSrc = (key) => (mapMode === key && !paused) ? IFRAME_URLS[key] : 'about:blank'

  return (
    <>
      {!barsCollapsed && (
        <div style={barStyle} onPointerDownCapture={e => e.stopPropagation()}>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => switchTab(key)} style={tabBtnStyle(mapMode === key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {mapMode === 'world' && !barsCollapsed && (
        <div style={barStyle} onPointerDownCapture={e => e.stopPropagation()}>
          {LAYER_DEFS.map((def) => {
            const { key, label, color } = def
            const on = layers[key]
            const chipColor = layerChipColor(def, on)
            return (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 6px',
                  border: `1px solid ${on ? chipColor : 'var(--color-border)'}`,
                  borderRadius: 2,
                  background: 'transparent',
                  color: on ? chipColor : 'var(--color-text-muted)',
                  fontFamily: 'var(--font-mono, JetBrains Mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  lineHeight: 1,
                  letterSpacing: '0.5px',
                  transition: 'color 0.15s, border-color 0.15s',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 9, color: on ? chipColor : 'inherit' }}>{on ? '●' : '○'}</span>
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div ref={globeContainerRef} style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }}>
        {showSources && (
          <div
            ref={sourcesPanelRef}
            style={sourcesPanelStyle}
            onPointerDownCapture={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowSources(false)}
              title="Close"
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 18,
                height: 18,
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
            <div style={{ fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Sources & attribution
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Globe layers
              </div>
              {LAYER_ORDER.filter((key) => layers?.[key]).map((key) => {
                const p = provenance?.[key]
                if (!p) return null
                const rel = formatRelativeTime(p.fetchedAt)
                const count = p.count != null ? p.count.toLocaleString() : '-'
                return (
                  <div key={key} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 8, height: 8, borderRadius: 2, background: LAYER_SWATCH_CSS[key], flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, color: 'var(--color-text-secondary)' }}>{p.label}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                    </div>
                    <div style={{ marginLeft: 14, color: 'var(--color-text-muted)', fontSize: 10 }}>
                      {p.sourceName}{rel ? ` · ${rel}` : ''}
                    </div>
                    {key === 'aircraft' && (
                      <div style={{ marginLeft: 14, color: 'var(--color-text-muted)', fontSize: 10, lineHeight: 1.35 }}>
                        Transponder positions, an indicator, not confirmed movements.
                      </div>
                    )}
                    {key === 'conflict' && (
                      <div style={{ marginLeft: 14, color: 'var(--color-text-muted)', fontSize: 10, lineHeight: 1.35 }}>
                        Auto-coded indicator from open news data, not verified events.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Embedded views
              </div>
              <div>
                {['conflict', 'marine', 'flights', 'cyber'].map((key, i, arr) => (
                  <span key={key}>
                    {EMBEDDED_SOURCE_LABELS[key]} via {IFRAME_CREDIT[key].replace(/^via /i, '')}
                    {i < arr.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Basemap
              </div>
              <div>© MapTiler · © OpenStreetMap</div>
            </div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 10, borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>
              Vigil tracks, it does not verify.
            </div>
          </div>
        )}

        {countrySel && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: sidebarWidth,
              zIndex: 26,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-surface-1)',
              borderRight: '1px solid var(--color-border)',
              transform: sidebarVisible ? 'translateX(0)' : 'translateX(-100%)',
              transition: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'none'
                : 'transform 0.2s ease',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              lineHeight: 1.45,
              color: 'var(--color-text-secondary)',
              overflow: 'hidden',
            }}
            onPointerDownCapture={e => e.stopPropagation()}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={onSidebarResizeStart}
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 6,
                cursor: 'col-resize',
                zIndex: 2,
              }}
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid var(--color-border)',
              flexShrink: 0,
            }}>
              <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 14 }}>
                {countrySel.name || 'Unknown'}
              </div>
              <button
                type="button"
                onClick={() => setCountrySel(null)}
                title="Close"
                style={{
                  width: 22,
                  height: 22,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 12px' }}>
              {(() => {
                const ind = countrySel.indicators || {}
                const phrase = LAYER_ORDER
                  .filter((k) => ind[k]?.length > 0)
                  .map((k) => {
                    const n = ind[k].length
                    const nouns = COUNT_NOUNS[k]
                    return `${n} ${n === 1 ? nouns[0] : nouns[1]}`
                  })
                  .join(', ')
                const top = !newsLoading && newsItems[0] ? nsCleanTitle(newsItems[0].title) : null
                return (
                  <div style={{ marginBottom: 14, fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
                    {phrase
                      ? <div>{phrase}.</div>
                      : <div style={{ color: 'var(--color-text-muted)' }}>No active indicators in view for this country.</div>}
                    {top && (
                      <div style={{ marginTop: 4, color: 'var(--color-text-muted)' }}>Top headline: {top}</div>
                    )}
                  </div>
                )
              })()}
              {countrySel.indicators && LAYER_ORDER.some((k) => countrySel.indicators[k]?.length > 0) && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{
                    color: 'var(--color-text-muted)',
                    fontSize: 10,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}>
                    Indicators
                  </div>
                  {LAYER_ORDER.filter((k) => countrySel.indicators[k]?.length > 0).map((layer) => {
                    const items = countrySel.indicators[layer]
                    const swatch = LAYER_SWATCH_CSS[layer]
                    return (
                      <div key={layer} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span
                            aria-hidden="true"
                            style={{ width: 8, height: 8, borderRadius: 2, background: swatch, flexShrink: 0 }}
                          />
                          <span style={{ flex: 1 }}>{INDICATOR_LAYER_LABELS[layer]}</span>
                          <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {items.length}
                          </span>
                        </div>
                        {items.slice(0, 5).map((item, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => worldGlobeRef.current?.focusFeature(layer, layer === 'aircraft' ? item.hex : item.coords, sidebarWidth)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', marginLeft: 14, fontSize: 11, color: swatch, marginBottom: 2, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 'inherit' }}
                          >
                            {indicatorRowText(layer, item)}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  color: 'var(--color-text-muted)',
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  News
                </div>
                {newsLoading && (
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Loading…</div>
                )}
                {!newsLoading && newsItems.length === 0 && (
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>No recent coverage</div>
                )}
                {!newsLoading && newsItems.map((item, i) => {
                  const excerpt = newsExcerpt(item.description, item.title)
                  const date = newsRelativeDate(item.pubDate)
                  const src = nsExtractSource(item.title) || item.author || ''
                  return (
                    <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                        {nsCleanTitle(item.title)}
                      </div>
                      {excerpt && (
                        <p style={{ margin: '0 0 4px', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                          {excerpt}
                        </p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--color-text-muted)' }}>
                        {src && item.link && (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand)', textDecoration: 'none' }}>{src}</a>
                        )}
                        {src && !item.link && (<span>{src}</span>)}
                        {date && <span>{date}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{
              padding: '10px 12px',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => {
                  const topic = countrySel.name
                  setCountrySel(null)
                  window.dispatchEvent(new CustomEvent('vigil:suggest-sources', { detail: { topic } }))
                }}
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 3,
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Suggest sources
              </button>
              <button
                type="button"
                onClick={() => {
                  const keyword = countrySel.name
                  setCountrySel(null)
                  window.dispatchEvent(new CustomEvent('vigil:add-alert', { detail: { keyword } }))
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 3,
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <Bell size={14} aria-hidden />
                Add to Alerts
              </button>
            </div>
          </div>
        )}

        {/* WORLD globe: stays mounted; paused when it is not the active tab so its pollers stop */}
        <div style={{ display: mapMode === 'world' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <AtlasWorldGlobe
            ref={worldGlobeRef}
            paused={paused || mapMode !== 'world'}
            layers={layers}
            refreshNonce={refreshNonce}
            aoi={config.aoi}
            onAoiChange={(next) => onSaveConfigRef.current({ ...configRef.current, aoi: next })}
            homeNonce={homeNonce}
            onProvenance={setProvenance}
            onCountrySelect={setCountrySel}
          />
        </div>

        {['conflict', 'marine', 'flights', 'cyber'].map(key => (
          <div key={key} style={{ display: mapMode === key ? 'block' : 'none', position: 'absolute', inset: 0 }}>
            <iframe
              src={iframeSrc(key)}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={`Atlas ${key}`}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox allow-presentation"
              referrerPolicy="no-referrer"
              allowFullScreen
            />
          </div>
        ))}

        {paused && mapMode !== 'world' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(10,12,16,0.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>
            <span style={{ color: 'var(--amber)', fontSize: 22 }}>⏸</span>
            <span style={{ color: 'var(--amber)', fontSize: 11, letterSpacing: '0.12em' }}>PAUSED</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em' }}>Live feed disabled</span>
          </div>
        )}
      </div>
    </>
  )
}
