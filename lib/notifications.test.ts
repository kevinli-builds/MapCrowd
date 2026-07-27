import { describe, it, expect } from 'vitest'
import { describeNotification, notificationIcon } from './notifications'
import type { AppNotification } from './types'

const actor = { username: 'alice', avatar_url: null }
const pin = { id: 'p1', title: 'Best banh mi cart' }

function n(type: AppNotification['type'], overrides: Partial<AppNotification> = {}) {
  return { type, actor, pin, ...overrides }
}

describe('describeNotification', () => {
  it('comment → bold actor + pin, opens the pin', () => {
    expect(describeNotification(n('comment'))).toEqual({
      actorName: 'alice',
      text: 'commented on “Best banh mi cart”',
      target: 'pin',
    })
  })

  it('rsvp → event wording, opens the pin', () => {
    expect(describeNotification(n('rsvp'))).toMatchObject({ actorName: 'alice', target: 'pin' })
    expect(describeNotification(n('rsvp')).text).toContain('going to your event')
  })

  it('follow → no pin, opens the actor profile', () => {
    expect(describeNotification(n('follow', { pin: null }))).toEqual({
      actorName: 'alice',
      text: 'started following you',
      target: 'profile',
    })
  })

  it('pin_approved / pin_rejected → system message (no actor name), opens the pin', () => {
    expect(describeNotification(n('pin_approved'))).toEqual({
      actorName: null,
      text: 'Your pin “Best banh mi cart” was approved',
      target: 'pin',
    })
    expect(describeNotification(n('pin_rejected')).text).toContain('was declined')
  })

  it('truncates long pin titles and falls back when missing', () => {
    const long = 'x'.repeat(60)
    expect(describeNotification(n('comment', { pin: { id: 'p', title: long } })).text).toContain('…')
    expect(describeNotification(n('comment', { pin: null })).text).toBe('commented on your pin')
  })

  it('missing actor → null actorName', () => {
    expect(describeNotification(n('comment', { actor: null })).actorName).toBeNull()
  })
})

describe('notificationIcon', () => {
  it('maps each kind to a glyph', () => {
    expect(notificationIcon('comment')).toBe('💬')
    expect(notificationIcon('follow')).toBe('⭐')
    expect(notificationIcon('pin_approved')).toBe('✅')
  })
})
