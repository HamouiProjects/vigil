const PLACE_LABEL_LAYER_RE =
  /(?:^|[-_])(?:country|countries|city|cities|town|towns|village|hamlet|suburb|neighbour|neighbor|locality|metropolis|settlement|municipal|state|province|region|county|district|capital|adm0|admin-0|admin0|adm1|admin-1|admin1|sovereign|nation|place-country|place_country|place-2|place-3|place_2|place_3|label_city|label_town|label_country|place-label)(?:$|[-_])/i

const COUNTRY_MIN_ZOOM = 3

const COUNTRY_LABEL_RE =
  /(?:^|[-_])(?:country|countries|adm0|admin-0|admin0|sovereign|nation|place-country|place_country|label_country)(?:$|[-_])/i

const NON_PLACE_LABEL_LAYER_RE =
  /(?:^|[-_])(?:road|street|highway|motorway|waterway|poi|shield|ref-|housenumber|house-number|airport|rail|ferry|marine|ocean|transit|barrier|tunnel|bridge|building|entrance|aeroway)(?:$|[-_])/i

function isPlaceLabelLayer(layer) {
  if (layer.type !== 'symbol') return false
  const layout = layer.layout || {}
  if (layout['text-field'] == null) return false

  const lid = layer.id.toLowerCase()
  if (NON_PLACE_LABEL_LAYER_RE.test(lid)) return false

  const filterStr = JSON.stringify(layer.filter ?? null)
  if (PLACE_LABEL_LAYER_RE.test(lid)) return true
  if (layer['source-layer'] === 'place') return true
  if (
    /"class"[^\]]*"(?:country|state|province|region|city|town|village|hamlet|suburb|county|locality)"/.test(
      filterStr,
    )
  ) {
    return true
  }
  return false
}

function isCountryLabelLayer(layer) {
  if (!isPlaceLabelLayer(layer)) return false
  const lid = layer.id.toLowerCase()
  if (COUNTRY_LABEL_RE.test(lid)) return true
  const filterStr = JSON.stringify(layer.filter ?? null)
  return /"class"[^\]]*"country"/.test(filterStr)
}

/** Subtle dial-back for all place name labels (countries through cities); never hides layers. */
function calmBasemapLabels(map) {
  const style = map.getStyle()
  if (!style?.layers) return

  for (const layer of style.layers) {
    if (!isPlaceLabelLayer(layer)) continue
    try {
      map.setPaintProperty(layer.id, 'text-opacity', 0.5)
      map.setPaintProperty(layer.id, 'text-halo-width', 0)
      map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(0,0,0,0)')
    } catch {
      /* layer not ready */
    }
    if (isCountryLabelLayer(layer)) {
      try {
        map.setLayerZoomRange(
          layer.id,
          Math.max(layer.minzoom ?? 0, COUNTRY_MIN_ZOOM),
          layer.maxzoom ?? 24,
        )
      } catch {}
    }
  }
}

export {
  PLACE_LABEL_LAYER_RE,
  COUNTRY_MIN_ZOOM,
  COUNTRY_LABEL_RE,
  NON_PLACE_LABEL_LAYER_RE,
  isPlaceLabelLayer,
  isCountryLabelLayer,
  calmBasemapLabels,
}
