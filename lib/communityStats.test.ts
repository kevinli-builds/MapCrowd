import { describe, it, expect } from 'vitest'
import {
  computeBounds, computeSpread, trimOutliers, formatArea, formatSpan, formatCoverage,
  type LatLngPoint,
} from './communityStats'

// A tight ~few-km cluster (downtown Chicago-ish), enough points to trigger trimming.
const CLUSTER: LatLngPoint[] = [
  { lat: 41.880, lng: -87.630 }, { lat: 41.885, lng: -87.640 },
  { lat: 41.890, lng: -87.635 }, { lat: 41.878, lng: -87.625 },
  { lat: 41.892, lng: -87.645 }, { lat: 41.883, lng: -87.628 },
]
// A second real cluster (Manhattan-ish) — a bi-city community, not noise.
const NYC_CLUSTER: LatLngPoint[] = [
  { lat: 40.740, lng: -73.990 }, { lat: 40.750, lng: -73.985 },
  { lat: 40.730, lng: -74.000 }, { lat: 40.760, lng: -73.980 },
  { lat: 40.745, lng: -73.995 }, { lat: 40.755, lng: -73.975 },
]
const LA = { lat: 34.05, lng: -118.24 } // a far-flung stray

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

describe('trimOutliers', () => {
  it('drops a far-flung stray but keeps the cluster', () => {
    const kept = trimOutliers([...CLUSTER, LA])
    expect(kept.length).toBe(CLUSTER.length) // LA removed
    expect(kept).not.toContainEqual(LA)
  })

  it('leaves an even spread untouched (no false positives)', () => {
    expect(trimOutliers(CLUSTER).length).toBe(CLUSTER.length)
  })

  it('does not trim below the minimum sample size', () => {
    const few = [CLUSTER[0], CLUSTER[1], LA] // n=3 < MIN_TO_TRIM
    expect(trimOutliers(few)).toEqual(few)
  })

  it('keeps BOTH real clusters of a bi-city community, dropping only the lone stray', () => {
    // This is the case a radial-from-centre rule gets wrong: two legit clusters
    // inflate the spread so the stray hides inside it. kNN judges each pin locally.
    const kept = trimOutliers([...CLUSTER, ...NYC_CLUSTER, LA])
    expect(kept).not.toContainEqual(LA)
    expect(kept.length).toBe(CLUSTER.length + NYC_CLUSTER.length) // both cities survive
  })
})

describe('computeSpread trimming', () => {
  it('reports the cluster span and counts the trimmed stray', () => {
    const s = computeSpread([...CLUSTER, LA])!
    expect(s.total).toBe(CLUSTER.length + 1)
    expect(s.count).toBe(CLUSTER.length)
    expect(s.trimmed).toBe(1)
    expect(s.diagM).toBeLessThan(5_000) // a few km, not coast-to-coast
  })

  it('trim:false keeps the stray and balloons the box', () => {
    const raw = computeSpread([...CLUSTER, LA], { trim: false })!
    expect(raw.trimmed).toBe(0)
    expect(raw.diagM).toBeGreaterThan(2_000_000) // ~Chicago→LA
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
