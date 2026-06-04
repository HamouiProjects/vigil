import { useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const DEMOTILES_STYLE = 'https://demotiles.maplibre.org/style.json'
const STYLE_WATCHDOG_MS = 2500
const IDLE_MS = 3000
const ROTATE_LNG_PER_FRAME = 0.04

function buildStyleChain() {
  const key = import.meta.env.VITE_MAPTILER_KEY
  const chain = []
  if (key) {
    chain.push(`https://api.maptiler.com/maps/hybrid/style.json?key=${key}`)
  }
  chain.push(OPENFREEMAP_STYLE, DEMOTILES_STYLE)
  return chain
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
  void layers

  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)
  const pausedRef = useRef(paused)
  const interactingRef = useRef(false)
  const idleTimerRef = useRef(null)
  const lngRef = useRef(0)

  pausedRef.current = paused

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chain = buildStyleChain()
    let styleIndex = 0
    let styleLocked = false
    let advanceInFlight = false
    let watchdogTimer = null

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
