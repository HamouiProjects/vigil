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
const QUAKES_REFRESH_MS = 120_000
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
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const layer = map.getLayer('quakes-layer')
    if (!layer) return
    const visible = layers?.earthquakes ? 'visible' : 'none'
    map.setLayoutProperty('quakes-layer', 'visibility', visible)
  }, [layers?.earthquakes])

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
