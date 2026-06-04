import { useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const DEMOTILES_STYLE = 'https://demotiles.maplibre.org/style.json'
const STYLE_WATCHDOG_MS = 2500
const IDLE_MS = 180_000
const ROTATE_LNG_PER_FRAME = 0.02
const ROTATE_MAX_ZOOM = 2
const DEFAULT_GLOBE_ZOOM = 1.4
const DEFAULT_GLOBE_LAT = 20
const USGS_QUAKES_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
const GDACS_STORMS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP'
const AIRCRAFT_GEO_URL = '/api/geo?source=aircraft'
const WILDFIRES_GEO_URL = '/api/geo?source=firms'
const QUAKES_REFRESH_MS = 120_000
const STORMS_REFRESH_MS = 300_000
const AIRCRAFT_REFRESH_MS = 20_000
const WILDFIRES_REFRESH_MS = 600_000
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] }

// ICAO Annex 10 address blocks — flightaware/dump1090 public_html/flags.js (readsb/tar1090 table)
const ICAO_COUNTRY_RANGES = [
  [0x700000, 0x700FFF, 'Afghanistan'],
  [0x501000, 0x5013FF, 'Albania'],
  [0xA0000, 0xA7FFF, 'Algeria'],
  [0x90000, 0x90FFF, 'Angola'],
  [0xCA000, 0xCA3FF, 'Antigua and Barbuda'],
  [0xE00000, 0xE3FFFF, 'Argentina'],
  [0x600000, 0x6003FF, 'Armenia'],
  [0x7C0000, 0x7FFFFF, 'Australia'],
  [0x440000, 0x447FFF, 'Austria'],
  [0x600800, 0x600BFF, 'Azerbaijan'],
  [0xA8000, 0xA8FFF, 'Bahamas'],
  [0x894000, 0x894FFF, 'Bahrain'],
  [0x702000, 0x702FFF, 'Bangladesh'],
  [0xAA000, 0xAA3FF, 'Barbados'],
  [0x510000, 0x5103FF, 'Belarus'],
  [0x448000, 0x44FFFF, 'Belgium'],
  [0xAB000, 0xAB3FF, 'Belize'],
  [0x94000, 0x943FF, 'Benin'],
  [0x680000, 0x6803FF, 'Bhutan'],
  [0xE94000, 0xE94FFF, 'Bolivia'],
  [0x513000, 0x5133FF, 'Bosnia and Herzegovina'],
  [0x30000, 0x303FF, 'Botswana'],
  [0xE40000, 0xE7FFFF, 'Brazil'],
  [0x895000, 0x8953FF, 'Brunei Darussalam'],
  [0x450000, 0x457FFF, 'Bulgaria'],
  [0x9C000, 0x9CFFF, 'Burkina Faso'],
  [0x32000, 0x32FFF, 'Burundi'],
  [0x70E000, 0x70EFFF, 'Cambodia'],
  [0x34000, 0x34FFF, 'Cameroon'],
  [0xC00000, 0xC3FFFF, 'Canada'],
  [0x96000, 0x963FF, 'Cape Verde'],
  [0x6C000, 0x6CFFF, 'Central African Republic'],
  [0x84000, 0x84FFF, 'Chad'],
  [0xE80000, 0xE80FFF, 'Chile'],
  [0x780000, 0x7BFFFF, 'China'],
  [0xAC000, 0xACFFF, 'Colombia'],
  [0x35000, 0x353FF, 'Comoros'],
  [0x36000, 0x36FFF, 'Congo'],
  [0x901000, 0x9013FF, 'Cook Islands'],
  [0xAE000, 0xAEFFF, 'Costa Rica'],
  [0x38000, 0x38FFF, "Cote d'Ivoire"],
  [0x501C00, 0x501FFF, 'Croatia'],
  [0xB0000, 0xB0FFF, 'Cuba'],
  [0x4C8000, 0x4C83FF, 'Cyprus'],
  [0x498000, 0x49FFFF, 'Czech Republic'],
  [0x720000, 0x727FFF, "Democratic People's Republic of Korea"],
  [0x8C000, 0x8CFFF, 'Democratic Republic of the Congo'],
  [0x458000, 0x45FFFF, 'Denmark'],
  [0x98000, 0x983FF, 'Djibouti'],
  [0xC4000, 0xC4FFF, 'Dominican Republic'],
  [0xE84000, 0xE84FFF, 'Ecuador'],
  [0x10000, 0x17FFF, 'Egypt'],
  [0xB2000, 0xB2FFF, 'El Salvador'],
  [0x42000, 0x42FFF, 'Equatorial Guinea'],
  [0x202000, 0x2023FF, 'Eritrea'],
  [0x511000, 0x5113FF, 'Estonia'],
  [0x40000, 0x40FFF, 'Ethiopia'],
  [0xC88000, 0xC88FFF, 'Fiji'],
  [0x460000, 0x467FFF, 'Finland'],
  [0x380000, 0x3BFFFF, 'France'],
  [0x3E000, 0x3EFFF, 'Gabon'],
  [0x9A000, 0x9AFFF, 'Gambia'],
  [0x514000, 0x5143FF, 'Georgia'],
  [0x3C0000, 0x3FFFFF, 'Germany'],
  [0x44000, 0x44FFF, 'Ghana'],
  [0x468000, 0x46FFFF, 'Greece'],
  [0xCC000, 0xCC3FF, 'Grenada'],
  [0xB4000, 0xB4FFF, 'Guatemala'],
  [0x46000, 0x46FFF, 'Guinea'],
  [0x48000, 0x483FF, 'Guinea-Bissau'],
  [0xB6000, 0xB6FFF, 'Guyana'],
  [0xB8000, 0xB8FFF, 'Haiti'],
  [0xBA000, 0xBAFFF, 'Honduras'],
  [0x470000, 0x477FFF, 'Hungary'],
  [0x4CC000, 0x4CCFFF, 'Iceland'],
  [0x800000, 0x83FFFF, 'India'],
  [0x8A0000, 0x8A7FFF, 'Indonesia'],
  [0x730000, 0x737FFF, 'Iran, Islamic Republic of'],
  [0x728000, 0x72FFFF, 'Iraq'],
  [0x4CA000, 0x4CAFFF, 'Ireland'],
  [0x738000, 0x73FFFF, 'Israel'],
  [0x300000, 0x33FFFF, 'Italy'],
  [0xBE000, 0xBEFFF, 'Jamaica'],
  [0x840000, 0x87FFFF, 'Japan'],
  [0x740000, 0x747FFF, 'Jordan'],
  [0x683000, 0x6833FF, 'Kazakhstan'],
  [0x4C000, 0x4CFFF, 'Kenya'],
  [0xC8E000, 0xC8E3FF, 'Kiribati'],
  [0x706000, 0x706FFF, 'Kuwait'],
  [0x601000, 0x6013FF, 'Kyrgyzstan'],
  [0x708000, 0x708FFF, "Lao People's Democratic Republic"],
  [0x502C00, 0x502FFF, 'Latvia'],
  [0x748000, 0x74FFFF, 'Lebanon'],
  [0x4A000, 0x4A3FF, 'Lesotho'],
  [0x50000, 0x50FFF, 'Liberia'],
  [0x18000, 0x1FFFF, 'Libyan Arab Jamahiriya'],
  [0x503C00, 0x503FFF, 'Lithuania'],
  [0x4D0000, 0x4D03FF, 'Luxembourg'],
  [0x54000, 0x54FFF, 'Madagascar'],
  [0x58000, 0x58FFF, 'Malawi'],
  [0x750000, 0x757FFF, 'Malaysia'],
  [0x5A000, 0x5A3FF, 'Maldives'],
  [0x5C000, 0x5CFFF, 'Mali'],
  [0x4D2000, 0x4D23FF, 'Malta'],
  [0x900000, 0x9003FF, 'Marshall Islands'],
  [0x5E000, 0x5E3FF, 'Mauritania'],
  [0x60000, 0x603FF, 'Mauritius'],
  [0xD0000, 0xD7FFF, 'Mexico'],
  [0x681000, 0x6813FF, 'Micronesia, Federated States of'],
  [0x4D4000, 0x4D43FF, 'Monaco'],
  [0x682000, 0x6823FF, 'Mongolia'],
  [0x516000, 0x5163FF, 'Montenegro'],
  [0x20000, 0x27FFF, 'Morocco'],
  [0x6000, 0x6FFF, 'Mozambique'],
  [0x704000, 0x704FFF, 'Myanmar'],
  [0x201000, 0x2013FF, 'Namibia'],
  [0xC8A000, 0xC8A3FF, 'Nauru'],
  [0x70A000, 0x70AFFF, 'Nepal'],
  [0x480000, 0x487FFF, 'Netherlands, Kingdom of the'],
  [0xC80000, 0xC87FFF, 'New Zealand'],
  [0xC0000, 0xC0FFF, 'Nicaragua'],
  [0x62000, 0x62FFF, 'Niger'],
  [0x64000, 0x64FFF, 'Nigeria'],
  [0x478000, 0x47FFFF, 'Norway'],
  [0x70C000, 0x70C3FF, 'Oman'],
  [0x760000, 0x767FFF, 'Pakistan'],
  [0x684000, 0x6843FF, 'Palau'],
  [0xC2000, 0xC2FFF, 'Panama'],
  [0x898000, 0x898FFF, 'Papua New Guinea'],
  [0xE88000, 0xE88FFF, 'Paraguay'],
  [0xE8C000, 0xE8CFFF, 'Peru'],
  [0x758000, 0x75FFFF, 'Philippines'],
  [0x488000, 0x48FFFF, 'Poland'],
  [0x490000, 0x497FFF, 'Portugal'],
  [0x6A000, 0x6A3FF, 'Qatar'],
  [0x718000, 0x71FFFF, 'Republic of Korea'],
  [0x504C00, 0x504FFF, 'Republic of Moldova'],
  [0x4A0000, 0x4A7FFF, 'Romania'],
  [0x100000, 0x1FFFFF, 'Russian Federation'],
  [0x6E000, 0x6EFFF, 'Rwanda'],
  [0xC8C000, 0xC8C3FF, 'Saint Lucia'],
  [0xBC000, 0xBC3FF, 'Saint Vincent and the Grenadines'],
  [0x902000, 0x9023FF, 'Samoa'],
  [0x500000, 0x5003FF, 'San Marino'],
  [0x9E000, 0x9E3FF, 'Sao Tome and Principe'],
  [0x710000, 0x717FFF, 'Saudi Arabia'],
  [0x70000, 0x70FFF, 'Senegal'],
  [0x4C0000, 0x4C7FFF, 'Serbia'],
  [0x74000, 0x743FF, 'Seychelles'],
  [0x76000, 0x763FF, 'Sierra Leone'],
  [0x768000, 0x76FFFF, 'Singapore'],
  [0x505C00, 0x505FFF, 'Slovakia'],
  [0x506C00, 0x506FFF, 'Slovenia'],
  [0x897000, 0x8973FF, 'Solomon Islands'],
  [0x78000, 0x78FFF, 'Somalia'],
  [0x8000, 0xFFFF, 'South Africa'],
  [0x340000, 0x37FFFF, 'Spain'],
  [0x770000, 0x777FFF, 'Sri Lanka'],
  [0x7C000, 0x7CFFF, 'Sudan'],
  [0xC8000, 0xC8FFF, 'Suriname'],
  [0x7A000, 0x7A3FF, 'Swaziland'],
  [0x4A8000, 0x4AFFFF, 'Sweden'],
  [0x4B0000, 0x4B7FFF, 'Switzerland'],
  [0x778000, 0x77FFFF, 'Syrian Arab Republic'],
  [0x515000, 0x5153FF, 'Tajikistan'],
  [0x880000, 0x887FFF, 'Thailand'],
  [0x512000, 0x5123FF, 'The former Yugoslav Republic of Macedonia'],
  [0x88000, 0x88FFF, 'Togo'],
  [0xC8D000, 0xC8D3FF, 'Tonga'],
  [0xC6000, 0xC6FFF, 'Trinidad and Tobago'],
  [0x28000, 0x2FFFF, 'Tunisia'],
  [0x4B8000, 0x4BFFFF, 'Turkey'],
  [0x601800, 0x601BFF, 'Turkmenistan'],
  [0x68000, 0x68FFF, 'Uganda'],
  [0x508000, 0x50FFFF, 'Ukraine'],
  [0x896000, 0x896FFF, 'United Arab Emirates'],
  [0x400000, 0x43FFFF, 'United Kingdom'],
  [0x80000, 0x80FFF, 'United Republic of Tanzania'],
  [0xA00000, 0xAFFFFF, 'United States'],
  [0xE90000, 0xE90FFF, 'Uruguay'],
  [0x507C00, 0x507FFF, 'Uzbekistan'],
  [0xC90000, 0xC903FF, 'Vanuatu'],
  [0xD8000, 0xDFFFF, 'Venezuela'],
  [0x888000, 0x88FFFF, 'Viet Nam'],
  [0x890000, 0x890FFF, 'Yemen'],
  [0x8A000, 0x8AFFF, 'Zambia'],
  [0x4000, 0x43FF, 'Zimbabwe'],
]

const PLANESPOTTERS_PHOTO_API = 'https://api.planespotters.net/pub/photos/hex'

function countryFromHex(hex) {
  const normalized = String(hex || '').trim().toLowerCase()
  if (!/^[0-9a-f]{6}$/.test(normalized)) return null
  const addr = parseInt(normalized, 16)
  if (Number.isNaN(addr)) return null
  for (const [start, end, country] of ICAO_COUNTRY_RANGES) {
    if (addr < start || addr > end) continue
    if (country.startsWith('Unassigned') || country.startsWith('ICAO (')) return null
    return country
  }
  return null
}

/** Interim palette — Phase D will align with design tokens */
export const LAYER_COLORS = {
  earthquakes: '#F2A03D',
  storms: '#58B4E6',
  aircraft: '#E2E8F0',
  wildfires: '#EA5F38',
}

const CIRCLE_STROKE_COLOR = 'rgba(8,11,19,0.6)'
const CIRCLE_STROKE_WIDTH = 1.2
const AIRCRAFT_ICON_ID = 'vigil-aircraft-plane'
const PLANE_OUTLINE = 'rgba(8,11,19,0.85)'

function tracePlanePath(ctx, cx) {
  ctx.beginPath()
  ctx.moveTo(cx, 2)
  ctx.lineTo(cx + 5, 14)
  ctx.lineTo(cx, 11)
  ctx.lineTo(cx - 5, 14)
  ctx.closePath()
}

function createAircraftPlaneImageData(color = LAYER_COLORS.aircraft) {
  const size = 18
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  tracePlanePath(ctx, cx)
  ctx.strokeStyle = PLANE_OUTLINE
  ctx.lineWidth = 1.2
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.fillStyle = color
  tracePlanePath(ctx, cx)
  ctx.fill()
  return ctx.getImageData(0, 0, size, size)
}

function registerAircraftIcon(map) {
  if (map.hasImage(AIRCRAFT_ICON_ID)) map.removeImage(AIRCRAFT_ICON_ID)
  map.addImage(AIRCRAFT_ICON_ID, createAircraftPlaneImageData())
}

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
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const POPUP_BODY_STYLE =
  'padding:10px 12px;color:var(--color-text-primary);font-size:12px;line-height:1.45;min-width:200px;'

function popupRowsHtml(rows) {
  return rows
    .map(
      ([label, value]) =>
        `<div style="margin-bottom:3px;font-size:12px;line-height:1.4;">
          <span style="color:var(--color-text-muted);">${escapeHtml(label)}</span>
          <span style="color:var(--color-text-primary);"> ${escapeHtml(value)}</span>
        </div>`,
    )
    .join('')
}

function buildPhotoBlock(photo) {
  if (!photo?.src) return ''
  const photographer = photo.photographer || 'Unknown'
  const creditInner = photo.link
    ? `<a href="${escapeHtml(photo.link)}" target="_blank" rel="noopener" style="color:var(--color-text-muted);text-decoration:none;">© ${escapeHtml(photographer)} · Planespotters</a>`
    : `© ${escapeHtml(photographer)} · Planespotters`
  return `<div>
    <img src="${escapeHtml(photo.src)}" alt="" style="width:100%;max-height:180px;object-fit:cover;display:block;border-radius:3px 3px 0 0;" />
    <div style="font-size:9px;padding:6px 12px;color:var(--color-text-muted);border-bottom:1px solid var(--color-border);background:var(--color-surface-2);">${creditInner}</div>
  </div>`
}

function buildPopupCard({ dotColor, kicker, title, titleRows, rows, footer, photoHtml }) {
  const titleRowsHtml = titleRows?.length ? popupRowsHtml(titleRows) : ''
  const rowsHtml = rows?.length ? popupRowsHtml(rows) : ''

  return `${photoHtml || ''}<div style="${POPUP_BODY_STYLE}">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
      <span style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0;border:1px solid var(--color-border);"></span>
      <span style="font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-text-muted);">${escapeHtml(kicker)}</span>
    </div>
    <div style="font-weight:600;font-size:13px;margin-bottom:6px;line-height:1.35;color:var(--color-text-primary);">${escapeHtml(title)}</div>
    ${titleRowsHtml}
    ${rowsHtml}
    <div style="color:var(--color-text-muted);font-size:10px;margin-top:8px;padding-top:6px;border-top:1px solid var(--color-border);">${escapeHtml(footer)}</div>
  </div>`
}

function parsePlanespottersPhoto(json) {
  const photo = json?.photos?.[0]
  if (!photo) return null
  const src = photo?.thumbnail_large?.src || photo?.thumbnail?.src
  if (!src) return null
  return {
    src,
    photographer: photo.photographer || 'Unknown',
    link: photo.link || null,
  }
}

async function fetchPlanespottersPhoto(hex, cache) {
  const key = String(hex).trim().toLowerCase()
  if (!/^[0-9a-f]{6}$/.test(key)) return null
  if (cache.has(key)) return cache.get(key)

  try {
    const res = await fetch(`${PLANESPOTTERS_PHOTO_API}/${key}`)
    if (!res.ok) {
      cache.set(key, null)
      return null
    }
    const json = await res.json()
    const parsed = parsePlanespottersPhoto(json)
    cache.set(key, parsed)
    return parsed
  } catch {
    cache.set(key, null)
    return null
  }
}

function buildEarthquakePopupHtml(feature, updatedAt) {
  const props = feature.properties || {}
  const mag = props.mag
  const place = props.place || 'Unknown location'
  const title =
    mag != null && !Number.isNaN(Number(mag))
      ? `M${mag} · ${place}`
      : place

  const rows = []
  if (mag != null && !Number.isNaN(Number(mag))) rows.push(['Magnitude', String(mag)])
  const depth = feature.geometry?.coordinates?.[2]
  if (depth != null && !Number.isNaN(Number(depth))) {
    rows.push(['Depth', `${Number(depth).toFixed(1)} km`])
  }
  if (props.time != null) {
    const t = formatTime(props.time)
    if (t !== '—') rows.push(['Time', t])
  }

  const updated = formatTime(props.updated ?? updatedAt)
  const footer =
    updated !== '—' ? `Source: USGS · updated ${updated}` : 'Source: USGS'

  return buildPopupCard({
    dotColor: LAYER_COLORS.earthquakes,
    kicker: 'EARTHQUAKE',
    title,
    rows,
    footer,
  })
}

function buildStormPopupHtml(props) {
  const name = props.name || props.eventname || 'Unknown event'
  const rows = []
  if (props.country) rows.push(['Region', props.country])
  if (props.alertlevel) rows.push(['Alert level', props.alertlevel])
  const from = formatIsoDate(props.fromdate)
  const to = formatIsoDate(props.todate)
  if (from || to) {
    const active = from && to ? `${from} – ${to}` : from || to
    rows.push(['Active', active])
  }

  return buildPopupCard({
    dotColor: LAYER_COLORS.storms,
    kicker: 'TROPICAL CYCLONE',
    title: name,
    rows,
    footer: 'Source: GDACS',
  })
}

function buildWildfirePopupHtml(props) {
  const rows = []
  if (props.frp != null && props.frp !== '' && !Number.isNaN(Number(props.frp))) {
    rows.push(['Radiative power', `${props.frp} MW`])
  }
  if (props.confidence) rows.push(['Confidence', props.confidence])
  const detected = [props.acq_date, props.acq_time].filter(Boolean).join(' ')
  if (detected) rows.push(['Detected', `${detected} UTC`])

  return buildPopupCard({
    dotColor: LAYER_COLORS.wildfires,
    kicker: 'ACTIVE WILDFIRE',
    title: 'Active fire detection',
    rows,
    footer: 'Source: NASA FIRMS (VIIRS NOAA-20)',
  })
}

function buildAircraftPopupHtml(props, { country = null, photo = null } = {}) {
  const callsign = (props.callsign || '').trim()
  const titleBase = callsign || props.hex || 'Unknown aircraft'
  const title = props.type ? `${titleBase} · ${props.type}` : titleBase

  const titleRows = []
  if (country) titleRows.push(['Country', country])

  const rows = []
  if (props.reg) rows.push(['Registration', props.reg])
  if (props.alt != null && props.alt !== '' && !Number.isNaN(Number(props.alt))) {
    rows.push(['Altitude', `${props.alt} ft`])
  }
  if (props.speed != null && props.speed !== '' && !Number.isNaN(Number(props.speed))) {
    rows.push(['Speed', `${props.speed} kts`])
  }
  if (typeof props.track === 'number' && !Number.isNaN(props.track)) {
    rows.push(['Heading', `${props.track}°`])
  }
  if (props.squawk != null && props.squawk !== '') {
    rows.push(['Squawk', String(props.squawk)])
  }

  return buildPopupCard({
    dotColor: LAYER_COLORS.aircraft,
    kicker: 'MILITARY AIRCRAFT',
    title,
    titleRows,
    rows,
    footer: 'Source: adsb.lol',
    photoHtml: buildPhotoBlock(photo),
  })
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

export default function AtlasWorldGlobe({ paused, layers, refreshNonce = 0 }) {
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
  const aircraftGeoRef = useRef(null)
  const wildfiresGeoRef = useRef(null)
  const lastFetchRef = useRef(null)
  const aircraftPhotoCacheRef = useRef(new Map())

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
  }, [refreshNonce])

  useEffect(() => {
    let intervalId = null

    const fetchWildfires = async () => {
      if (pausedRef.current) return
      try {
        const res = await fetch(WILDFIRES_GEO_URL)
        if (!res.ok) return
        const geojson = await res.json()
        wildfiresGeoRef.current = geojson
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
      center: [lngRef.current, DEFAULT_GLOBE_LAT],
      zoom: DEFAULT_GLOBE_ZOOM,
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
            'circle-color': LAYER_COLORS.earthquakes,
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
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(buildEarthquakePopupHtml(feature, lastFetchRef.current))
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
            'circle-color': LAYER_COLORS.storms,
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
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(buildStormPopupHtml(props))
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

      if (!aircraftListenersBound) {
        aircraftListenersBound = true

        map.on('click', 'aircraft-layer', (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          const props = feature.properties || {}
          const hex = String(props.hex || '').trim().toLowerCase()
          const country = countryFromHex(hex)
          const token = ++aircraftPopupToken
          const cache = aircraftPhotoCacheRef.current

          const renderAircraftPopup = (photo) => {
            if (token !== aircraftPopupToken || !popup) return
            popup.setHTML(buildAircraftPopupHtml(props, { country, photo }))
          }

          popup?.remove()
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(buildAircraftPopupHtml(props, { country, photo: null }))
            .addTo(map)

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
        })

        map.on('mouseenter', 'aircraft-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'aircraft-layer', () => {
          map.getCanvas().style.cursor = ''
        })
      }
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
            'circle-color': LAYER_COLORS.wildfires,
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
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(buildWildfirePopupHtml(props))
            .addTo(map)
        })

        map.on('mouseenter', 'wildfires-layer', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'wildfires-layer', () => {
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
      ensureAircraftLayer()
      ensureWildfiresLayer()
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let rotateSuppressed = false
    let resetEaseToken = 0

    const onIdleExpired = () => {
      interactingRef.current = false
      if (reducedMotion.matches) return

      const m = mapRef.current
      if (!m) return

      if (m.getZoom() > ROTATE_MAX_ZOOM) {
        const lng = m.getCenter().lng
        lngRef.current = lng
        rotateSuppressed = true
        const token = ++resetEaseToken

        m.easeTo({
          center: [lng, DEFAULT_GLOBE_LAT],
          zoom: DEFAULT_GLOBE_ZOOM,
          duration: 1500,
        })

        const onMoveEnd = () => {
          m.off('moveend', onMoveEnd)
          if (token !== resetEaseToken) return
          rotateSuppressed = false
          interactingRef.current = false
          lngRef.current = m.getCenter().lng
        }
        m.on('moveend', onMoveEnd)
      } else {
        lngRef.current = m.getCenter().lng
      }
    }

    const markInteracting = (e) => {
      if (e && e.originalEvent == null) return
      interactingRef.current = true
      resetEaseToken += 1
      rotateSuppressed = false
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(onIdleExpired, IDLE_MS)
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

    const tick = () => {
      const m = mapRef.current
      const mayRotate =
        m &&
        !pausedRef.current &&
        !interactingRef.current &&
        !rotateSuppressed &&
        !reducedMotion.matches &&
        m.getZoom() <= ROTATE_MAX_ZOOM

      if (mayRotate) {
        lngRef.current = (lngRef.current + ROTATE_LNG_PER_FRAME) % 360
        if (lngRef.current > 180) lngRef.current -= 360
        m.setCenter([lngRef.current, DEFAULT_GLOBE_LAT], { duration: 0 })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      resetEaseToken += 1
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
