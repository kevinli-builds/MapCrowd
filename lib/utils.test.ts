import { describe, it, expect } from 'vitest'
import {
  timeAgo, timeUntil, formatEventDate, voteColorClass, formatVoteCount,
  formatCount, avatarColor, canUserPinInCommunity, AVATAR_COLORS,
} from '@/lib/utils'
import type { Community } from '@/lib/types'

const community = (over: Partial<Community> = {}): Community => ({
  id: 'c1', name: 'X', slug: 'x', description: null, color: '#6366f1', icon: '📍',
  is_private: false, created_by: null, require_approval: false,
  default_pin_duration: 'permanent', who_can_pin: 'anyone', created_at: '', ...over,
})

describe('voteColorClass', () => {
  it('is green for positive, red for negative, neutral for zero', () => {
    expect(voteColorClass(5)).toBe('text-green-400')
    expect(voteColorClass(-2)).toBe('text-red-400')
    expect(voteColorClass(0)).toBe('text-gray-500')
    expect(voteColorClass(0, 'text-gray-600')).toBe('text-gray-600')
  })
})

describe('formatVoteCount', () => {
  it('prefixes a + only for positives', () => {
    expect(formatVoteCount(3)).toBe('+3')
    expect(formatVoteCount(0)).toBe('0')
    expect(formatVoteCount(-4)).toBe('-4')
  })
})

describe('formatCount', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatCount(950)).toBe('950')
    expect(formatCount(1500)).toBe('1.5k')
    expect(formatCount(2_400_000)).toBe('2.4M')
  })
})

describe('timeAgo / timeUntil', () => {
  it('reports just now for very recent times', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now')
  })
  it('reports minutes/hours/days ago', () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
    expect(timeAgo(ago(5 * 60_000))).toBe('5m ago')
    expect(timeAgo(ago(3 * 3_600_000))).toBe('3h ago')
    expect(timeAgo(ago(2 * 86_400_000))).toBe('2d ago')
  })
  it('reports expired for past times', () => {
    expect(timeUntil(new Date(Date.now() - 1000).toISOString())).toBe('expired')
  })
  it('counts down for future times', () => {
    expect(timeUntil(new Date(Date.now() + 5 * 60_000).toISOString())).toBe('5m')
  })
})

describe('formatEventDate', () => {
  it('includes an end time when provided', () => {
    const start = '2026-06-14T19:00:00Z'
    const single = formatEventDate(start)
    const ranged = formatEventDate(start, '2026-06-14T22:00:00Z')
    expect(ranged).toContain('–')
    expect(single).not.toContain('–')
  })
})

describe('avatarColor', () => {
  it('returns a palette color deterministically', () => {
    const c = avatarColor('abc123')
    expect(AVATAR_COLORS).toContain(c)
    expect(avatarColor('abc123')).toBe(c) // deterministic
  })
})

describe('canUserPinInCommunity', () => {
  const subs = new Set(['c1'])
  const mods = new Set(['c1'])
  it('lets anyone pin in open communities', () => {
    expect(canUserPinInCommunity(community({ who_can_pin: 'anyone' }), null, new Set(), new Set())).toBe(true)
  })
  it('blocks anonymous users in restricted communities', () => {
    expect(canUserPinInCommunity(community({ who_can_pin: 'subscribers' }), null, subs, mods)).toBe(false)
  })
  it('allows subscribers / mods when the user qualifies', () => {
    expect(canUserPinInCommunity(community({ who_can_pin: 'subscribers' }), 'u1', subs, new Set())).toBe(true)
    expect(canUserPinInCommunity(community({ who_can_pin: 'mods' }), 'u1', new Set(), mods)).toBe(true)
  })
  it('blocks a non-subscriber from a subscribers-only community', () => {
    expect(canUserPinInCommunity(community({ who_can_pin: 'subscribers' }), 'u1', new Set(), new Set())).toBe(false)
  })
})
