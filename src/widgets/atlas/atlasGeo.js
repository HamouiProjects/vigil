function countryNameFromProps(props) {
  if (!props) return null
  return props.NAME || props.ADMIN || props.NAME_EN || props.NAME_LONG || null
}

function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const hit = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
    if (hit) inside = !inside
  }
  return inside
}

function pointInGeometry(lng, lat, geometry) {
  if (!geometry) return false
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates
    : geometry.type === 'Polygon' ? [geometry.coordinates] : []
  for (const poly of polys) {
    if (!poly?.[0]?.length) continue
    if (!pointInRing(lng, lat, poly[0])) continue
    let inHole = false
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(lng, lat, poly[h])) { inHole = true; break }
    }
    if (!inHole) return true
  }
  return false
}

function bboxOfGeometry(geometry) {
  if (!geometry) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : geometry.type === 'Polygon' ? [geometry.coordinates] : []
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

function countryFeatureAtLngLat(lng, lat, geo, bboxes) {
  if (!geo?.features) return null
  const feats = geo.features
  for (let i = 0; i < feats.length; i++) {
    const b = bboxes?.[i]
    if (b && (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3])) continue
    if (pointInGeometry(lng, lat, feats[i].geometry)) return feats[i]
  }
  return null
}

function featurePoint(f) {
  const g = f?.geometry
  if (!g) return null
  if (g.type === 'Point') return g.coordinates
  if (g.type === 'MultiPoint') return g.coordinates?.[0] || null
  if (g.type === 'Polygon') return g.coordinates?.[0]?.[0] || null
  if (g.type === 'MultiPolygon') return g.coordinates?.[0]?.[0]?.[0] || null
  if (g.type === 'GeometryCollection') {
    const pt = (g.geometries || []).find((s) => s?.type === 'Point')
    if (pt) return pt.coordinates
    const poly = (g.geometries || []).find((s) => s?.type === 'Polygon' || s?.type === 'MultiPolygon')
    if (poly) return featurePoint({ geometry: poly })
    return null
  }
  return null
}

function containedMarkers(ref, geometry, toItem, getPoint) {
  const features = ref?.current?.features
  if (!features?.length) return []
  const pick = getPoint || ((f) => f.geometry?.coordinates)
  const out = []
  for (const f of features) {
    const coords = pick(f)
    if (!coords || coords.length < 2) continue
    if (!pointInGeometry(coords[0], coords[1], geometry)) continue
    out.push(toItem(f, coords))
  }
  return out
}

function countryNameAtLngLat(lng, lat, geo) {
  if (!geo?.features) return null
  for (const f of geo.features) {
    if (pointInGeometry(lng, lat, f.geometry)) return countryNameFromProps(f.properties)
  }
  return null
}

export {
  countryNameFromProps,
  pointInRing,
  pointInGeometry,
  bboxOfGeometry,
  countryFeatureAtLngLat,
  featurePoint,
  containedMarkers,
  countryNameAtLngLat,
}
