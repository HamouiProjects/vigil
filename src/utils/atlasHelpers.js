import L from 'leaflet'
import { CMAP_STYLE } from '../constants/atlasData'

export function conflictIcon(category) {
  const s = CMAP_STYLE[category] ?? CMAP_STYLE.other
  return L.divIcon({
    html:       `<div class="cmap-dot${s.pulse ? ' cmap-pulse' : ''}" style="width:${s.size}px;height:${s.size}px;background:${s.color}"></div>`,
    className:  '',
    iconSize:   [s.size, s.size],
    iconAnchor: [s.size / 2, s.size / 2],
  })
}

export function wildfireIcon() {
  return L.divIcon({
    html: '<div class="cmap-dot" style="width:8px;height:8px;background:#ff6b35"></div>',
    className: '', iconSize: [8, 8], iconAnchor: [4, 4],
  })
}

export function stormIcon(cls) {
  const size = /HU|TY/.test(cls) ? 14 : 10
  return L.divIcon({
    html: `<div class="cmap-dot" style="width:${size}px;height:${size}px;background:#1abc9c;border:2px solid rgba(255,255,255,0.25)"></div>`,
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  })
}

export function parseNOAACoord(str) {
  const v = parseFloat(str)
  return typeof str === 'string' && (str.endsWith('S') || str.endsWith('W')) ? -v : v
}

export function mapPopupHtml(name, row2) {
  return `<div class="cmap-popup">
    <div class="cmap-popup-name">${name}</div>
    <div class="cmap-popup-row">${row2}</div>
  </div>`
}

export function fireMarkerEvents(keyword, name, country, lat, lon) {
  window.dispatchEvent(new CustomEvent('vigil:search',   { detail: { keyword } }))
  window.dispatchEvent(new CustomEvent('vigil:location', { detail: { name, country: country || '', lat, lon } }))
  window.dispatchEvent(new CustomEvent('vigil:region',   { detail: { country: country || name } }))
}

export const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson'

export function quakeSize(mag) {
  if (mag >= 6) return 14
  if (mag >= 5) return 10
  return 6
}

export function quakeTimeAgo(ms) {
  const diff = Math.floor((Date.now() - ms) / 60000)
  if (diff < 1)    return 'just now'
  if (diff < 60)   return `${diff}m ago`
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
  return `${Math.floor(diff / 1440)}d ago`
}

export async function fetchNOAAStorms() {
  const res  = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json', { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json.activeStorms ?? []).map(s => ({
    name: s.name || s.id || 'Storm',
    lat:  parseNOAACoord(s.latitude),
    lng:  parseNOAACoord(s.longitude),
    cls:  s.classification || '?',
    wind: s.intensity || '?',
    country: '',
  })).filter(s => !isNaN(s.lat) && !isNaN(s.lng))
}

export async function fetchUSGS() {
  const res  = await fetch(USGS_URL, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const quakes = (json.features ?? []).map(f => {
    const [lon, lat] = f.geometry?.coordinates ?? []
    const { mag, place, time } = f.properties ?? {}
    return { lat, lng: lon, mag: mag ?? 0, place: place || 'Unknown location', time: time ?? 0 }
  }).filter(q => typeof q.lat === 'number' && typeof q.lng === 'number')
  if (!quakes.length) throw new Error('empty')
  return quakes
}

export function countryFlag(name) {
  const f = {
    'Ukraine':'🇺🇦', 'Palestine':'🇵🇸', 'Israel':'🇮🇱',   'Sudan':'🇸🇩',    'Syria':'🇸🇾',
    'Iraq':'🇮🇶',    'Yemen':'🇾🇪',     'Afghanistan':'🇦🇫', 'Myanmar':'🇲🇲',  'Ethiopia':'🇪🇹',
    'Mali':'🇲🇱',    'Niger':'🇳🇪',     'Somalia':'🇸🇴',    'Dem. Rep. Congo':'🇨🇩', 'Lebanon':'🇱🇧',
    'Iran':'🇮🇷',    'Pakistan':'🇵🇰',  'Nigeria':'🇳🇬',    'Mozambique':'🇲🇿',
    'India':'🇮🇳',   'Azerbaijan':'🇦🇿', 'Philippines':'🇵🇭',
  }
  return f[name] || '🌍'
}
