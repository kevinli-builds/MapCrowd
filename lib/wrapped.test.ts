import { describe, it, expect } from 'vitest'
import { truncTitle, wrappedStats, wrappedHeadline } from './wrapped'
import type { CommunityWrapped } from './types'

const base: CommunityWrapped = {
  name: 'Street Art', icon: '🎨', color: '#f97316',
  total_pins: 120, pins_this_year: 45, contributors: 18,
  subscriber_count: 60, new_subscribers_year: 12, route_count: 3,
  top_pin: { title: 'Best mural downtown', vote_count: 34 },
  top_event: { title: 'Gallery night', going: 22 },
}

describe('truncTitle', () => {
  it('truncates long titles with an ellipsis', () => {
    expect(truncTitle('x'.repeat(50), 10)).toBe('xxxxxxxxx…')
    expect(truncTitle('short', 10)).toBe('short')
  })
})

describe('wrappedStats', () => {
  it('folds subscriber growth into the value', () => {
    expect(wrappedStats(base)).toContainEqual({ label: 'Subscribers', value: '60 (+12)' })
  })

  it('omits the growth suffix when there was none', () => {
    expect(wrappedStats({ ...base, new_subscribers_year: 0 }))
      .toContainEqual({ label: 'Subscribers', value: '60' })
  })

  it('drops the routes line when there are none', () => {
    const labels = wrappedStats({ ...base, route_count: 0 }).map((s) => s.label)
    expect(labels).not.toContain('Public routes')
    expect(wrappedStats(base).map((s) => s.label)).toContain('Public routes')
  })
})

describe('wrappedHeadline', () => {
  it('leads with the top pin when present', () => {
    expect(wrappedHeadline(base)).toBe('★ Top pin: “Best mural downtown” (+34)')
  })

  it('falls back to the top event, then a generic line', () => {
    expect(wrappedHeadline({ ...base, top_pin: null })).toContain('Biggest event')
    expect(wrappedHeadline({ ...base, top_pin: null, top_event: null })).toBe('A year on the map')
  })
})
