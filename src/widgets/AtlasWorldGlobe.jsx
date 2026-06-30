import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ensureRtlTextPlugin, STYLE_WATCHDOG_MS, DEFAULT_VIEW, readGlobeTheme, applyGlobeTheme, buildStyleChain } from './atlas/atlasStyle'
import { calmBasemapLabels } from './atlas/atlasLabels'
import { countryNameFromProps, pointInGeometry, bboxOfGeometry, countryFeatureAtLngLat, featurePoint, containedMarkers } from './atlas/atlasGeo'
import { EMPTY_GEOJSON, COUNTRIES_GEO_URL, USGS_QUAKES_URL, GDACS_STORMS_URL, AIRCRAFT_GEO_URL, WILDFIRES_GEO_URL, CONFLICT_GEO_URL, QUAKES_REFRESH_MS, STORMS_REFRESH_MS, AIRCRAFT_REFRESH_MS, WILDFIRES_REFRESH_MS, CONFLICT_REFRESH_MS, resolveLayerMarkerColors, applyLayerMarkerColors, createDefaultProvenance, featureCollectionFromGeoResponse, CIRCLE_STROKE_COLOR, CIRCLE_STROKE_WIDTH, AIRCRAFT_ICON_ID, registerAircraftIcon } from './atlas/atlasLayers'
import { countryFromHex, fetchPlanespottersPhoto } from './atlas/atlasAircraft'
import { DATA_MARKER_LAYERS, wirePopupDismiss, buildEarthquakePopupHtml, buildStormPopupHtml, buildWildfirePopupHtml, buildConflictPopupHtml, buildAircraftPopupHtml, filterTcStorms } from './atlas/atlasPopups'

export { LAYER_COLORS, LAYER_SWATCH_CSS, LAYER_ORDER } from './atlas/atlasLayers'
export { formatRelativeTime } from './atlas/atlasPopups'

const AtlasWorldGlobe = forwardRef(function AtlasWorldGlobe({ paused, layers, refreshNonce = 0, aoi = null, onAoiChange, homeNonce = 0, onProvenance, onCountrySelect }, ref) {
  const wrapRef = useRef(null)
  const openAircraftRef = useRef(null)
  const focusFeatureRef = useRef(null)

  useImperativeHandle(ref, () => ({
    openAircraftPopup: (hex, leftPad) => openAircraftRef.current?.(hex, leftPad),
    focusFeature: (layer, idOrCoords, leftPad) => focusFeatureRef.current?.(layer, idOrCoords, leftPad),
  }), [])
  const containerRef = useRef(null)
  const countryReadoutRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)
  const pausedRef = useRef(paused)
  const layersRef = useRef(layers)
  const interactingRef = useRef(false)
  const idleTimerRef = useRef(null)
  const lngRef = useRef(0)
  const spinRef = useRef(null)
  const spinningRef = useRef(false)
  const quakesGeoRef = useRef(null)
  const stormsGeoRef = useRef(null)
  const aircraftGeoRef = useRef(null)
  const wildfiresGeoRef = useRef(null)
  const conflictGeoRef = useRef(null)
  const lastFetchRef = useRef(null)
  const [provenance, setProvenance] = useState(createDefaultProvenance)
  const provenanceRef = useRef(provenance)
  provenanceRef.current = provenance
  const aircraftPhotoCacheRef = useRef(new Map())
  const countriesGeoRef = useRef(null)
  const countryBBoxesRef = useRef(null)
  const hoverRAFRef = useRef(0)
  const lastHoverLngLatRef = useRef(null)
  const initialAoiRef = useRef(aoi)
  const onAoiChangeRef = useRef(onAoiChange)
  onAoiChangeRef.current = onAoiChange
  const onProvenanceRef = useRef(onProvenance)
  onProvenanceRef.current = onProvenance
  const onCountrySelectRef = useRef(onCountrySelect)
  onCountrySelectRef.current = onCountrySelect

  pausedRef.current = paused
  layersRef.current = layers

  const stopSpin = () => {
    if (spinRef.current) cancelAnimationFrame(spinRef.current)
    spinRef.current = null
    spinningRef.current = false
  }
  const startSpin = () => {
    const map = mapRef.current
    if (!map) return
    stopSpin()
    spinningRef.current = true
    const lat = DEFAULT_VIEW.center[1]
    lngRef.current = map.getCenter().lng
    const step = () => {
      if (!spinningRef.current) return
      let lng = lngRef.current + 0.055
      if (lng > 180) lng -= 360
      lngRef.current = lng
      map.setCenter([lng, lat])
      spinRef.current = requestAnimationFrame(step)
    }
    spinRef.current = requestAnimationFrame(step)
  }

  const patchProvenance = (layer, patch) => {
    setProvenance((prev) => {
      const next = { ...prev, [layer]: { ...prev[layer], ...patch } }
      provenanceRef.current = next
      return next
    })
  }

  useEffect(() => {
    if (typeof onProvenanceRef.current === 'function') onProvenanceRef.current(provenance)
  }, [provenance])

  useEffect(() => {
    let intervalId = null

    const fetchQuakes = async () => {
      if (pausedRef.current) return
      try {
        const res = await fetch(USGS_QUAKES_URL)
        if (!res.ok) return
        const geojson = await res.json()
        quakesGeoRef.current = geojson
        const fetchedAt = new Date().toISOString()
        lastFetchRef.current = Date.now()
        patchProvenance('earthquakes', {
          fetchedAt,
          count: geojson.features?.length ?? 0,
        })
        const map = mapRef.current
        map?.getSource('quakes')?.setData(geojson)
      } catch {
        /* ignore network errors */
      }
    }

    fetchQuakes()
    intervalId = setInterval(fetchQuakes, QUAKES_REFRESH_MS)

    return () => clearInterval(intervalId)
  }, [refreshNonce])

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
        patchProvenance('storms', {
          fetchedAt: new Date().toISOString(),
          count: geojson.features?.length ?? 0,
        })
        const map = mapRef.current
        map?.getSource('storms')?.setData(geojson)
      } catch {
        /* ignore network errors */
      }
    }

    fetchStorms()
    intervalId = setInterval(fetchStorms, STORMS_REFRESH_MS)

    return () => clearInterval(intervalId)
  }, [refreshNonce])

  useEffect(() => {
    let intervalId = null

    const fetchAircraft = async () => {
      if (pausedRef.current) return
      try {
        const res = await fetch(AIRCRAFT_GEO_URL)
        if (!res.ok) return
        const json = await res.json()
        const geojson = featureCollectionFromGeoResponse(json)
        aircraftGeoRef.current = geojson
        if (json.meta) {
          patchProvenance('aircraft', {
            sourceName: json.meta.sourceName ?? provenanceRef.current.aircraft.sourceName,
            sourceUrl: json.meta.sourceUrl ?? provenanceRef.current.aircraft.sourceUrl,
            fetchedAt: json.meta.fetchedAt ?? new Date().toISOString(),
            count: json.meta.count ?? geojson.features.length,
          })
        }
        const map = mapRef.current
        map?.getSource('aircraft')?.setData(geojson)
      } catch {
        /* ignore network errors */
      }
    }

    fetchAircraft()
    intervalId = setInterval(fetchAircraft, AIRCRAFT_REFRESH_MS)

    return () => clearInterval(intervalId)
  }, [refreshNonce])

  useEffect(() => {
    let intervalId = null

    const fetchWildfires = async () => {
      if (pausedRef.current) return
      try {
        const res = await fetch(WILDFIRES_GEO_URL)
        if (!res.ok) return
        const json = await res.json()
        const geojson = featureCollectionFromGeoResponse(json)
        wildfiresGeoRef.current = geojson
        if (json.meta) {
          patchProvenance('wildfires', {
            sourceName: json.meta.sourceName ?? provenanceRef.current.wildfires.sourceName,
            sourceUrl: json.meta.sourceUrl ?? provenanceRef.current.wildfires.sourceUrl,
            fetchedAt: json.meta.fetchedAt ?? new Date().toISOString(),
            count: json.meta.count ?? geojson.features.length,
          })
        }
        const map = mapRef.current
        map?.getSource('wildfires')?.setData(geojson)
      } catch {
        /* ignore network errors */
      }
    }

    fetchWildfires()
    intervalId = setInterval(fetchWildfires, WILDFIRES_REFRESH_MS)

    return () => clearInterval(intervalId)
  }, [refreshNonce])

  useEffect(() => {
    if (!layers?.conflict) return
    let intervalId = null
    const fetchConflict = async () => {
      if (pausedRef.current) return
      try {
        const res = await fetch(CONFLICT_GEO_URL)
        if (!res.ok) return
        const json = await res.json()
        const geojson = featureCollectionFromGeoResponse(json)
        conflictGeoRef.current = geojson
        if (json.meta) {
          patchProvenance('conflict', {
            sourceName: json.meta.sourceName ?? provenanceRef.current.conflict.sourceName,
            sourceUrl: json.meta.sourceUrl ?? provenanceRef.current.conflict.sourceUrl,
            fetchedAt: json.meta.fetchedAt ?? new Date().toISOString(),
            count: json.meta.count ?? geojson.features.length,
          })
        } else {
          patchProvenance('conflict', { fetchedAt: new Date().toISOString(), count: geojson.features.length })
        }
        const map = mapRef.current
        map?.getSource('conflict')?.setData(geojson)
      } catch { /* ignore network errors */ }
    }
    fetchConflict()
    intervalId = setInterval(fetchConflict, CONFLICT_REFRESH_MS)
    return () => clearInterval(intervalId)
  }, [refreshNonce, layers?.conflict])

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
    const layer = map.getLayer('aircraft-layer')
    if (!layer) return
    const visible = layers?.aircraft ? 'visible' : 'none'
    map.setLayoutProperty('aircraft-layer', 'visibility', visible)
  }, [layers?.aircraft])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const layer = map.getLayer('wildfires-layer')
    if (!layer) return
    const visible = layers?.wildfires ? 'visible' : 'none'
    map.setLayoutProperty('wildfires-layer', 'visibility', visible)
  }, [layers?.wildfires])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (!map.getLayer('conflict-layer')) return
    map.setLayoutProperty('conflict-layer', 'visibility', layers?.conflict ? 'visible' : 'none')
  }, [layers?.conflict])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chain = buildStyleChain()
    let styleIndex = 0
    let styleLocked = false
    let advanceInFlight = false
    let watchdogTimer = null
    let popup = null
    let aircraftPopupToken = 0
    let quakeListenersBound = false
    let stormListenersBound = false
    let aircraftListenersBound = false
    let wildfiresListenersBound = false
    let conflictListenersBound = false

    const updateCountryReadout = (name) => {
      const el = countryReadoutRef.current
      if (!el) return
      if (name) {
        el.textContent = name
        el.style.display = 'block'
      } else {
        el.textContent = ''
        el.style.display = 'none'
      }
    }

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

    ensureRtlTextPlugin()

    const startAoi = initialAoiRef.current
    const startCenter = startAoi && Array.isArray(startAoi.center) ? startAoi.center : DEFAULT_VIEW.center
    const startZoom = startAoi && typeof startAoi.zoom === 'number' ? startAoi.zoom : DEFAULT_VIEW.zoom
    lngRef.current = startCenter[0]

    const map = new maplibregl.Map({
      container,
      style: chain[styleIndex],
      center: startCenter,
      zoom: startZoom,
      attributionControl: true,
    })
    mapRef.current = map

    map.on('click', (e) => {
      const markerHits = map.queryRenderedFeatures(e.point, { layers: DATA_MARKER_LAYERS })
      if (markerHits.length) return
      const feat = countryFeatureAtLngLat(
        e.lngLat.lng,
        e.lngLat.lat,
        countriesGeoRef.current,
        countryBBoxesRef.current,
      )
      if (!feat) return
      const geometry = feat.geometry
      const onLayers = layersRef.current
      const indicators = {}
      if (onLayers?.conflict) {
        const items = containedMarkers(conflictGeoRef, geometry, (f, coords) => {
          const p = f.properties || {}
          return { label: p.place || 'Conflict event', kind: p.kind || '', coords }
        })
        if (items.length) indicators.conflict = items
      }
      if (onLayers?.wildfires) {
        const items = containedMarkers(wildfiresGeoRef, geometry, (f, coords) => ({
          label: 'Fire detection',
          confidence: f.properties?.confidence,
          frp: f.properties?.frp,
          coords,
        }))
        if (items.length) indicators.wildfires = items
      }
      if (onLayers?.earthquakes) {
        const items = containedMarkers(quakesGeoRef, geometry, (f, coords) => {
          const p = f.properties || {}
          return { label: p.place || 'Earthquake', mag: p.mag, coords }
        })
        if (items.length) indicators.earthquakes = items
      }
      if (onLayers?.storms) {
        const cname = (countryNameFromProps(feat.properties) || '').trim().toLowerCase()
        const ciso = (feat.properties?.ISO_A3 || '').trim().toUpperCase()
        const seen = new Set()
        const stormItems = []
        for (const f of (stormsGeoRef.current?.features || [])) {
          const p = f.properties || {}
          const stormCountries = (p.country || '').toLowerCase().split(/[,;/]/).map((s) => s.trim()).filter(Boolean)
          const nameMatch = cname && stormCountries.includes(cname)
          const isoMatch = ciso && ciso !== '-99' && (p.iso3 || '').trim().toUpperCase() === ciso
          const pt = featurePoint(f)
          const inPolygon = pt && pt.length >= 2 && pointInGeometry(pt[0], pt[1], geometry)
          if (!nameMatch && !isoMatch && !inPolygon) continue
          const id = p.eventid || p.name || p.eventname || 'storm'
          if (seen.has(id)) continue
          seen.add(id)
          stormItems.push({ label: p.name || p.eventname || 'Storm', alertlevel: p.alertlevel, coords: pt })
        }
        if (stormItems.length) indicators.storms = stormItems
      }
      if (onLayers?.aircraft) {
        const items = containedMarkers(aircraftGeoRef, geometry, (f, coords) => {
          const p = f.properties || {}
          return { label: p.callsign || p.hex || 'Aircraft', hex: p.hex, coords }
        })
        if (items.length) indicators.aircraft = items
      }
      onCountrySelectRef.current?.({
        name: countryNameFromProps(feat.properties),
        iso3: feat.properties?.ISO_A3,
        indicators,
      })
    })

    const findByPoint = (geoRef, coords) => {
      const feats = geoRef.current?.features || []
      const lng = coords[0]
      const lat = coords[1]
      let best = null
      let bestD = Infinity
      for (const f of feats) {
        const p = featurePoint(f)
        if (!p || p.length < 2) continue
        const d = Math.abs(p[0] - lng) + Math.abs(p[1] - lat)
        if (d < bestD) { bestD = d; best = f }
      }
      return bestD <= 0.0005 ? best : null
    }

    const focusFeatureByCoords = (layer, idOrCoords, leftPad) => {
      if (layer === 'aircraft') { openAircraftRef.current?.(idOrCoords, leftPad); return }
      const coords = idOrCoords
      if (!Array.isArray(coords) || coords.length < 2) return
      let f = null
      let html = null
      if (layer === 'earthquakes') {
        f = findByPoint(quakesGeoRef, coords)
        if (f) html = buildEarthquakePopupHtml(f, provenanceRef.current.earthquakes)
      } else if (layer === 'storms') {
        f = findByPoint(stormsGeoRef, coords)
        if (f) html = buildStormPopupHtml(f.properties || {}, provenanceRef.current.storms)
      } else if (layer === 'wildfires') {
        f = findByPoint(wildfiresGeoRef, coords)
        if (f) html = buildWildfirePopupHtml(f.properties || {}, provenanceRef.current.wildfires)
      } else if (layer === 'conflict') {
        f = findByPoint(conflictGeoRef, coords)
        if (f) html = buildConflictPopupHtml(f.properties || {}, provenanceRef.current.conflict)
      }
      if (!f || !html) return
      map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 4), duration: 800, padding: { left: leftPad || 0 } })
      popup?.remove()
      popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'vigil-popup' })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map)
      wirePopupDismiss(popup, map)
    }
    focusFeatureRef.current = focusFeatureByCoords

    const processCountryHover = () => {
      hoverRAFRef.current = 0
      const ll = lastHoverLngLatRef.current
      const hl = map.getSource('country-highlight')
      if (!ll) {
        hl?.setData({ type: 'FeatureCollection', features: [] })
        updateCountryReadout(null)
        return
      }
      const feat = countryFeatureAtLngLat(
        ll.lng,
        ll.lat,
        countriesGeoRef.current,
        countryBBoxesRef.current,
      )
      hl?.setData({ type: 'FeatureCollection', features: feat ? [feat] : [] })
      updateCountryReadout(feat ? countryNameFromProps(feat.properties) : null)
    }
    map.on('mousemove', (e) => {
      lastHoverLngLatRef.current = e.lngLat
      if (!hoverRAFRef.current) hoverRAFRef.current = requestAnimationFrame(processCountryHover)
    })
    map.on('mouseout', () => {
      lastHoverLngLatRef.current = null
      if (!hoverRAFRef.current) hoverRAFRef.current = requestAnimationFrame(processCountryHover)
    })

    const applyTheme = () => {
      applyGlobeTheme(readGlobeTheme(), map, {
        wrapEl: wrapRef.current,
        mapContainerEl: containerRef.current,
      })
    }

    applyTheme()

    const themeObserver = new MutationObserver(() => {
      applyTheme()
      applyLayerMarkerColors(map)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    const ensureCountryHighlightLayer = () => {
      if (!map.getSource('country-highlight')) {
        map.addSource('country-highlight', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
      }
      const beforeId = map.getLayer('quakes-layer') ? 'quakes-layer' : undefined
      if (!map.getLayer('country-highlight-fill')) {
        map.addLayer(
          {
            id: 'country-highlight-fill',
            type: 'fill',
            source: 'country-highlight',
            paint: { 'fill-color': 'rgba(226,232,240,0.10)' },
          },
          beforeId,
        )
      }
      if (!map.getLayer('country-highlight-line')) {
        map.addLayer(
          {
            id: 'country-highlight-line',
            type: 'line',
            source: 'country-highlight',
            paint: { 'line-color': 'rgba(226,232,240,0.45)', 'line-width': 1 },
          },
          beforeId,
        )
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
        const markerColors = resolveLayerMarkerColors()
        map.addLayer({
          id: 'quakes-layer',
          type: 'circle',
          source: 'quakes',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'mag'], 2],
              2.5,
              2,
              5,
              4,
              7,
              6,
              9,
              7,
            ],
            'circle-color': markerColors.earthquakes,
            'circle-opacity': 0.85,
            'circle-stroke-color': CIRCLE_STROKE_COLOR,
            'circle-stroke-width': CIRCLE_STROKE_WIDTH,
            'circle-stroke-opacity': 1,
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
          popup?.remove()
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'vigil-popup' })
            .setLngLat(e.lngLat)
            .setHTML(buildEarthquakePopupHtml(feature, provenanceRef.current.earthquakes))
            .addTo(map)
          wirePopupDismiss(popup, map)
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
        const markerColors = resolveLayerMarkerColors()
        map.addLayer({
          id: 'storms-layer',
          type: 'circle',
          source: 'storms',
          paint: {
            'circle-radius': 6,
            'circle-color': markerColors.storms,
            'circle-opacity': 0.85,
            'circle-stroke-color': CIRCLE_STROKE_COLOR,
            'circle-stroke-width': CIRCLE_STROKE_WIDTH,
            'circle-stroke-opacity': 1,
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

          popup?.remove()
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'vigil-popup' })
            .setLngLat(e.lngLat)
            .setHTML(buildStormPopupHtml(props, provenanceRef.current.storms))
            .addTo(map)
          wirePopupDismiss(popup, map)
        })

        map.on('mouseenter', 'storms-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'storms-layer', () => {
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

      registerAircraftIcon(map)

      if (!map.getLayer('aircraft-layer')) {
        map.addLayer({
          id: 'aircraft-layer',
          type: 'symbol',
          source: 'aircraft',
          layout: {
            'icon-image': AIRCRAFT_ICON_ID,
            'icon-size': 0.9,
            'icon-rotate': ['coalesce', ['get', 'track'], 0],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        })
      }

      const visible = layersRef.current?.aircraft ? 'visible' : 'none'
      map.setLayoutProperty('aircraft-layer', 'visibility', visible)

      const openAircraftPopupAt = (props, lngLat) => {
        const hex = String(props.hex || '').trim().toLowerCase()
        const country = countryFromHex(hex)
        const token = ++aircraftPopupToken
        const cache = aircraftPhotoCacheRef.current
        const aircraftProv = provenanceRef.current.aircraft
        const renderAircraftPopup = (photo) => {
          if (token !== aircraftPopupToken || !popup) return
          popup.setHTML(buildAircraftPopupHtml(props, { country, photo, prov: aircraftProv }))
        }
        popup?.remove()
        popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'vigil-popup' })
          .setLngLat(lngLat)
          .setHTML(buildAircraftPopupHtml(props, { country, photo: null, prov: aircraftProv }))
          .addTo(map)
        wirePopupDismiss(popup, map)
        if (!hex) return
        const cached = cache.get(hex)
        if (cached !== undefined) {
          if (cached) renderAircraftPopup(cached)
          return
        }
        fetchPlanespottersPhoto(hex, cache).then((photo) => {
          if (!photo) return
          renderAircraftPopup(photo)
        })
      }

      if (!aircraftListenersBound) {
        aircraftListenersBound = true

        map.on('click', 'aircraft-layer', (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          openAircraftPopupAt(feature.properties || {}, e.lngLat)
        })

        map.on('mouseenter', 'aircraft-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'aircraft-layer', () => {
          map.getCanvas().style.cursor = ''
        })
      }

      const openAircraftPopupByHex = (hexInput, leftPad) => {
        const hx = String(hexInput || '').trim().toLowerCase()
        if (!hx) return
        const feats = aircraftGeoRef.current?.features || []
        const f = feats.find((ft) => String(ft.properties?.hex || '').trim().toLowerCase() === hx)
        if (!f) return
        const coords = f.geometry?.coordinates
        if (!coords || coords.length < 2) return
        map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 4), duration: 800, padding: { left: leftPad || 0 } })
        openAircraftPopupAt(f.properties || {}, { lng: coords[0], lat: coords[1] })
      }
      openAircraftRef.current = openAircraftPopupByHex
    }

    const ensureWildfiresLayer = () => {
      if (!map.getSource('wildfires')) {
        map.addSource('wildfires', {
          type: 'geojson',
          data: wildfiresGeoRef.current || EMPTY_GEOJSON,
        })
      } else if (wildfiresGeoRef.current) {
        map.getSource('wildfires').setData(wildfiresGeoRef.current)
      }

      if (!map.getLayer('wildfires-layer')) {
        const markerColors = resolveLayerMarkerColors()
        map.addLayer({
          id: 'wildfires-layer',
          type: 'circle',
          source: 'wildfires',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'frp'],
              0,
              2,
              100,
              5,
              500,
              8,
            ],
            'circle-color': markerColors.wildfires,
            'circle-opacity': 0.85,
            'circle-stroke-color': CIRCLE_STROKE_COLOR,
            'circle-stroke-width': CIRCLE_STROKE_WIDTH,
            'circle-stroke-opacity': 1,
          },
        })
      }

      const visible = layersRef.current?.wildfires ? 'visible' : 'none'
      map.setLayoutProperty('wildfires-layer', 'visibility', visible)

      if (!wildfiresListenersBound) {
        wildfiresListenersBound = true

        map.on('click', 'wildfires-layer', (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          const props = feature.properties || {}

          popup?.remove()
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'vigil-popup' })
            .setLngLat(e.lngLat)
            .setHTML(buildWildfirePopupHtml(props, provenanceRef.current.wildfires))
            .addTo(map)
          wirePopupDismiss(popup, map)
        })

        map.on('mouseenter', 'wildfires-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'wildfires-layer', () => {
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
        const markerColors = resolveLayerMarkerColors()
        map.addLayer({
          id: 'conflict-layer',
          type: 'circle',
          source: 'conflict',
          paint: {
            'circle-radius': 6,
            'circle-color': markerColors.conflict,
            'circle-opacity': 0.85,
            'circle-stroke-color': CIRCLE_STROKE_COLOR,
            'circle-stroke-width': CIRCLE_STROKE_WIDTH,
            'circle-stroke-opacity': 1,
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
          const conflictProv = provenanceRef.current.conflict
          popup?.remove()
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'vigil-popup' })
            .setLngLat(e.lngLat)
            .setHTML(buildConflictPopupHtml(props, conflictProv))
            .addTo(map)
          wirePopupDismiss(popup, map)
        })

        map.on('mouseenter', 'conflict-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'conflict-layer', () => {
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
      updateCountryReadout(null)
      applyTheme()
      calmBasemapLabels(map)
      ensureCountryHighlightLayer()
      ensureQuakesLayer()
      ensureStormsLayer()
      ensureAircraftLayer()
      ensureWildfiresLayer()
      ensureConflictLayer()
      applyLayerMarkerColors(map)
    }

    let aoiSaveTimer = null
    const persistAoi = () => {
      if (spinningRef.current) return
      const m = mapRef.current
      if (!m || typeof onAoiChangeRef.current !== 'function') return
      const c = m.getCenter()
      onAoiChangeRef.current({ center: [c.lng, c.lat], zoom: m.getZoom() })
    }
    const onMoveEndPersist = () => {
      clearTimeout(aoiSaveTimer)
      aoiSaveTimer = setTimeout(persistAoi, 600)
    }

    map.on('style.load', onStyleLoad)
    map.on('error', () => {
      if (styleLocked) return
      if (!map.isStyleLoaded()) tryAdvanceStyle()
    })
    map.on('moveend', onMoveEndPersist)
    map.on('mousedown', stopSpin)
    map.on('dragstart', stopSpin)
    map.on('wheel', stopSpin)
    map.on('touchstart', stopSpin)

    let fsResizeTimer = null
    const onFullscreenChange = () => {
      requestAnimationFrame(() => mapRef.current?.resize())
      clearTimeout(fsResizeTimer)
      fsResizeTimer = setTimeout(() => mapRef.current?.resize(), 300)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    // Keep the MapLibre canvas in sync with its container box so the globe stays centered.
    // Fullscreen enter/exit on a shared node, grid reflow, panel resize, and the initial
    // layout settle all change the box, and resize() re-centers. rAF-debounced.
    let roRaf = null
    const ro = new ResizeObserver(() => {
      if (roRaf) cancelAnimationFrame(roRaf)
      roRaf = requestAnimationFrame(() => mapRef.current?.resize())
    })
    ro.observe(container)

    scheduleWatchdog()

    fetch(COUNTRIES_GEO_URL)
      .then((res) => {
        if (!res.ok) throw new Error('countries geo unavailable')
        return res.json()
      })
      .then((data) => {
        countriesGeoRef.current = data
        countryBBoxesRef.current = data.features?.map((f) => bboxOfGeometry(f.geometry)) || []
      })
      .catch(() => {})

    return () => {
      stopSpin()
      themeObserver.disconnect()
      popup?.remove()
      openAircraftRef.current = null
      focusFeatureRef.current = null
      cancelAnimationFrame(rafRef.current)
      cancelAnimationFrame(hoverRAFRef.current)
      clearTimeout(idleTimerRef.current)
      clearTimeout(aoiSaveTimer)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      clearTimeout(fsResizeTimer)
      ro.disconnect()
      if (roRaf) cancelAnimationFrame(roRaf)
      clearWatchdog()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!homeNonce) return
    const m = mapRef.current
    if (!m) return
    stopSpin()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    m.easeTo({ center: DEFAULT_VIEW.center, zoom: DEFAULT_VIEW.zoom, duration: reduced ? 0 : 600 })
    if (reduced) return
    const startTimer = setTimeout(() => {
      // Persist home explicitly (the debounced moveend save is suppressed once spinning), then spin.
      onAoiChangeRef.current?.({ center: [DEFAULT_VIEW.center[0], DEFAULT_VIEW.center[1]], zoom: DEFAULT_VIEW.zoom })
      startSpin()
    }, 650)
    return () => clearTimeout(startTimer)
  }, [homeNonce])

  return (
    <div
      ref={wrapRef}
      className="atlas-world-globe-wrap"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', minHeight: 0 }}
      />
      <div
        ref={countryReadoutRef}
        className="atlas-country-readout"
        aria-hidden="true"
      />
    </div>
  )
})

export default AtlasWorldGlobe
