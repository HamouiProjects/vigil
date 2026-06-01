import Globe from 'react-globe.gl'
import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { CONFLICTS, WILDFIRES_STATIC, PIRACY_ZONES } from '../constants/atlasData'
import { usePolling } from '../hooks/usePolling'

const COUNTRY_NAME_TO_ISO = {
  'Palestine': 'PS', 'Ukraine': 'UA', 'Sudan': 'SD', 'Mozambique': 'MZ',
  'Mali': 'ML', 'Myanmar': 'MM', 'DRC': 'CD', 'Syria': 'SY', 'Yemen': 'YE',
  'Ethiopia': 'ET', 'Nigeria': 'NG', 'Afghanistan': 'AF', 'Pakistan': 'PK',
  'India': 'IN', 'Azerbaijan': 'AZ', 'Philippines': 'PH',
}

const DEFAULT_LAYERS = { conflict: true, wildfires: false, earthquakes: false, storms: false, piracy: false }

const boundsToGeoFeature = (zone) => {
  return {
    type: 'Feature',
    properties: { _piracy: true, name: zone.name },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [zone.bounds[0][1], zone.bounds[0][0]],
        [zone.bounds[0][1], zone.bounds[1][0]],
        [zone.bounds[1][1], zone.bounds[1][0]],
        [zone.bounds[1][1], zone.bounds[0][0]],
        [zone.bounds[0][1], zone.bounds[0][0]],
      ]],
    },
  }
}

const parseNHCCoord = (str) => {
  if (str == null) return 0
  const n = parseFloat(str)
  if (isNaN(n)) return 0
  return (String(str).endsWith('S') || String(str).endsWith('W')) ? -Math.abs(n) : Math.abs(n)
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const formatQuakeTime = (ms) => {
  if (!ms) return ''
  const d = new Date(ms)
  const h = String(d.getUTCHours()).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h}:${m} UTC`
}

export default function AtlasGlobe({ paused, layers = DEFAULT_LAYERS }) {
  const globeRef = useRef()
  const containerRef = useRef()
  const rotateTimerRef = useRef()
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 })
  const [countries, setCountries] = useState([])
  const [hoveredCountry, setHoveredCountry] = useState(null)
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [signalHover,       setSignalHover]       = useState(false)
  const [selectedRegion,    setSelectedRegion]    = useState(null)
  const [regionSignalHover, setRegionSignalHover] = useState(false)
  const [highConflictISOs, setHighConflictISOs] = useState(new Set())
  const [earthquakePoints, setEarthquakePoints] = useState([])
  const [stormPoints, setStormPoints] = useState([])

  // Inject wildfire pulse keyframe once on mount
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = '@keyframes wf-pulse { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(2.0); opacity: 0; } }'
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const e = entries[0]
      if (e) setDimensions({ w: e.contentRect.width, h: e.contentRect.height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Fetch country polygons
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(r => r.json())
      .then(d => setCountries(d.features.filter(f => f.properties.ISO_A2 !== 'AQ')))
      .catch(() => {})
  }, [])

  // Compute conflict tiers from static CONFLICTS data
  useEffect(() => {
    const high = new Set()
    CONFLICTS.forEach(c => {
      const iso = COUNTRY_NAME_TO_ISO[c.country]
      if (!iso) return
      if (c.status === 'ongoing') high.add(iso)
    })
    setHighConflictISOs(high)
  }, [])

  // Fetch earthquakes every 5 minutes — usePolling also gates on globalLive
  usePolling(() => {
    fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson')
      .then(r => r.json())
      .then(d => {
        setEarthquakePoints((d.features || []).map(f => ({
          _type: 'earthquake',
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          depth: f.geometry.coordinates[2],
          magnitude: f.properties.mag,
          name: f.properties.title,
          place: f.properties.place,
          time: f.properties.time,
        })))
      })
      .catch(() => {})
  }, 5 * 60 * 1000, { isLive: !paused && layers.earthquakes })

  // Fetch storms every 10 minutes — usePolling also gates on globalLive
  usePolling(() => {
    fetch('https://www.nhc.noaa.gov/CurrentStorms.json')
      .then(r => r.json())
      .then(d => {
        setStormPoints((d.activeStorms || []).map(s => ({
          _type: 'storm',
          lat: s.latitudeNumeric ?? parseNHCCoord(s.latitude),
          lng: s.longitudeNumeric ?? parseNHCCoord(s.longitude),
          name: s.name,
          category: s.classification,
        })))
      })
      .catch(() => {})
  }, 10 * 60 * 1000, { isLive: !paused && layers.storms })

  // Auto-rotate setup
  useEffect(() => {
    if (!globeRef.current || paused) return
    const timer = setTimeout(() => {
      if (!globeRef.current) return
      const ctrl = globeRef.current.controls()
      ctrl.autoRotate = true
      ctrl.autoRotateSpeed = 0.15
      ctrl.enableDamping = true
      ctrl.dampingFactor = 0.1
    }, 400)
    return () => clearTimeout(timer)
  }, [countries.length, paused])

  // Stop rotation on interaction
  const stopRotation = useCallback(() => {
    if (!globeRef.current) return
    globeRef.current.controls().autoRotate = false
    clearTimeout(rotateTimerRef.current)
  }, [])

  // Attach interaction listeners to canvas
  useEffect(() => {
    if (!containerRef.current) return
    const canvas = containerRef.current.querySelector('canvas')
    if (!canvas) return
    canvas.addEventListener('mousedown', stopRotation)
    canvas.addEventListener('touchstart', stopRotation)
    return () => {
      canvas.removeEventListener('mousedown', stopRotation)
      canvas.removeEventListener('touchstart', stopRotation)
    }
  }, [countries.length, stopRotation])

  // Country click handler
  const handleCountryClick = useCallback((d) => {
    if (!d || !globeRef.current) return
    stopRotation()
    globeRef.current.controls().enableDamping = false

    let lat = d.properties.LABEL_Y
    let lng = d.properties.LABEL_X
    if (!lat || !lng) {
      try {
        const coords = d.geometry.type === 'Polygon'
          ? d.geometry.coordinates[0]
          : d.geometry.coordinates[0][0]
        const lngs = coords.map(c => c[0])
        const lats = coords.map(c => c[1])
        lng = (Math.min(...lngs) + Math.max(...lngs)) / 2
        lat = (Math.min(...lats) + Math.max(...lats)) / 2
      } catch { lat = 0; lng = 0 }
    }

    setSelectedCountry(null)
    const currentPov = globeRef.current.pointOfView()
    const currentAlt = currentPov.altitude || 0.6

    if (currentAlt < 1.2) {
      globeRef.current.pointOfView({ lat: currentPov.lat, lng: currentPov.lng, altitude: 1.2 }, 900)
      setTimeout(() => {
        globeRef.current.pointOfView({ lat, lng, altitude: 1.2 }, 1350)
        setTimeout(() => {
          globeRef.current.pointOfView({ lat, lng, altitude: 0.6 }, 1050)
          setTimeout(() => setSelectedCountry(d), 750)
        }, 1425)
      }, 930)
    } else {
      globeRef.current.pointOfView({ lat, lng, altitude: 0.6 }, 1200)
      setTimeout(() => setSelectedCountry(d), 900)
    }
  }, [stopRotation])

  // Region click handler — conflict dots and earthquake dots
  const handlePointClick = useCallback((d) => {
    if (!d || !globeRef.current) return
    stopRotation()
    setSelectedCountry(null)
    setSelectedRegion(null)
    const { lat, lng } = d
    const finalData = d._type === 'earthquake'
      ? { ...d, _layerType: 'earthquake' }
      : { ...d, _layerType: 'conflict' }
    const currentPov = globeRef.current.pointOfView()
    const currentAlt = currentPov.altitude || 0.6
    if (currentAlt < 1.2) {
      globeRef.current.pointOfView({ lat: currentPov.lat, lng: currentPov.lng, altitude: 1.2 }, 900)
      setTimeout(() => {
        globeRef.current.pointOfView({ lat, lng, altitude: 1.2 }, 1350)
        setTimeout(() => {
          globeRef.current.pointOfView({ lat, lng, altitude: 0.6 }, 1050)
          setTimeout(() => setSelectedRegion(finalData), 750)
        }, 1425)
      }, 930)
    } else {
      globeRef.current.pointOfView({ lat, lng, altitude: 0.6 }, 1200)
      setTimeout(() => setSelectedRegion(finalData), 900)
    }
  }, [stopRotation])

  const flagUrl = (iso) => {
    if (!iso || iso === '-99') return null
    return `https://hatscripts.github.io/circle-flags/flags/${iso.toLowerCase()}.svg`
  }

  // Combined points: conflict + earthquakes (wildfires handled via htmlElementsData)
  const combinedPoints = useMemo(() => {
    const base = layers.conflict
      ? CONFLICTS.filter(d => d.status !== 'past').map(d => ({ ...d, _type: 'conflict' }))
      : []
    const quakes = layers.earthquakes ? earthquakePoints : []
    return [...base, ...quakes]
  }, [layers.conflict, layers.earthquakes, earthquakePoints])

  // Combined labels: country hover + storms
  const combinedLabels = useMemo(() => {
    const hover = hoveredCountry && !selectedCountry ? [hoveredCountry] : []
    const storms = layers.storms ? stormPoints : []
    return [...hover, ...storms]
  }, [hoveredCountry, selectedCountry, layers.storms, stormPoints])

  // All polygons: countries + piracy zones
  const allPolygons = useMemo(() => {
    if (!layers.piracy) return countries
    return [...countries, ...PIRACY_ZONES.map(boundsToGeoFeature)]
  }, [countries, layers.piracy])

  // ISOs of countries with wildfire zones (for border colouring)
  const wildfireCountryISOs = useMemo(() => {
    const s = new Set()
    WILDFIRES_STATIC.forEach(f => {
      const iso = COUNTRY_NAME_TO_ISO[f.country]
      if (iso) s.add(iso)
    })
    return s
  }, [])

  const polyColor = useCallback((d) => {
    if (d.properties?._piracy) return 'rgba(30,107,255,0.12)'
    if (hoveredCountry === d) return 'rgba(255,255,255,0.10)'
    return 'rgba(0,0,0,0)'
  }, [hoveredCountry])

  const polyAltitude = useCallback((d) => {
    if (d.properties?._piracy) return 0.005
    return hoveredCountry === d ? 0.010 : 0.006
  }, [hoveredCountry])

  const polySideColor = useCallback((d) => {
    if (d.properties?._piracy) return 'rgba(0,0,0,0)'
    if (hoveredCountry === d) return 'rgba(255,255,255,0.70)'
    const iso = d.properties?.ISO_A2
    if (iso && highConflictISOs.has(iso)) return 'rgba(255,51,51,0.40)'
    if (iso && layers.wildfires && wildfireCountryISOs.has(iso)) return 'rgba(255,215,0,0.35)'
    return 'rgba(0,0,0,0)'
  }, [hoveredCountry, highConflictISOs, layers.wildfires, wildfireCountryISOs])

  const polyStrokeColor = useCallback((d) => {
    if (d.properties?._piracy) return 'rgba(30,107,255,0.65)'
    return 'rgba(0,0,0,0)'
  }, [])

  // Wildfire HTML element factory — receives data point d for onclick
  const wildfireElement = useCallback((d) => {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'position:relative;width:5px;height:5px;cursor:pointer;'
    wrap.onclick = () => {
      setSelectedRegion({ ...d, _layerType: 'wildfire' })
      setSelectedCountry(null)
    }
    const core = document.createElement('div')
    core.style.cssText = 'width:5px;height:5px;border-radius:50%;background:#FFD700;box-shadow:0 0 3px #FFD700;opacity:0.85;'
    const ring = document.createElement('div')
    ring.style.cssText = 'position:absolute;top:-2.5px;left:-2.5px;width:10px;height:10px;border-radius:50%;border:1px solid rgba(255,215,0,0.7);animation:wf-pulse 2s ease-out infinite;'
    wrap.appendChild(core)
    wrap.appendChild(ring)
    return wrap
  }, [setSelectedRegion, setSelectedCountry])

  // Country popup: find enriched layer data (conflict takes priority over wildfire)
  const selIso = selectedCountry?.properties?.ISO_A2
  const selConflict = selIso
    ? (CONFLICTS.find(c => COUNTRY_NAME_TO_ISO[c.country] === selIso && c.status === 'ongoing')
       || CONFLICTS.find(c => COUNTRY_NAME_TO_ISO[c.country] === selIso && c.status === 'alert')
       || CONFLICTS.find(c => COUNTRY_NAME_TO_ISO[c.country] === selIso))
    : null
  const selWildfire = !selConflict && selIso
    ? WILDFIRES_STATIC.find(f => COUNTRY_NAME_TO_ISO[f.country] === selIso)
    : null
  const selectedCountryLayer = selConflict
    ? { ...selConflict, _layerType: 'conflict' }
    : selWildfire
    ? { ...selWildfire, _layerType: 'wildfire' }
    : null

  // ── Shared enriched block renderer ──────────────────────────────────────
  const renderEnrichedBlock = (data) => {
    if (!data) return null
    const lt = data._layerType

    if (lt === 'conflict') return (
      <>
        <div style={{ marginTop: 8 }}>
          {data.status === 'ongoing' && <span style={{ padding: '2px 6px', background: 'rgba(255,51,51,0.15)', color: '#FF3333', fontSize: 10, letterSpacing: '1.2px', borderRadius: 2 }}>ACTIVE</span>}
          {data.status === 'alert'   && <span style={{ padding: '2px 6px', background: 'rgba(210,153,34,0.15)', color: '#D29922', fontSize: 10, letterSpacing: '1.2px', borderRadius: 2 }}>ALERT</span>}
          {data.status === 'past'    && <span style={{ padding: '2px 6px', background: 'rgba(139,148,158,0.15)', color: '#8B949E', fontSize: 10, letterSpacing: '1.2px', borderRadius: 2 }}>RESOLVED</span>}
        </div>
        {data.parties?.length >= 2 && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#8B949E' }}>
            {data.parties[0]} vs {data.parties[1]}
          </div>
        )}
        {data.description && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#8B949E', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {data.description}
          </div>
        )}
        {data.startYear && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#484F58' }}>Since {data.startYear}</div>
        )}
        {data.source && (
          <a href={data.source} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4, fontSize: 10, color: 'rgba(0,212,255,0.45)', textDecoration: 'none', letterSpacing: '0.5px' }}>
            Source: ACLED ↗
          </a>
        )}
      </>
    )

    if (lt === 'wildfire') return (
      <>
        <div style={{ marginTop: 8 }}>
          <span style={{ padding: '2px 6px', background: 'rgba(255,215,0,0.12)', color: '#FFD700', fontSize: 10, letterSpacing: '1.2px', borderRadius: 2 }}>WILDFIRE</span>
        </div>
        {data.description && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#8B949E', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {data.description}
          </div>
        )}
        {data.season && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#484F58' }}>Season: {data.season}</div>
        )}
        {data.source && (
          <a href={data.source} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4, fontSize: 10, color: 'rgba(0,212,255,0.45)', textDecoration: 'none', letterSpacing: '0.5px' }}>
            NASA FIRMS ↗
          </a>
        )}
      </>
    )

    if (lt === 'earthquake') return (
      <>
        <div style={{ marginTop: 8 }}>
          <span style={{ padding: '2px 6px', background: 'rgba(255,140,66,0.15)', color: '#FF8C42', fontSize: 10, letterSpacing: '1.2px', borderRadius: 2 }}>EARTHQUAKE</span>
        </div>
        {(data.magnitude != null || data.depth != null) && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#8B949E' }}>
            {data.magnitude != null ? `M${data.magnitude.toFixed(1)}` : ''}
            {data.magnitude != null && data.depth != null ? ' · ' : ''}
            {data.depth != null ? `Depth ${Math.round(data.depth)} km` : ''}
          </div>
        )}
        {data.time && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#484F58' }}>{formatQuakeTime(data.time)}</div>
        )}
        <a href="https://earthquake.usgs.gov" target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4, fontSize: 10, color: 'rgba(0,212,255,0.45)', textDecoration: 'none', letterSpacing: '0.5px' }}>
          USGS ↗
        </a>
      </>
    )

    return null
  }

  // ── Region popup title/subtitle by layer type ────────────────────────────
  const regionTitle = (d) => {
    if (d._layerType === 'earthquake') return d.place || d.name || ''
    return d.name || ''
  }
  const regionSubtitle = (d) => {
    if (d._layerType === 'earthquake') return null
    return d.country || null
  }
  const regionFlagIso = (d) => {
    if (d._layerType === 'earthquake') return null
    return COUNTRY_NAME_TO_ISO[d.country] || null
  }
  const regionSearchKeyword = (d) => {
    if (d._layerType === 'earthquake') return d.place || d.name || ''
    return d.name || ''
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', background: '#0A0C10', overflow: 'hidden' }}>

      {paused && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,12,16,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, fontSize: 28, color: '#484F58' }}>⏸</div>
      )}

      {/* Hover country name tooltip */}
      {hoveredCountry && !selectedCountry && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.85)', border: '1px solid #1E2329', padding: '3px 12px', fontFamily: 'JetBrains Mono', fontSize: 11, color: '#E6EDF3', letterSpacing: '1.5px', textTransform: 'uppercase', pointerEvents: 'none', zIndex: 100, whiteSpace: 'nowrap' }}>
          {hoveredCountry.properties?.NAME}
        </div>
      )}

      <Globe
        ref={globeRef}
        width={dimensions.w}
        height={dimensions.h}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundColor="#0d1a2e"
        backgroundImageUrl={null}
        atmosphereColor="#4a6fa5"
        atmosphereAltitude={0.18}
        showAtmosphere={true}
        enablePointerInteraction={!paused}

        polygonsData={allPolygons}
        polygonCapColor={polyColor}
        polygonAltitude={polyAltitude}
        polygonSideColor={polySideColor}
        polygonStrokeColor={polyStrokeColor}
        polygonLabel={() => null}
        polygonsTransitionDuration={300}
        polygonCapCurvatureResolution={3}
        onPolygonHover={d => setHoveredCountry(d?.properties?._piracy ? null : (d || null))}
        onPolygonClick={d => { setSelectedRegion(null); d && !d.properties?._piracy && handleCountryClick(d) }}

        pointsData={combinedPoints}
        pointLat={d => d.lat}
        pointLng={d => d.lng}
        pointColor={d => {
          if (d._type === 'earthquake') return '#FF8C42'
          return d.status === 'ongoing' ? '#FF3333' : d.status === 'alert' ? '#D29922' : 'rgba(139,148,158,0.4)'
        }}
        pointAltitude={d => d._type === 'earthquake' ? 0.02 : 0.01}
        pointRadius={d => {
          if (d._type === 'earthquake') return d.magnitude ? Math.max(0.35, d.magnitude * 0.11) : 0.4
          return 0.5
        }}
        pointLabel={d => {
          if (d._type === 'earthquake') return `${d.name} (M${d.magnitude != null ? d.magnitude.toFixed(1) : '?'})`
          return `${d.name} — ${d.country}`
        }}
        pointResolution={12}
        onPointClick={d => { if (d._type === 'conflict' || d._type === 'earthquake') handlePointClick(d) }}

        ringsData={layers.conflict ? CONFLICTS.filter(d => d.status === 'ongoing') : []}
        ringLat={d => d.lat}
        ringLng={d => d.lng}
        ringColor={() => t => `rgba(255,51,51,${Math.max(0, 1 - t) * 0.5})`}
        ringAltitude={0.01}
        ringMaxRadius={2}
        ringPropagationSpeed={1}
        ringRepeatPeriod={2000}
        ringResolution={64}

        htmlElementsData={layers.wildfires ? WILDFIRES_STATIC : []}
        htmlLat={d => d.lat}
        htmlLng={d => d.lng}
        htmlAltitude={0.02}
        htmlElement={wildfireElement}

        labelsData={combinedLabels}
        labelLat={d => d._type === 'storm' ? d.lat : (d.properties?.LABEL_Y || 0)}
        labelLng={d => d._type === 'storm' ? d.lng : (d.properties?.LABEL_X || 0)}
        labelText={d => d._type === 'storm' ? '🌀' : (d.properties?.NAME || '')}
        labelColor={d => d._type === 'storm' ? '#38BDF8' : '#E6EDF3'}
        labelSize={d => d._type === 'storm' ? 1.2 : 0.9}
        labelAltitude={d => d._type === 'storm' ? 0.02 : 0.07}
        labelIncludeDot={false}
        labelResolution={2}
      />

      {/* Country popup */}
      {selectedCountry && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(13,17,23,0.92)', border: '1px solid #1E2329', boxShadow: '0 0 0 1px rgba(0,212,255,0.08), 0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', width: 300, padding: 16, fontFamily: 'JetBrains Mono' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {flagUrl(selIso) && (
              <img src={flagUrl(selIso)} width={22} height={22} style={{ borderRadius: '50%', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
            )}
            <span style={{ fontSize: 15, fontWeight: 600, color: '#E6EDF3', letterSpacing: '0.3px', flex: 1 }}>
              {selectedCountry.properties.NAME}
            </span>
            <button
              onClick={() => setSelectedCountry(null)}
              style={{ background: 'none', border: 'none', color: '#484F58', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}
            >×</button>
          </div>

          {renderEnrichedBlock(selectedCountryLayer)}

          <div
            onClick={() => window.dispatchEvent(new CustomEvent('vigil:search', { detail: { keyword: selectedCountry.properties.NAME } }))}
            style={{ borderTop: '1px solid #1E2329', marginTop: 12, paddingTop: 10, color: signalHover ? '#00D4FF' : 'rgba(0,212,255,0.5)', fontSize: 10, letterSpacing: '1px', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={() => setSignalHover(true)}
            onMouseLeave={() => setSignalHover(false)}
          >
            Use news search for latest signals →
          </div>
        </div>
      )}

      {/* Region popup — conflict / wildfire / earthquake */}
      {selectedRegion && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(13,17,23,0.92)', border: '1px solid #1E2329', boxShadow: '0 0 0 1px rgba(0,212,255,0.08), 0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', width: 300, padding: 16, fontFamily: 'JetBrains Mono' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {regionFlagIso(selectedRegion) && (
              <img src={flagUrl(regionFlagIso(selectedRegion))} width={22} height={22} style={{ borderRadius: '50%', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#E6EDF3', letterSpacing: '0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {regionTitle(selectedRegion)}
              </div>
              {regionSubtitle(selectedRegion) && (
                <div style={{ fontSize: 11, color: '#8B949E', marginTop: 1 }}>{regionSubtitle(selectedRegion)}</div>
              )}
            </div>
            <button onClick={() => setSelectedRegion(null)} style={{ background: 'none', border: 'none', color: '#484F58', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>

          {renderEnrichedBlock(selectedRegion)}

          <div
            onClick={() => window.dispatchEvent(new CustomEvent('vigil:search', { detail: { keyword: regionSearchKeyword(selectedRegion) } }))}
            style={{ borderTop: '1px solid #1E2329', marginTop: 12, paddingTop: 10, color: regionSignalHover ? '#00D4FF' : 'rgba(0,212,255,0.5)', fontSize: 10, letterSpacing: '1px', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={() => setRegionSignalHover(true)}
            onMouseLeave={() => setRegionSignalHover(false)}
          >
            Use news search for latest signals →
          </div>
        </div>
      )}
    </div>
  )
}
