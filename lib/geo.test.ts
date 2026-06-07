import { describe, it, expect } from 'vitest'
import { formatAddress, distanceMeters, formatDistance } from '@/lib/geo'

describe('formatAddress', () => {
  it('returns null for empty input', () => {
    expect(formatAddress(null)).toBeNull()
  })
  it('builds a short street + city address', () => {
    const out = formatAddress({
      address: { house_number: '139', road: 'Chrystie Street', city: 'New York', state: 'NY' },
    }, 2)
    expect(out).toBe('139 Chrystie Street, New York')
  })
  it('falls back to display_name when address parts are missing', () => {
    expect(formatAddress({ display_name: 'Somewhere, Over, The, Rainbow' }, 2)).toBe('Somewhere, Over')
  })
  it('respects maxParts', () => {
    const out = formatAddress({
      address: { road: 'A St', suburb: 'B', city: 'C', state: 'D' },
    }, 3)
    expect(out!.split(', ').length).toBe(3)
  })
})

describe('distanceMeters', () => {
  it('is ~0 for identical points', () => {
    expect(distanceMeters(40.7, -74, 40.7, -74)).toBeCloseTo(0, 5)
  })
  it('approximates a known short distance', () => {
    // ~111m per 0.001° latitude
    const d = distanceMeters(40.000, -74, 40.001, -74)
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(120)
  })
})

describe('formatDistance', () => {
  it('uses metres under 1km and km above', () => {
    expect(formatDistance(45)).toBe('45 m')
    expect(formatDistance(1500)).toBe('1.5 km')
  })
})
