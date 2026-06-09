import { useState, useEffect, useRef, useCallback } from 'react'
import { useShellStore } from '../state/shellStore.js'

const SOURCES = [
  { label: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { label: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { label: 'France24', url: 'https://www.france24.com/en/rss' },
  { label: 'Euronews', url: 'https://www.euronews.com/rss' },
  { label: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all' },
  { label: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
]

const ADVANCE_MS = 7000
const REFRESH_MS = 120_000
const FADE_MS = 200

function relTime(pubDate) {
  try {
    const diff = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60_000)
    if (diff < 1) return 'now'
    if (diff < 60) return `${diff}m`
    if (diff < 1440) return `${Math.floor(diff / 60)}h`
    return `${Math.floor(diff / 1440)}d`
  } catch {
    return ''
  }
}

async function fetchSource(source) {
  try {
    const res = await fetch(`/api/rss?url=${encodeURIComponent(source.url)}`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const json = await res.json()
    if (json.status !== 'ok') return []
    return (json.items ?? []).map((item) => ({
      title: item.title ?? '',
      link: item.link ?? '',
      pubDate: item.pubDate ?? '',
      label: source.label,
    }))
  } catch {
    return []
  }
}

async function loadWire() {
  try {
    const batches = await Promise.all(SOURCES.map(fetchSource))
    const seen = new Set()
    const merged = []
    for (const items of batches) {
      for (const item of items) {
        const key = item.link || item.title
        if (!key || seen.has(key)) continue
        seen.add(key)
        merged.push(item)
      }
    }
    merged.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    return merged.slice(0, 40)
  } catch {
    return []
  }
}

export default function LatestTicker({ collapsed, onSetCollapsed }) {
  const live = useShellStore((s) => s.globalLive === true)
  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)
  const itemsRef = useRef(items)
  const fadeTimerRef = useRef(null)

  itemsRef.current = items

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const wire = await loadWire()
        if (!cancelled) {
          setItems(wire)
          setIndex(0)
        }
      } catch { /* wire stays empty */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!live) return undefined
    let cancelled = false
    const id = setInterval(async () => {
      try {
        const wire = await loadWire()
        if (cancelled) return
        setItems(wire)
        setIndex((i) => Math.min(i, Math.max(0, wire.length - 1)))
      } catch { /* keep current wire */ }
    }, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [live])

  const advance = useCallback(() => {
    const list = itemsRef.current
    if (list.length <= 1) return
    if (reduceMotion) return
    setVisible(false)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    fadeTimerRef.current = setTimeout(() => {
      setIndex((i) => (i + 1) % list.length)
      setVisible(true)
    }, FADE_MS)
  }, [reduceMotion])

  useEffect(() => {
    if (!live || reduceMotion || collapsed || items.length <= 1) return undefined
    const id = setInterval(advance, ADVANCE_MS)
    return () => clearInterval(id)
  }, [live, reduceMotion, collapsed, items.length, advance])

  useEffect(() => () => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
  }, [])

  const current = items.length > 0 ? items[reduceMotion ? 0 : index] : null

  if (collapsed) {
    return (
      <div className="latest-ticker latest-ticker--collapsed">
        <button
          type="button"
          className="latest-ticker-reveal"
          onClick={() => onSetCollapsed(false)}
          title="Show latest headlines"
          aria-label="Show latest headlines"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 15l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="latest-ticker">
      <div className="latest-ticker-left">
        <button
          type="button"
          className="latest-ticker-collapse-btn"
          onClick={() => onSetCollapsed(true)}
          title="Hide latest headlines"
          aria-label="Hide latest headlines"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {current && (
          <div
            className={`latest-ticker-rotator${visible ? ' is-visible' : ''}${reduceMotion ? ' is-static' : ''}`}
          >
            <span className="latest-ticker-source">{current.label}</span>
            <span className="latest-ticker-time">{relTime(current.pubDate)}</span>
            <a
              className="latest-ticker-headline"
              href={current.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {current.title}
            </a>
            {!live && <span className="latest-ticker-paused">PAUSED</span>}
          </div>
        )}
      </div>
    </div>
  )
}
