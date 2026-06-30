const USGS_QUAKES_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'

const GDACS_STORMS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP'

const AIRCRAFT_GEO_URL = '/api/geo?source=aircraft'

const WILDFIRES_GEO_URL = '/api/geo?source=firms'

const CONFLICT_GEO_URL = '/api/geo?source=conflict'

const QUAKES_REFRESH_MS = 120_000

const STORMS_REFRESH_MS = 300_000

const AIRCRAFT_REFRESH_MS = 20_000

const WILDFIRES_REFRESH_MS = 600_000

const CONFLICT_REFRESH_MS = 900_000  // 15 min

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] }

const COUNTRIES_GEO_URL = '/ne_110m_admin_0_countries.geojson'

/** Static palette for AtlasWidget layer chips; globe markers use runtime CSS tokens */
export const LAYER_COLORS = {
  earthquakes: '#F2A03D',
  storms: '#58B4E6',
  aircraft: '#E2E8F0',
  wildfires: '#F4C430',
  conflict: '#E5564D',
}

export const LAYER_SWATCH_CSS = {
  earthquakes: 'var(--color-warning)',
  storms: 'var(--color-info)',
  wildfires: 'var(--color-wildfire)',
  aircraft: 'var(--color-text-primary)',
  conflict: 'var(--color-conflict-mid)',
}

function resolveLayerMarkerColors() {
  const styles = getComputedStyle(document.documentElement)
  const conflictMid = styles.getPropertyValue('--color-conflict-mid').trim()
  return {
    earthquakes: styles.getPropertyValue('--color-warning').trim(),
    storms: styles.getPropertyValue('--color-info').trim(),
    wildfires: styles.getPropertyValue('--color-wildfire').trim(),
    aircraft: styles.getPropertyValue('--color-text-primary').trim(),
    conflict: conflictMid || LAYER_COLORS.conflict,
  }
}

function applyLayerMarkerColors(map) {
  if (!map) return
  const colors = resolveLayerMarkerColors()
  try {
    if (map.getLayer('quakes-layer')) {
      map.setPaintProperty('quakes-layer', 'circle-color', colors.earthquakes)
    }
    if (map.getLayer('storms-layer')) {
      map.setPaintProperty('storms-layer', 'circle-color', colors.storms)
    }
    if (map.getLayer('wildfires-layer')) {
      map.setPaintProperty('wildfires-layer', 'circle-color', colors.wildfires)
    }
    if (map.getLayer('conflict-layer')) {
      map.setPaintProperty('conflict-layer', 'circle-color', colors.conflict)
    }
    if (map.hasImage(AIRCRAFT_ICON_ID)) {
      map.updateImage(AIRCRAFT_ICON_ID, createAircraftPlaneImageData(colors.aircraft))
    }
  } catch {
    /* layers or icon not ready */
  }
}

export const LAYER_ORDER = ['earthquakes', 'storms', 'aircraft', 'wildfires', 'conflict']

function createDefaultProvenance() {
  return {
    earthquakes: {
      label: 'Earthquakes',
      sourceName: 'USGS (M2.5+, past day)',
      sourceUrl: 'https://earthquake.usgs.gov/earthquakes/map/',
      fetchedAt: null,
      count: null,
    },
    storms: {
      label: 'Tropical cyclones',
      sourceName: 'GDACS',
      sourceUrl: 'https://www.gdacs.org/',
      fetchedAt: null,
      count: null,
    },
    aircraft: {
      label: 'Aircraft (military transponder)',
      sourceName: 'adsb.lol military ADS-B',
      sourceUrl: 'https://adsb.lol/',
      fetchedAt: null,
      count: null,
    },
    wildfires: {
      label: 'Active wildfires',
      sourceName: 'NASA FIRMS VIIRS NOAA-20 NRT',
      sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/',
      fetchedAt: null,
      count: null,
    },
    conflict: {
      label: 'Reported conflict events',
      sourceName: 'GDELT 2.0 Event database',
      sourceUrl: 'https://www.gdeltproject.org/',
      fetchedAt: null,
      count: null,
      note: 'Machine-coded from news reports, an indicator, not confirmed events.',
    },
  }
}

function featureCollectionFromGeoResponse(json) {
  if (!json || json.type !== 'FeatureCollection') return EMPTY_GEOJSON
  return { type: 'FeatureCollection', features: json.features ?? [] }
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

function createAircraftPlaneImageData(color) {
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
  const { aircraft } = resolveLayerMarkerColors()
  const imageData = createAircraftPlaneImageData(aircraft)
  if (map.hasImage(AIRCRAFT_ICON_ID)) {
    map.updateImage(AIRCRAFT_ICON_ID, imageData)
  } else {
    map.addImage(AIRCRAFT_ICON_ID, imageData)
  }
}

export {
  EMPTY_GEOJSON,
  COUNTRIES_GEO_URL,
  USGS_QUAKES_URL,
  GDACS_STORMS_URL,
  AIRCRAFT_GEO_URL,
  WILDFIRES_GEO_URL,
  CONFLICT_GEO_URL,
  QUAKES_REFRESH_MS,
  STORMS_REFRESH_MS,
  AIRCRAFT_REFRESH_MS,
  WILDFIRES_REFRESH_MS,
  CONFLICT_REFRESH_MS,
  resolveLayerMarkerColors,
  applyLayerMarkerColors,
  createDefaultProvenance,
  featureCollectionFromGeoResponse,
  CIRCLE_STROKE_COLOR,
  CIRCLE_STROKE_WIDTH,
  AIRCRAFT_ICON_ID,
  PLANE_OUTLINE,
  tracePlanePath,
  createAircraftPlaneImageData,
  registerAircraftIcon,
}
