import Globe from 'react-globe.gl'
import { useRef, useState, useEffect, useCallback } from 'react'
import { CONFLICTS } from '../../constants/atlasData'

// Conflict countries by ISO_A2 — verified against Natural Earth 110m GeoJSON
const HIGH_CONFLICT_ISO = new Set([
  'UA','SD','PS','IL','SY','YE','AF','MM','SO','NG',
  'ET','CD','IQ','LY','ML','BF','SS','HT','PK','MZ'
])

const LOW_CONFLICT_ISO = new Set([
  'IR','LB','VE','CO','MX','NE','RU'
])

export default function AtlasGlobe({ workspacePaused }) {
  const globeRef = useRef()
  const containerRef = useRef()
  const rotateTimerRef = useRef()
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 })
  const [countries, setCountries] = useState([])
  const [gdeltPoints, setGdeltPoints] = useState([])
  const [hoveredPolygon, setHoveredPolygon] = useState(null)
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [signalHover, setSignalHover] = useState(false)

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

  // Fetch GDELT live events
  useEffect(() => {
    if (workspacePaused) return
    fetch('/api/gdelt-events')
      .then(r => r.json())
      .then(data => {
        const features = data?.features || []
        const points = features
          .filter(f => f?.geometry?.coordinates?.length === 2)
          .map(f => ({
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            severity: Math.abs(f.properties?.GoldsteinScale || 3)
          }))
          .filter(p => p.severity >= 3)
        setGdeltPoints(points)
      })
      .catch(() => setGdeltPoints([]))
  }, [workspacePaused])

  // Auto-rotate setup
  useEffect(() => {
    if (!globeRef.current || workspacePaused) return
    const timer = setTimeout(() => {
      if (!globeRef.current) return
      const ctrl = globeRef.current.controls()
      ctrl.autoRotate = true
      ctrl.autoRotateSpeed = 0.15
      ctrl.enableDamping = true
      ctrl.dampingFactor = 0.1
    }, 400)
    return () => clearTimeout(timer)
  }, [countries.length, workspacePaused]) // re-run once countries load

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
  }, [countries.length, stopRotation]) // re-attach once canvas exists

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

    // If already zoomed in, do cinematic: pull back → fly → zoom in
    if (currentAlt < 1.2) {
      // Step 1: zoom out
      globeRef.current.pointOfView({ lat: currentPov.lat, lng: currentPov.lng, altitude: 1.8 }, 600)
      // Step 2: after zoom out, fly to new country
      setTimeout(() => {
        globeRef.current.pointOfView({ lat, lng, altitude: 1.8 }, 900)
        // Step 3: after arriving, zoom in
        setTimeout(() => {
          globeRef.current.pointOfView({ lat, lng, altitude: 0.6 }, 700)
          setTimeout(() => setSelectedCountry(d), 500)
        }, 950)
      }, 620)
    } else {
      // Already zoomed out — just fly in directly
      globeRef.current.pointOfView({ lat, lng, altitude: 0.6 }, 1200)
      setTimeout(() => setSelectedCountry(d), 900)
    }
  }, [stopRotation])

  // Flag URL helper
  const flagUrl = (iso) => {
    if (!iso || iso === '-99') return null
    return `https://hatscripts.github.io/circle-flags/flags/${iso.toLowerCase()}.svg`
  }

  // Polygon color
  const polyColor = useCallback((d) => {
    if (!d?.properties) return 'rgba(14,18,24,0.45)'
    const iso = d.properties.ISO_A2
    if (selectedCountry === d) return 'rgba(230,237,243,0.25)'
    if (hoveredPolygon === d) return 'rgba(230,237,243,0.18)'
    if (HIGH_CONFLICT_ISO.has(iso)) return 'rgba(248,81,73,0.55)'
    if (LOW_CONFLICT_ISO.has(iso)) return 'rgba(210,153,34,0.38)'
    return 'rgba(14,18,24,0.45)'
  }, [selectedCountry, hoveredPolygon])

  const polyAltitude = useCallback((d) => {
    if (!d?.properties) return 0.01
    const iso = d.properties.ISO_A2
    if (selectedCountry === d) return 0.08
    if (hoveredPolygon === d) return 0.05
    if (HIGH_CONFLICT_ISO.has(iso)) return 0.02
    return 0.01
  }, [selectedCountry, hoveredPolygon])

  const polyStroke = useCallback((d) => {
    if (!d?.properties) return 'rgba(40,48,58,0.6)'
    if (HIGH_CONFLICT_ISO.has(d.properties.ISO_A2)) return 'rgba(248,81,73,0.4)'
    return 'rgba(40,48,58,0.6)'
  }, [])

  // Selected country data
  const selIso = selectedCountry?.properties?.ISO_A2
  const isHighConflict = HIGH_CONFLICT_ISO.has(selIso)
  const isLowConflict = LOW_CONFLICT_ISO.has(selIso)

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', background: '#0A0C10', overflow: 'hidden' }}>

      {workspacePaused && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,12,16,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, fontSize: 28, color: '#484F58' }}>⏸</div>
      )}

      {/* Hover country name tooltip */}
      {hoveredPolygon && !selectedCountry && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.85)', border: '1px solid #1E2329', padding: '3px 12px', fontFamily: 'JetBrains Mono', fontSize: 11, color: '#E6EDF3', letterSpacing: '1.5px', textTransform: 'uppercase', pointerEvents: 'none', zIndex: 100, whiteSpace: 'nowrap' }}>
          {hoveredPolygon.properties?.NAME}
        </div>
      )}

      <Globe
        ref={globeRef}
        width={dimensions.w}
        height={dimensions.h}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundColor="rgba(0,0,0,0)"
        backgroundImageUrl={null}
        atmosphereColor="#0a3d55"
        atmosphereAltitude={0.25}
        showAtmosphere={true}
        enablePointerInteraction={!workspacePaused}

        polygonsData={countries}
        polygonCapColor={polyColor}
        polygonAltitude={polyAltitude}
        polygonSideColor={() => 'rgba(0,212,255,0.03)'}
        polygonStrokeColor={polyStroke}
        polygonLabel={() => null}
        polygonsTransitionDuration={300}
        polygonCapCurvatureResolution={3}
        onPolygonHover={d => setHoveredPolygon(d || null)}
        onPolygonClick={d => d && handleCountryClick(d)}

        pointsData={gdeltPoints}
        pointLat="lat"
        pointLng="lng"
        pointColor={d => d.severity > 7 ? '#F85149' : d.severity > 4 ? '#D29922' : 'rgba(139,148,158,0.5)'}
        pointAltitude={0.02}
        pointRadius={d => 0.3 + (d.severity / 10) * 0.4}
        pointsMerge={false}

        labelsData={hoveredPolygon && !selectedCountry ? [hoveredPolygon] : []}
        labelLat={d => d.properties.LABEL_Y || 0}
        labelLng={d => d.properties.LABEL_X || 0}
        labelText={d => d.properties.NAME || ''}
        labelColor={() => '#E6EDF3'}
        labelSize={0.9}
        labelAltitude={0.07}
        labelIncludeDot={false}
        labelResolution={2}
      />

      {/* Country popup */}
      {selectedCountry && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(13,17,23,0.92)', border: '1px solid #1E2329', boxShadow: '0 0 0 1px rgba(0,212,255,0.08), 0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', width: 300, padding: 16, fontFamily: 'JetBrains Mono' }}
        >
          {/* Header */}
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

          {/* Conflict tag */}
          {(isHighConflict || isLowConflict) && (
            <div style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', background: isHighConflict ? 'rgba(248,81,73,0.12)' : 'rgba(210,153,34,0.12)', color: isHighConflict ? '#F85149' : '#D29922', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              {isHighConflict ? 'ACTIVE CONFLICT' : 'TENSION'}
            </div>
          )}

          {/* Signal redirect */}
          <div style={{ borderTop: '1px solid #1E2329', marginTop: 12, paddingTop: 10, color: signalHover ? '#00D4FF' : 'rgba(0,212,255,0.5)', fontSize: 10, letterSpacing: '1px', cursor: 'default', transition: 'color 0.15s' }}
            onMouseEnter={() => setSignalHover(true)}
            onMouseLeave={() => setSignalHover(false)}
          >
            USE NEWS SEARCH FOR LATEST SIGNALS →
          </div>
        </div>
      )}
    </div>
  )
}
