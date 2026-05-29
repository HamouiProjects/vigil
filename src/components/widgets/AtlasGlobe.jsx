import Globe from 'react-globe.gl'
import { useRef, useState, useEffect, useCallback } from 'react'
import { CONFLICTS } from '../../constants/atlasData'

const COUNTRY_NAME_TO_ISO = {
  'Palestine': 'PS', 'Ukraine': 'UA', 'Sudan': 'SD', 'Mozambique': 'MZ',
  'Mali': 'ML', 'Myanmar': 'MM', 'DRC': 'CD', 'Syria': 'SY', 'Yemen': 'YE',
  'Ethiopia': 'ET', 'Nigeria': 'NG', 'Afghanistan': 'AF', 'Pakistan': 'PK',
  'India': 'IN', 'Azerbaijan': 'AZ', 'Philippines': 'PH',
}

export default function AtlasGlobe({ workspacePaused }) {
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
  const [tensionISOs,      setTensionISOs]      = useState(new Set())

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
    const tension = new Set()
    CONFLICTS.forEach(c => {
      const iso = COUNTRY_NAME_TO_ISO[c.country]
      if (!iso) return
      if (c.status === 'ongoing') high.add(iso)
      else if (c.status === 'alert') tension.add(iso)
    })
    setHighConflictISOs(high)
    setTensionISOs(tension)
  }, [])

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

  // Region (conflict dot) click handler
  const handlePointClick = useCallback((d) => {
    if (!d || !globeRef.current) return
    stopRotation()
    setSelectedCountry(null)
    setSelectedRegion(null)
    const { lat, lng } = d
    const currentPov = globeRef.current.pointOfView()
    const currentAlt = currentPov.altitude || 0.6
    if (currentAlt < 1.2) {
      globeRef.current.pointOfView({ lat: currentPov.lat, lng: currentPov.lng, altitude: 1.8 }, 600)
      setTimeout(() => {
        globeRef.current.pointOfView({ lat, lng, altitude: 1.8 }, 900)
        setTimeout(() => {
          globeRef.current.pointOfView({ lat, lng, altitude: 0.6 }, 700)
          setTimeout(() => setSelectedRegion(d), 500)
        }, 950)
      }, 620)
    } else {
      globeRef.current.pointOfView({ lat, lng, altitude: 0.6 }, 1200)
      setTimeout(() => setSelectedRegion(d), 900)
    }
  }, [stopRotation])

  // Flag URL helper
  const flagUrl = (iso) => {
    if (!iso || iso === '-99') return null
    return `https://hatscripts.github.io/circle-flags/flags/${iso.toLowerCase()}.svg`
  }

  const polyColor = useCallback((d) => {
    if (hoveredCountry === d) return 'rgba(255,255,255,0.10)'
    if (!d?.properties) return 'rgba(0,0,0,0)'
    const iso = d.properties.ISO_A2
    if (highConflictISOs.has(iso)) return 'rgba(248,81,73,0.08)'
    if (tensionISOs.has(iso)) return 'rgba(210,153,34,0.06)'
    return 'rgba(0,0,0,0)'
  }, [hoveredCountry, highConflictISOs, tensionISOs])

  const polyAltitude = useCallback((d) => hoveredCountry === d ? 0.010 : 0.006, [hoveredCountry])

  const polySideColor = useCallback((d) => {
    if (hoveredCountry === d) return 'rgba(255,255,255,0.70)'
    if (!d?.properties) return 'rgba(255,255,255,0.10)'
    const iso = d.properties.ISO_A2
    if (highConflictISOs.has(iso)) return 'rgba(248,81,73,0.55)'
    if (tensionISOs.has(iso)) return 'rgba(210,153,34,0.50)'
    return 'rgba(255,255,255,0.10)'
  }, [hoveredCountry, highConflictISOs, tensionISOs])

  // Selected country data
  const selIso      = selectedCountry?.properties?.ISO_A2
  const selConflict = selIso ? CONFLICTS.find(c => COUNTRY_NAME_TO_ISO[c.country] === selIso) : null

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', background: '#0A0C10', overflow: 'hidden' }}>

      {workspacePaused && (
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
        enablePointerInteraction={!workspacePaused}

        polygonsData={countries}
        polygonCapColor={polyColor}
        polygonAltitude={polyAltitude}
        polygonSideColor={polySideColor}
        polygonStrokeColor={() => 'rgba(0,0,0,0)'}
        polygonLabel={() => null}
        polygonsTransitionDuration={300}
        polygonCapCurvatureResolution={3}
        onPolygonHover={d => setHoveredCountry(d || null)}
        onPolygonClick={d => { setSelectedRegion(null); d && handleCountryClick(d) }}

        pointsData={CONFLICTS.filter(d => d.status !== 'past')}
        pointLat={d => d.lat}
        pointLng={d => d.lng}
        pointColor={d => d.status === 'ongoing' ? '#F85149' : d.status === 'alert' ? '#D29922' : 'rgba(139,148,158,0.4)'}
        pointAltitude={0.01}
        pointRadius={0.35}
        pointLabel={d => `${d.name} — ${d.country}`}
        pointResolution={12}
        onPointClick={handlePointClick}

        ringsData={CONFLICTS.filter(d => d.status === 'ongoing')}
        ringLat={d => d.lat}
        ringLng={d => d.lng}
        ringColor={() => t => `rgba(248,81,73,${Math.max(0, 1 - t) * 0.5})`}
        ringAltitude={0.01}
        ringMaxRadius={2}
        ringPropagationSpeed={1}
        ringRepeatPeriod={2000}
        ringResolution={64}

        labelsData={hoveredCountry && !selectedCountry ? [hoveredCountry] : []}
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
          {selConflict?.status === 'ongoing' && <div style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', background: 'rgba(248,81,73,0.12)', color: '#F85149', fontSize: 10, letterSpacing: '1.5px' }}>Active conflict</div>}
          {selConflict?.status === 'alert'   && <div style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', background: 'rgba(210,153,34,0.12)', color: '#D29922', fontSize: 10, letterSpacing: '1.5px' }}>Elevated tension</div>}
          {selConflict?.status === 'past'    && <div style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', background: 'rgba(139,148,158,0.12)', color: '#8B949E', fontSize: 10, letterSpacing: '1.5px' }}>Resolved</div>}

          {/* Signal redirect */}
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
      {/* Region popup (conflict dot click) */}
      {selectedRegion && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(13,17,23,0.92)', border: '1px solid #1E2329', boxShadow: '0 0 0 1px rgba(0,212,255,0.08), 0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', width: 300, padding: 16, fontFamily: 'JetBrains Mono' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {flagUrl(COUNTRY_NAME_TO_ISO[selectedRegion.country]) && (
              <img src={flagUrl(COUNTRY_NAME_TO_ISO[selectedRegion.country])} width={22} height={22} style={{ borderRadius: '50%', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#E6EDF3', letterSpacing: '0.3px' }}>{selectedRegion.name}</div>
              <div style={{ fontSize: 11, color: '#8B949E', marginTop: 1 }}>{selectedRegion.country}</div>
            </div>
            <button onClick={() => setSelectedRegion(null)} style={{ background: 'none', border: 'none', color: '#484F58', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
          </div>
          {selectedRegion.status === 'ongoing' && <div style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', background: 'rgba(248,81,73,0.12)', color: '#F85149', fontSize: 10, letterSpacing: '1.5px' }}>Active conflict</div>}
          {selectedRegion.status === 'alert'   && <div style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', background: 'rgba(210,153,34,0.12)', color: '#D29922', fontSize: 10, letterSpacing: '1.5px' }}>Elevated tension</div>}
          {selectedRegion.status === 'past'    && <div style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', background: 'rgba(139,148,158,0.12)', color: '#8B949E', fontSize: 10, letterSpacing: '1.5px' }}>Resolved</div>}
          <div
            onClick={() => window.dispatchEvent(new CustomEvent('vigil:search', { detail: { keyword: selectedRegion.name } }))}
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
