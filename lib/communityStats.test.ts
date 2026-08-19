import { describe, it, expect } from 'vitest'
import {
  computeBounds, computeSpread, formatArea, formatSpan, formatCoverage,
  type LatLngPoint,
} from './communityStats'

// 1° of latitude ≈ 111.19 km — handy known distance for the haversine.
const ONE_DEG_M = 111_195

describe('computeBounds', () => {
  it('finds the tight box and ignores non-finite coords', () => {
    const pts: LatLngPoint[] = [
      { lat: 1, lng: 2 },
      { lat: -1, lng: 5 },
      { lat: NaN, lng: 0 }, // skipped
    ]
    expect(computeBounds(pts)).toEqual({ south: -1, north: 1, west: 2, east: 5 })
  })

  it('is null with no usable points', () => {
    expect(computeBounds([])).toBeNull()
    expect(computeBounds([{ lat: NaN, lng: Infinity }])).toBeNull()
  })
})

describe('computeSpread', () => {
  it('measures extents from the box (1° tall, at the equator)', () => {
    const s = computeSpread([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
    ])!
    expect(s).not.toBeNull()
    expect(s.count).toBe(2)
    expect(s.heightM).toBeCloseTo(ONE_DEG_M, -3) // N–S ≈ 111 km
    expect(s.widthM).toBeCloseTo(ONE_DEG_M, -3) // E–W ≈ 111 km near equator
    expect(s.areaKm2).toBeGreaterThan(11_000) // ~111 × 111 km
    expect(s.diagM).toBeGreaterThan(s.widthM) // corner-to-corner is longest
  })

  it('is null when every pin sits on one spot', () => {
    expect(computeSpread([{ lat: 3, lng: 3 }, { lat: 3, lng: 3 }])).toBeNull()
    expect(computeSpread([{ lat: 3, lng: 3 }])).toBeNull()
    expect(computeSpread([])).toBeNull()
  })
})

describe('formatArea', () => {
  it('scales the unit to the size', () => {
    expect(formatArea(42.6)).toBe('43 km²')
    expect(formatArea(8.83)).toBe('8.8 km²')
    expect(formatArea(0.44)).toBe('0.44 km²')
    expect(formatArea(0.0012)).toBe('1,200 m²')
  })
})

describe('formatSpan', () => {
  it('renders width × height', () => {
    const s = computeSpread([{ lat: 0, lng: 0 }, { lat: 0.01, lng: 0.02 }])!
    expect(formatSpan(s)).toMatch(/ × /)
  })
})

describe('formatCoverage', () => {
  it('uses metres below 1 km, integer km once past 10 km, comma-groups large spans', () => {
    // ~111 km diagonal (1° of latitude) → "111 km"
    expect(formatCoverage(computeSpread([{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }])!)).toBe('111 km')
    // ~1.1 km → one decimal
    expect(formatCoverage(computeSpread([{ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 }])!)).toBe('1.1 km')
    // continent-scale span reads with a thousands separator, not a squared area
    expect(formatCoverage(computeSpread([{ lat: 34.067, lng: -118.254 }, { lat: 41.929, lng: -73.932 }])!))
      .toMatch(/^\d,\d{3} km$/)
  })
})
