import { describe, it, expect } from 'vitest'
import {
  polylineMeters, segmentsMeters, routeMeters, estimateDurationMin, formatDuration,
  type LatLng,
} from './routeStats'

// 1° of latitude ≈ 111.19 km — handy known distance for the haversine.
const ONE_DEG_M = 111_195

describe('polylineMeters', () => {
  it('sums consecutive hops (~111 km per degree of latitude)', () => {
    expect(polylineMeters([[0, 0], [1, 0]])).toBeCloseTo(ONE_DEG_M, -3) // within ~1 km
    // two hops of 1° each ≈ 2×
    expect(polylineMeters([[0, 0], [1, 0], [2, 0]])).toBeCloseTo(2 * ONE_DEG_M, -3)
  })

  it('is 0 for a single point or empty path', () => {
    expect(polylineMeters([[5, 5]])).toBe(0)
    expect(polylineMeters([])).toBe(0)
  })
})

describe('segmentsMeters', () => {
  it('adds up multiple segments', () => {
    const segs: LatLng[][] = [[[0, 0], [1, 0]], [[0, 0], [1, 0]]]
    expect(segmentsMeters(segs)).toBeCloseTo(2 * ONE_DEG_M, -3)
  })
})

describe('routeMeters', () => {
  const fallback: LatLng[] = [[0, 0], [2, 0]] // straight ~222 km

  it('prefers the snapped geometry when present (legacy flat polyline)', () => {
    // A short snapped path should win over the longer straight fallback.
    expect(routeMeters([[0, 0], [0.5, 0]], fallback)).toBeCloseTo(0.5 * ONE_DEG_M, -3)
  })

  it('prefers segmented geometry too', () => {
    expect(routeMeters([[[0, 0], [1, 0]]], fallback)).toBeCloseTo(ONE_DEG_M, -3)
  })

  it('falls back to straight lines when geometry is null/empty', () => {
    expect(routeMeters(null, fallback)).toBeCloseTo(2 * ONE_DEG_M, -3)
    expect(routeMeters([], fallback)).toBeCloseTo(2 * ONE_DEG_M, -3)
  })
})

describe('estimateDurationMin', () => {
  it('scales inversely with mode speed', () => {
    // 1.4 km walking ≈ 16.7 min → 17
    expect(estimateDurationMin(1400, 'foot-walking')).toBe(17)
    // same distance drives much faster
    expect(estimateDurationMin(1400, 'driving-car')).toBeLessThan(
      estimateDurationMin(1400, 'foot-hiking')
    )
  })
})

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(75)).toBe('1 h 15 min')
    expect(formatDuration(120)).toBe('2 h')
  })
})
