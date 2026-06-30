import { describe, it, expect } from 'vitest'
import { pointInRing, pointInGeometry, bboxOfGeometry, countryNameAtLngLat } from './atlasGeo'
import { countryFromHex } from './atlasAircraft'
import { formatRelativeTime, confidenceLabel, fmtAcqTime, escapeHtml, safeHttpUrl } from './atlasPopups'

// T10 split smoke test. These helpers were extracted verbatim out of AtlasWorldGlobe.jsx
// into ./atlas/*.js leaf modules. This asserts the extracted, node-safe pure helpers
// still behave, so a regression in the move surfaces in CI rather than only on the globe.

const UNIT_SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
const SQUARE_POLY = { type: 'Polygon', coordinates: [UNIT_SQUARE] }

describe('atlasGeo', () => {
  it('pointInRing detects inside vs outside', () => {
    expect(pointInRing(5, 5, UNIT_SQUARE)).toBe(true)
    expect(pointInRing(20, 5, UNIT_SQUARE)).toBe(false)
  })
  it('pointInGeometry respects polygon bounds', () => {
    expect(pointInGeometry(5, 5, SQUARE_POLY)).toBe(true)
    expect(pointInGeometry(-1, -1, SQUARE_POLY)).toBe(false)
  })
  it('bboxOfGeometry returns [minX,minY,maxX,maxY]', () => {
    expect(bboxOfGeometry(SQUARE_POLY)).toEqual([0, 0, 10, 10])
  })
  it('countryNameAtLngLat reads NAME from a matching feature', () => {
    const geo = { features: [{ geometry: SQUARE_POLY, properties: { NAME: 'Testland' } }] }
    expect(countryNameAtLngLat(5, 5, geo)).toBe('Testland')
    expect(countryNameAtLngLat(50, 50, geo)).toBe(null)
  })
})

describe('atlasAircraft.countryFromHex', () => {
  it('maps an ICAO transponder hex to its country', () => {
    expect(countryFromHex('7c0abc')).toBe('Australia')
    expect(countryFromHex('3c6444')).toBe('Germany')
  })
  it('rejects malformed or unmatched hex', () => {
    expect(countryFromHex('zzzzzz')).toBe(null)
    expect(countryFromHex('')).toBe(null)
    expect(countryFromHex(null)).toBe(null)
  })
})

describe('atlasPopups formatters', () => {
  it('formatRelativeTime buckets and guards null', () => {
    expect(formatRelativeTime(null)).toBe(null)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hr ago')
  })
  it('confidenceLabel maps FIRMS codes', () => {
    expect(confidenceLabel('l')).toBe('Low')
    expect(confidenceLabel('n')).toBe('Nominal')
    expect(confidenceLabel('h')).toBe('High')
  })
  it('fmtAcqTime formats HHMM', () => {
    expect(fmtAcqTime('0930')).toBe('09:30')
  })
  it('escapeHtml escapes markup', () => {
    expect(escapeHtml('<a>&')).toBe('&lt;a&gt;&amp;')
  })
  it('safeHttpUrl allows http(s) only', () => {
    expect(safeHttpUrl('https://example.com/')).toBe('https://example.com/')
    expect(safeHttpUrl('javascript:alert(1)')).toBe(null)
  })
})
