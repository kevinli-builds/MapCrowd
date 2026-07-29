import { describe, it, expect } from 'vitest'
import { weeklyBars, formatPendingLatency, growthBadge } from './insights'

describe('weeklyBars', () => {
  it('scales to the busiest week and floors non-zero weeks to minPx', () => {
    expect(weeklyBars([{ count: 0 }, { count: 2 }, { count: 4 }], 40)).toEqual([0, 20, 40])
    // a lone pin in a tall-max week still gets minPx, not a sub-pixel sliver
    expect(weeklyBars([{ count: 1 }, { count: 100 }], 40, 3)).toEqual([3, 40])
  })

  it('all-zero weeks render as all-zero bars (no divide-by-zero)', () => {
    expect(weeklyBars([{ count: 0 }, { count: 0 }], 40)).toEqual([0, 0])
  })

  it('handles an empty series', () => {
    expect(weeklyBars([], 40)).toEqual([])
  })
})

describe('formatPendingLatency', () => {
  it('labels the wait, or "Clear" when nothing is pending', () => {
    expect(formatPendingLatency(null)).toBe('Clear')
    expect(formatPendingLatency(0.5)).toBe('<1h')
    expect(formatPendingLatency(5)).toBe('5h')
    expect(formatPendingLatency(23)).toBe('23h')
    expect(formatPendingLatency(48)).toBe('2d')
    expect(formatPendingLatency(30)).toBe('1d')
  })
})

describe('growthBadge', () => {
  it('shows +N only for positive growth', () => {
    expect(growthBadge(3)).toBe('+3')
    expect(growthBadge(0)).toBe('')
    expect(growthBadge(-2)).toBe('')
  })
})
