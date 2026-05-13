import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import Widget from './Widget'

const DARK_STYLE = {
  version: 8,
  sources: {
    stadia: {
      type: 'raster',
      tiles: ['https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap',
    },
  },
  layers: [{ id: 'stadia', type: 'raster', source: 'stadia' }],
}

export default function MapWidget() {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     DARK_STYLE,
      center:    [12, 30],
      zoom:      1.8,
      attributionControl: false,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // Sample alert markers shown on load
    const MARKERS = [
      { lng:  31.0, lat:  30.1, color: '#ff4d4f', label: 'Cairo' },
      { lng:  37.6, lat:  55.8, color: '#f5c518', label: 'Moscow' },
      { lng: 103.8, lat:   1.4, color: '#00c6ff', label: 'Singapore' },
      { lng: -74.0, lat:  40.7, color: '#23d160', label: 'New York' },
      { lng: -43.2, lat: -22.9, color: '#00c6ff', label: 'Rio' },
    ]

    map.on('load', () => {
      MARKERS.forEach(({ lng, lat, color, label }) => {
        const el = document.createElement('div')
        el.className = 'map-marker'
        el.style.setProperty('--mc', color)
        el.title = label
        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
      })
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  return (
    <Widget title="Global Map" icon="🌐" badge="LIVE" badgeActive>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        onMouseDown={e => e.stopPropagation()}
      />
    </Widget>
  )
}
