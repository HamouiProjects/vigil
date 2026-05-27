import { useState, useEffect, useRef } from 'react'
import WHeader from '../shared/WHeader'
import usePageVisibility from '../../hooks/usePageVisibility'
import { SkeletonLine } from '../shared/SkeletonLoader'

const NOM_URL = q =>
  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
const WX_URL  = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,weather_code,relative_humidity_2m` +
  `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
  `&wind_speed_unit=kmh&timezone=auto`

function decodeWmo(code) {
  if (code === 0)  return { label: 'Clear Sky',     icon: '☀️'  }
  if (code <= 2)   return { label: 'Partly Cloudy', icon: '⛅'  }
  if (code === 3)  return { label: 'Overcast',      icon: '☁️'  }
  if (code <= 48)  return { label: 'Fog',           icon: '🌫️' }
  if (code <= 67)  return { label: 'Rain',          icon: '🌧️' }
  if (code <= 77)  return { label: 'Snow',          icon: '❄️'  }
  if (code <= 82)  return { label: 'Rain Showers',  icon: '🌦️' }
  if (code <= 86)  return { label: 'Snow Showers',  icon: '❄️'  }
  if (code <= 99)  return { label: 'Thunderstorm',  icon: '⛈️'  }
  return           { label: 'Unknown',              icon: '🌡️' }
}

const WX_DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export default function Weather({ widgetId, initialCity = 'Berlin', onCityChange, onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const locKey = `vigil_weather_loc_${widgetId ?? 'default'}`

  const [latLon,    setLatLon]    = useState(() => {
    try { const r = localStorage.getItem(locKey); return r ? JSON.parse(r) : null } catch { return null }
  })
  const [city,      setCity]      = useState(initialCity)
  const [cityInput, setCityInput] = useState(initialCity)
  const [locName,   setLocName]   = useState(() => {
    try { const r = localStorage.getItem(locKey); return r ? (JSON.parse(r).name || initialCity) : initialCity } catch { return initialCity }
  })
  const [data,       setData]       = useState(null)
  const [daily,      setDaily]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [fetchKey,   setFetchKey]   = useState(0)
  const [isLive,     setIsLive]     = useState(true)
  const bodyRef                     = useRef(null)
  const [bodyH,      setBodyH]      = useState(999)
  const isVisibleWx = usePageVisibility()

  useEffect(() => {
    if (!bodyRef.current) return
    const ro = new ResizeObserver(([e]) => setBodyH(e.contentRect.height))
    ro.observe(bodyRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!latLon) { setCity(initialCity); setCityInput(initialCity); setLocName(initialCity) }
  }, [initialCity])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onLocation(e) {
      const { name, lat, lon } = e.detail ?? {}
      if (typeof lat !== 'number' || typeof lon !== 'number') return
      const loc = { lat, lon, name: name || '' }
      setLatLon(loc); setLocName(name || '')
      try { localStorage.setItem(locKey, JSON.stringify(loc)) } catch {}
    }
    window.addEventListener('vigil:location', onLocation)
    return () => window.removeEventListener('vigil:location', onLocation)
  }, [locKey])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true); setError(null)
      try {
        let lat, lon, name
        if (latLon) {
          lat = latLon.lat; lon = latLon.lon; name = latLon.name
        } else {
          const json = await fetch(NOM_URL(city), {
            headers: { 'User-Agent': 'Vigil/1.0' },
            signal: AbortSignal.timeout(8000),
          }).then(r => r.json())
          const loc = json[0]
          if (!loc) throw new Error(`"${city}" not found`)
          lat = parseFloat(loc.lat); lon = parseFloat(loc.lon)
          name = loc.display_name.split(',')[0].trim()
          const saved = { lat, lon, name }
          setLatLon(saved)
          try { localStorage.setItem(locKey, JSON.stringify(saved)) } catch {}
        }
        if (cancelled) return
        setLocName(name)
        const wx = await fetch(WX_URL(lat, lon), { signal: AbortSignal.timeout(8000) }).then(r => r.json())
        if (cancelled) return
        setData(wx.current)
        setDaily(wx.daily ?? null)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Fetch failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    const id = setInterval(() => { if (!document.hidden) run() }, 10 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [city, latLon, locKey, fetchKey])

  useEffect(() => {
    if (isVisibleWx) setFetchKey(k => k + 1)
  }, [isVisibleWx])

  function handleCitySubmit(e) {
    e.preventDefault()
    const c = cityInput.trim()
    if (!c) return
    try { localStorage.removeItem(locKey) } catch {}
    setLatLon(null); setCity(c); onCityChange?.(c)
  }

  const wmo         = data ? decodeWmo(data.weather_code) : null
  const todayHi     = daily?.temperature_2m_max?.[0]
  const todayLo     = daily?.temperature_2m_min?.[0]
  const showForecast = bodyH >= 220 && daily?.time?.length > 0
  const fcastDays   = (daily?.time ?? []).slice(0, 5).map((dateStr, i) => ({
    day: WX_DAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()],
    wmo: decodeWmo(daily.weather_code[i]),
    max: Math.round(daily.temperature_2m_max[i]),
    min: Math.round(daily.temperature_2m_min[i]),
  }))

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title={`WEATHER · ${locName.toUpperCase()}`} isLive={isLive} workspacePaused={workspacePaused} onToggleLive={() => setIsLive(v => !v)} onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />

      <form className="wx-search-bar" onSubmit={handleCitySubmit} onPointerDownCapture={e => e.stopPropagation()}>
        <input
          className="wx-search-input"
          value={cityInput}
          onChange={e => setCityInput(e.target.value)}
          placeholder="City or country..."
          spellCheck={false}
        />
        <button className="wx-search-btn" type="submit">🔍</button>
      </form>

      <div className="widget-body" ref={bodyRef}>
        {error ? (
          <div className="widget-error">
            <span className="widget-error-icon">⚠</span>
            {error}
            <button className="widget-error-retry" onClick={() => { setError(null); setFetchKey(k => k + 1) }}>Retry</button>
          </div>
        ) : loading || !data ? (
          <div className="skel-block" style={{ width: '100%' }}>
            <SkeletonLine w="60%" h={40} />
            <SkeletonLine w="40%" h={12} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[55, 42, 60, 48].map((w, i) => <SkeletonLine key={i} w={`${w}%`} h={10} />)}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {[1,2,3,4,5].map(i => <SkeletonLine key={i} w="18%" h={56} />)}
            </div>
          </div>
        ) : (
          <div className="wx-body">
            <div className="wx-main">
              <div className="wx-icon-temp">
                <span className="wx-icon">{wmo.icon}</span>
                <span className="wx-temp">{Math.round(data.temperature_2m)}°C</span>
              </div>
              <div className="wx-condition">{wmo.label}</div>
              <div className="wx-stats-row">
                {todayHi != null && (
                  <span className="wx-stat-item">↑{Math.round(todayHi)}° ↓{Math.round(todayLo)}°</span>
                )}
                <span className="wx-stat-item">💧 {data.relative_humidity_2m}%</span>
                <span className="wx-stat-item">💨 {Math.round(data.wind_speed_10m)} km/h</span>
                <span className="wx-stat-item">🌡️ {Math.round(data.apparent_temperature)}°C</span>
              </div>
            </div>
            {showForecast && (
              <div className="wx-forecast">
                {fcastDays.map(d => (
                  <div key={d.day} className="wx-fcast-card">
                    <span className="wx-fcast-day">{d.day}</span>
                    <span className="wx-fcast-icon">{d.wmo.icon}</span>
                    <span className="wx-fcast-hi">{d.max}°</span>
                    <span className="wx-fcast-lo">{d.min}°</span>
                  </div>
                ))}
              </div>
            )}
            <div className="attr-line">via Open-Meteo · Nominatim</div>
          </div>
        )}
      </div>
    </div>
  )
}
