import { describe, it, expect } from 'vitest'
import { pickSurprisePin } from './surprise'

const p = (id: string, vote_count: number) => ({ id, vote_count })

describe('pickSurprisePin', () => {
  it('returns null for an empty list', () => {
    expect(pickSurprisePin([])).toBeNull()
  })

  it('picks only from upvoted pins when any exist', () => {
    const pins = [p('a', 0), p('b', 3), p('c', -2), p('d', 1)]
    // rand=0 → first of the "good" pool (b), rand≈0.99 → last good (d)
    expect(pickSurprisePin(pins, () => 0)?.id).toBe('b')
    expect(pickSurprisePin(pins, () => 0.99)?.id).toBe('d')
  })

  it('falls back to any pin when none are upvoted', () => {
    const pins = [p('a', 0), p('b', -1), p('c', 0)]
    expect(pickSurprisePin(pins, () => 0)?.id).toBe('a')
    expect(pickSurprisePin(pins, () => 0.99)?.id).toBe('c')
  })

  it('handles a single pin', () => {
    expect(pickSurprisePin([p('solo', 0)], () => 0.5)?.id).toBe('solo')
  })
})
