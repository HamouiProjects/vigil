import { useState, useEffect, useCallback } from 'react'
import Widget from './Widget'

const REFRESH_MS = 10 * 60_000

const DEFAULT_LAT  = 52.52
const DEFAULT_LON  = 13.41
const DEFAULT_CITY = 'Berlin'

const OPEN_METEO_URL = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${lat}&longitude=${lon}` +
  `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,relative_humidity_2m,surface_pressure` +
  `&wind_speed_unit=kmh`

// WMO Weather interpretation codes → label + icon
function decodeWmo(code) {
  if (code === 0)              return { label: 'Clear Sky',        icon: '☀️' }
  if (code <= 2)               return { label: 'Partly Cloudy',    icon: '🌤' }
  if (code === 3)              return { label: 'Overcast',          icon: '☁️' }
  if (code <= 48)              return { label: 'Fog',               icon: '🌫' }
  if (code <= 55)              return { label: 'Drizzle',           icon: '🌦' }
  if (code <= 65)              return { label: 'Rain',              icon: '🌧' }
  if (code <= 77)              return { label: 'Snow',              icon: '🌨' }
  if (code <= 82)              return { label: 'Rain Showers',      icon: '🌧' }
  if (code <= 86)              return { label: 'Snow Showers',      icon: '🌨' }
  if (code <= 99)              return { label: 'Thunderstorm',      icon: '⛈' }
  return { label: 'Unknown', icon: '🌡' }
}

function windDir(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW']
  return dirs[Math.round(deg / 45) % 8]
}

export default function Weather() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch_ = useCallback(async () => {
    try {
      const res  = await fetch(OPEN_METEO_URL(DEFAULT_LAT, DEFAULT_LON))
      const json = await res.json()
      setData(json.current)
      setError(null)
    } catch {
      setError('Open-Meteo unreachable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
    const id = setInterval(fetch_, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetch_])

  const wmo = data ? decodeWmo(data.weather_code) : null

  return (
    <Widget
      title={`Weather · ${DEFAULT_CITY}`}
      icon="🌦"
      badge={loading ? 'LOADING…' : error ? 'ERROR' : 'LIVE'}
      badgeActive={!error && !loading}
      onRefresh={fetch_}
    >
      {error ? (
        <div className="feed-error">{error}</div>
      ) : loading || !data ? (
        <div className="feed-loading">Fetching weather…</div>
      ) : (
        <div className="weather-body">
          <div className="weather-main">
            <span className="weather-wmo-icon">{wmo.icon}</span>
            <span className="weather-temp">{Math.round(data.temperature_2m)}°C</span>
            <span className="weather-desc">{wmo.label}</span>
          </div>
          <div className="weather-stats">
            {[
              { label: 'Wind',     val: `${Math.round(data.wind_speed_10m)} km/h ${windDir(data.wind_direction_10m)}` },
              { label: 'Humidity', val: `${data.relative_humidity_2m}%` },
              { label: 'Pressure', val: `${Math.round(data.surface_pressure)} hPa` },
            ].map(s => (
              <div key={s.label} className="weather-stat">
                <span>{s.label}</span>
                <span className="weather-stat-val">{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Widget>
  )
}
