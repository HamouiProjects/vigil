import { useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const DEMOTILES_STYLE = 'https://demotiles.maplibre.org/style.json'
const STYLE_WATCHDOG_MS = 2500
const IDLE_MS = 3000
const ROTATE_LNG_PER_FRAME = 0.04
const USGS_QUAKES_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
const GDACS_STORMS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP'
const CONFLICT_GEO_URL = '/api/geo?source=gdelt'
const AIRCRAFT_GEO_URL = '/api/geo?source=aircraft'
const QUAKES_REFRESH_MS = 120_000
const STORMS_REFRESH_MS = 300_000
const CONFLICT_REFRESH_MS = 600_000
const AIRCRAFT_REFRESH_MS = 20_000
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] }

function buildStyleChain() {
  const key = import.meta.env.VITE_MAPTILER_KEY
  const chain = []
  if (key) {
    chain.push(`https://api.maptiler.com/maps/hybrid/style.json?key=${key}`)
  }
  chain.push(OPENFREEMAP_STYLE, DEMOTILES_STYLE)
  return chain
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatTime(epochMs) {
  if (epochMs == null || Number.isNaN(Number(epochMs))) return '—'
  return new Date(Number(epochMs)).toLocaleString()
}

function formatIsoDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatAircraftStats(props) {
  const parts = []
  const type = props.type
  if (type) parts.push(`Type: ${type}`)
  const alt = props.alt
  if (alt != null && alt !== '' && !Number.isNaN(Number(alt))) parts.push(`Alt: ${alt} ft`)
  const speed = props.speed
  if (speed != null && speed !== '' && !Number.isNaN(Number(speed))) parts.push(`${speed} kts`)
  return parts.join(' · ') || '—'
}

function filterTcStorms(geojson) {
  const features = (geojson?.features || []).filter(
    (f) => f.properties?.eventtype === 'TC',
  )
  return { type: 'FeatureCollection', features }
}

/** Stub for later country-click phase — not wired yet. */
function flyToStub(map, lng, lat, zoom = 4) {
  map?.flyTo({ center: [lng, lat], zoom, duration: 1200 })
}

/** Stub for later country-click phase — not wired yet. */
function fitBoundsStub(map, bounds, padding = 40) {
  map?.fitBounds(bounds, { padding, duration: 1200 })
}

void flyToStub
void fitBoundsStub

export default function AtlasWorldGlobe({ paused, layers }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)
  const pausedRef = useRef(paused)
  const layersRef = useRef(layers)
  const interactingRef = useRef(false)
  const idleTimerRef = useRef(null)
  const lngRef = useRef(0)
  const quakesGeoRef = useRef(null)
  const stormsGeoRef = useRef(null)
  const conflictGeoRef = useRef(null)
  const aircraftGeoRef = useRef(null)
  const lastFetchRef = useRef(null)

  pausedRef.current = paused
  layersRef.current = layers

  useEffect(() => {
    let intervalId = null

    const fetchQuakes = async () => {
      if (pausedRef.current) return
      try {
        const res = await fetch(USGS_QUAKES_URL)
        if (!res.ok) return
        const geojson = await res.json()
        quakesGeoRef.current = geojson
        lastFetchRef.current = Date.now()
        const map = mapRef.current
        map?.getSource('quakes')?.setData(geojson)
      } catch {
        /* ignore network errors */
      }
    }

    fetchQuakes()
    intervalId = setInterval(fetchQuakes, QUAKES_REFRESH_MS)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    let intervalId = null

    const fetchStorms = async () => {
      if (pausedRef.current) return
      try {
        const res = await fetch(GDACS_STORMS_URL)
        if (!res.ok) return
        const raw = await res.json()
        const geojson = filterTcStorms(raw)
        stormsGeoRef.current = geojson
        const map = mapRef.current
        map?.getSource('storms')?.setData(geojson)
      } catch {
        /* ignore network errors */
      }
    }

    fetchStorms()
    intervalId = setInterval(fetchStorms, STORMS_REFRESH_MS)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    let intervalId = null

    const fetchConflict = async () => {
      if (pausedRef.current) return
      try {
        const res = await fetch(CONFLICT_GEO_URL)
        if (!res.ok) return
        const geojson = await res.json()
        conflictGeoRef.current = geojson
        const map = mapRef.current
        map?.getSource('conflict')?.setData(geojson)
      } catch {
        /* ignore network errors */
      }
    }

    fetchConflict()
    intervalId = setInterval(fetchConflict, CONFLICT_REFRESH_MS)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    let intervalId = null

    const fetchAircraft = async () => {
      if (pausedRef.current) return
      try {
        const res = await fetch(AIRCRAFT_GEO_URL)
        if (!res.ok) return
        const geojson = await res.json()
        aircraftGeoRef.current = geojson
        const map = mapRef.current
        map?.getSource('aircraft')?.setData(geojson)
      } catch {
        /* ignore network errors */
      }
    }

    fetchAircraft()
    intervalId = setInterval(fetchAircraft, AIRCRAFT_REFRESH_MS)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const layer = map.getLayer('quakes-layer')
    if (!layer) return
    const visible = layers?.earthquakes ? 'visible' : 'none'
    map.setLayoutProperty('quakes-layer', 'visibility', visible)
  }, [layers?.earthquakes])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const layer = map.getLayer('storms-layer')
    if (!layer) return
    const visible = layers?.storms ? 'visible' : 'none'
    map.setLayoutProperty('storms-layer', 'visibility', visible)
  }, [layers?.storms])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const layer = map.getLayer('conflict-layer')
    if (!layer) return
    const visible = layers?.conflict ? 'visible' : 'none'
    map.setLayoutProperty('conflict-layer', 'visibility', visible)
  }, [layers?.conflict])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const layer = map.getLayer('aircraft-layer')
    if (!layer) return
    const visible = layers?.aircraft ? 'visible' : 'none'
    map.setLayoutProperty('aircraft-layer', 'visibility', visible)
  }, [layers?.aircraft])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chain = buildStyleChain()
    let styleIndex = 0
    let styleLocked = false
    let advanceInFlight = false
    let watchdogTimer = null
    let popup = null
    let quakeListenersBound = false
    let stormListenersBound = false
    let conflictListenersBound = false
    let aircraftListenersBound = false

    const clearWatchdog = () => {
      if (watchdogTimer != null) {
        clearTimeout(watchdogTimer)
        watchdogTimer = null
      }
    }

    const scheduleWatchdog = () => {
      clearWatchdog()
      watchdogTimer = setTimeout(() => {
        watchdogTimer = null
        if (styleLocked || map.isStyleLoaded()) {
          styleLocked = true
          clearWatchdog()
          return
        }
        advanceInFlight = false
        tryAdvanceStyle()
      }, STYLE_WATCHDOG_MS)
    }

    const map = new maplibregl.Map({
      container,
      style: chain[styleIndex],
      center: [lngRef.current, 20],
      zoom: 1.4,
      attributionControl: true,
    })
    mapRef.current = map

    const applyGlobeAtmosphere = () => {
      if (typeof map.setProjection === 'function') {
        map.setProjection({ type: 'globe' })
      }
      if (typeof map.setSky === 'function') {
        map.setSky({
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 0.0],
          'sky-atmosphere-sun-intensity': 12,
        })
      }
    }

    const ensureQuakesLayer = () => {
      if (!map.getSource('quakes')) {
        map.addSource('quakes', {
          type: 'geojson',
          data: quakesGeoRef.current || EMPTY_GEOJSON,
        })
      } else if (quakesGeoRef.current) {
        map.getSource('quakes').setData(quakesGeoRef.current)
      }

      if (!map.getLayer('quakes-layer')) {
        map.addLayer({
          id: 'quakes-layer',
          type: 'circle',
          source: 'quakes',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'mag'], 2],
              2,
              3,
              7,
              14,
            ],
            'circle-color': '#FF8C42',
            'circle-opacity': 0.8,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.35,
          },
        })
      }

      const visible = layersRef.current?.earthquakes ? 'visible' : 'none'
      map.setLayoutProperty('quakes-layer', 'visibility', visible)

      if (!quakeListenersBound) {
        quakeListenersBound = true

        map.on('click', 'quakes-layer', (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          const props = feature.properties || {}
          const mag = props.mag != null ? props.mag : '—'
          const place = props.place || 'Unknown location'
          const eventTime = formatTime(props.time)
          const updatedAt = formatTime(props.updated ?? lastFetchRef.current)

          popup?.remove()
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="color:var(--color-text);font-size:12px;line-height:1.45;">
                <div style="font-weight:600;margin-bottom:4px;">M${escapeHtml(mag)} — ${escapeHtml(place)}</div>
                <div style="color:var(--color-text-muted);margin-bottom:6px;">${escapeHtml(eventTime)}</div>
                <div style="color:var(--color-text-muted);font-size:11px;">Source: USGS · updated ${escapeHtml(updatedAt)}</div>
              </div>`,
            )
            .addTo(map)
        })

        map.on('mouseenter', 'quakes-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'quakes-layer', () => {
          map.getCanvas().style.cursor = ''
        })
      }
    }

    const ensureStormsLayer = () => {
      if (!map.getSource('storms')) {
        map.addSource('storms', {
          type: 'geojson',
          data: stormsGeoRef.current || EMPTY_GEOJSON,
        })
      } else if (stormsGeoRef.current) {
        map.getSource('storms').setData(stormsGeoRef.current)
      }

      if (!map.getLayer('storms-layer')) {
        map.addLayer({
          id: 'storms-layer',
          type: 'circle',
          source: 'storms',
          paint: {
            'circle-radius': 6,
            'circle-color': '#38BDF8',
            'circle-opacity': 0.8,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.35,
          },
        })
      }

      const visible = layersRef.current?.storms ? 'visible' : 'none'
      map.setLayoutProperty('storms-layer', 'visibility', visible)

      if (!stormListenersBound) {
        stormListenersBound = true

        map.on('click', 'storms-layer', (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          const props = feature.properties || {}
          const name = props.name || props.eventname || 'Unknown event'
          const country = props.country || '—'
          const alertLevel = props.alertlevel || '—'
          const dateRange = `${formatIsoDate(props.fromdate)} – ${formatIsoDate(props.todate)}`

          popup?.remove()
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="color:var(--color-text);font-size:12px;line-height:1.45;">
                <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(name)}</div>
                <div style="color:var(--color-text-muted);margin-bottom:4px;">${escapeHtml(country)} · Alert: ${escapeHtml(alertLevel)}</div>
                <div style="color:var(--color-text-muted);margin-bottom:6px;">${escapeHtml(dateRange)}</div>
                <div style="color:var(--color-text-muted);font-size:11px;">Source: GDACS</div>
              </div>`,
            )
            .addTo(map)
        })

        map.on('mouseenter', 'storms-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'storms-layer', () => {
          map.getCanvas().style.cursor = ''
        })
      }
    }

    const ensureConflictLayer = () => {
      if (!map.getSource('conflict')) {
        map.addSource('conflict', {
          type: 'geojson',
          data: conflictGeoRef.current || EMPTY_GEOJSON,
        })
      } else if (conflictGeoRef.current) {
        map.getSource('conflict').setData(conflictGeoRef.current)
      }

      if (!map.getLayer('conflict-layer')) {
        map.addLayer({
          id: 'conflict-layer',
          type: 'circle',
          source: 'conflict',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'count'], 1],
              1,
              4,
              50,
              12,
            ],
            'circle-color': '#FF3333',
            'circle-opacity': 0.7,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.35,
          },
        })
      }

      const visible = layersRef.current?.conflict ? 'visible' : 'none'
      map.setLayoutProperty('conflict-layer', 'visibility', visible)

      if (!conflictListenersBound) {
        conflictListenersBound = true

        map.on('click', 'conflict-layer', (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          const props = feature.properties || {}
          const name = props.name || 'Unknown location'
          const count = props.count != null ? props.count : '—'

          popup?.remove()
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="color:var(--color-text);font-size:12px;line-height:1.45;">
                <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(name)}</div>
                <div style="color:var(--color-text-muted);margin-bottom:6px;">${escapeHtml(count)} mentions</div>
                <div style="color:var(--color-text-muted);font-size:11px;">Source: GDELT · activity signal · last 24h</div>
              </div>`,
            )
            .addTo(map)
        })

        map.on('mouseenter', 'conflict-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'conflict-layer', () => {
          map.getCanvas().style.cursor = ''
        })
      }
    }

    const ensureAircraftLayer = () => {
      if (!map.getSource('aircraft')) {
        map.addSource('aircraft', {
          type: 'geojson',
          data: aircraftGeoRef.current || EMPTY_GEOJSON,
        })
      } else if (aircraftGeoRef.current) {
        map.getSource('aircraft').setData(aircraftGeoRef.current)
      }

      if (!map.getLayer('aircraft-layer')) {
        map.addLayer({
          id: 'aircraft-layer',
          type: 'circle',
          source: 'aircraft',
          paint: {
            'circle-radius': 4,
            'circle-color': '#4ADE80',
            'circle-opacity': 0.9,
            'circle-stroke-color': '#0B0E13',
            'circle-stroke-width': 0.5,
            'circle-stroke-opacity': 0.5,
          },
        })
      }

      const visible = layersRef.current?.aircraft ? 'visible' : 'none'
      map.setLayoutProperty('aircraft-layer', 'visibility', visible)

      if (!aircraftListenersBound) {
        aircraftListenersBound = true

        map.on('click', 'aircraft-layer', (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          const props = feature.properties || {}
          const title = (props.callsign || '').trim() || props.hex || 'Unknown aircraft'
          const stats = formatAircraftStats(props)

          popup?.remove()
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="color:var(--color-text);font-size:12px;line-height:1.45;">
                <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(title)}</div>
                <div style="color:var(--color-text-muted);margin-bottom:6px;">${escapeHtml(stats)}</div>
                <div style="color:var(--color-text-muted);font-size:11px;">Source: adsb.lol</div>
              </div>`,
            )
            .addTo(map)
        })

        map.on('mouseenter', 'aircraft-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'aircraft-layer', () => {
          map.getCanvas().style.cursor = ''
        })
      }
    }

    const tryAdvanceStyle = () => {
      if (styleLocked) return
      if (map.isStyleLoaded()) {
        styleLocked = true
        clearWatchdog()
        return
      }
      if (styleIndex >= chain.length - 1) return
      if (advanceInFlight) return

      const failed = chain[styleIndex]
      styleIndex += 1
      const next = chain[styleIndex]
      console.info(`[AtlasWorldGlobe] Basemap style failed (${failed}); trying ${next}.`)

      advanceInFlight = true
      map.setStyle(next)
      scheduleWatchdog()
    }

    const onStyleLoad = () => {
      advanceInFlight = false
      styleLocked = true
      clearWatchdog()
      applyGlobeAtmosphere()
      ensureQuakesLayer()
      ensureStormsLayer()
      ensureConflictLayer()
      ensureAircraftLayer()
    }

    const markInteracting = () => {
      interactingRef.current = true
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        interactingRef.current = false
      }, IDLE_MS)
    }

    map.on('style.load', onStyleLoad)
    map.on('error', () => {
      if (styleLocked) return
      if (!map.isStyleLoaded()) tryAdvanceStyle()
    })
    map.on('dragstart', markInteracting)
    map.on('zoomstart', markInteracting)
    map.on('rotatestart', markInteracting)
    map.on('pitchstart', markInteracting)
    map.on('mousedown', markInteracting)
    map.on('wheel', markInteracting)

    scheduleWatchdog()

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const tick = () => {
      const m = mapRef.current
      if (m && !pausedRef.current && !interactingRef.current && !reducedMotion.matches) {
        lngRef.current = (lngRef.current + ROTATE_LNG_PER_FRAME) % 360
        if (lngRef.current > 180) lngRef.current -= 360
        m.setCenter([lngRef.current, 20], { duration: 0 })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      popup?.remove()
      cancelAnimationFrame(rafRef.current)
      clearTimeout(idleTimerRef.current)
      clearWatchdog()
      map.remove()
      mapRef.current = null
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: 'var(--color-bg)',
      }}
    />
  )
}
