import maplibregl from 'maplibre-gl'

const RTL_TEXT_PLUGIN_URL =
  'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js'

let rtlTextPluginRequested = false

function ensureRtlTextPlugin() {
  if (rtlTextPluginRequested) return
  rtlTextPluginRequested = true
  try {
    maplibregl.setRTLTextPlugin(RTL_TEXT_PLUGIN_URL, null, true)
  } catch {
    /* plugin already registered */
  }
}

ensureRtlTextPlugin()

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const DEMOTILES_STYLE = 'https://demotiles.maplibre.org/style.json'

const STYLE_WATCHDOG_MS = 2500

const IDLE_MS = 180_000

const ROTATE_LNG_PER_FRAME = 0.02

const ROTATE_MAX_ZOOM = 2

const DEFAULT_GLOBE_ZOOM = 1.4

const DEFAULT_GLOBE_LAT = 20

const DEFAULT_VIEW = { center: [55, 30], zoom: 1.9 }

const GLOBE_SPACE_BG = {
  dark: '#05070B',
  light: '#D9D3C6',
}

const GLOBE_SKY = {
  dark:  { 'sky-color': '#0B1220', 'sky-horizon-blend': 0.6, 'horizon-color': '#1B2A44', 'atmosphere-blend': 0.5 },
  light: { 'sky-color': '#CFC9BD', 'sky-horizon-blend': 0.6, 'horizon-color': '#E6E1D6', 'atmosphere-blend': 0.5 },
}

function readGlobeTheme() {
  const raw = document.documentElement.getAttribute('data-theme')
  return raw === 'light' ? 'light' : 'dark'
}

function applyGlobeTheme(theme, map, { wrapEl, mapContainerEl } = {}) {
  const mode = theme === 'light' ? 'light' : 'dark'
  const spaceBg = GLOBE_SPACE_BG[mode]

  if (wrapEl) wrapEl.style.background = spaceBg
  if (mapContainerEl) mapContainerEl.style.background = spaceBg

  if (!map) return

  try {
    const mapContainer = map.getContainer()
    if (mapContainer) mapContainer.style.background = spaceBg
    const canvas = map.getCanvas?.()
    if (canvas) canvas.style.background = spaceBg
  } catch {
    /* map not fully ready */
  }

  // Apply the map-style parts only once the style SPEC is loaded. Do NOT gate on
  // map.isStyleLoaded() — at the style.load moment it returns false (sources still
  // loading), so the globe projection would never apply (flat map). A pre-style.load
  // init call throws here; we catch and no-op — style.load and the theme observer re-apply.
  try {
    if (typeof map.setProjection === 'function') {
      map.setProjection({ type: 'globe' })
    }

    if (typeof map.setSky === 'function') {
      map.setSky(GLOBE_SKY[mode])
    }

    const style = map.getStyle()
    if (style?.layers) {
      for (const layer of style.layers) {
        if (layer.type === 'background') {
          try {
            map.setPaintProperty(layer.id, 'background-color', spaceBg)
          } catch {
            /* ignore */
          }
          continue
        }

        if (layer.type !== 'raster') continue

        try {
          if (mode === 'light') {
            map.setPaintProperty(layer.id, 'raster-brightness-max', 0.9)
            map.setPaintProperty(layer.id, 'raster-saturation', -0.1)
            map.setPaintProperty(layer.id, 'raster-contrast', 0)
          } else {
            map.setPaintProperty(layer.id, 'raster-brightness-max', 0.72)
            map.setPaintProperty(layer.id, 'raster-saturation', -0.15)
            map.setPaintProperty(layer.id, 'raster-contrast', -0.05)
          }
        } catch {
          /* raster paint may be unavailable on this layer */
        }
      }
    }
  } catch {
    /* style spec not loaded yet (pre style.load) — re-applied on style.load and theme toggle */
  }
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

export {
  RTL_TEXT_PLUGIN_URL,
  rtlTextPluginRequested,
  ensureRtlTextPlugin,
  OPENFREEMAP_STYLE,
  DEMOTILES_STYLE,
  STYLE_WATCHDOG_MS,
  IDLE_MS,
  ROTATE_LNG_PER_FRAME,
  ROTATE_MAX_ZOOM,
  DEFAULT_GLOBE_ZOOM,
  DEFAULT_GLOBE_LAT,
  DEFAULT_VIEW,
  GLOBE_SPACE_BG,
  GLOBE_SKY,
  readGlobeTheme,
  applyGlobeTheme,
  buildStyleChain,
}
