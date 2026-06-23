import { describe, it, expect } from 'vitest'
import { selectVisiblePins, type PinVisibilityState } from './pin-filters'
import type { Pin } from './types'

// Minimal Pin factory — only the fields the filter reads matter.
function pin(id: string, community_id: string, tag_ids?: string[]): Pin {
  return { id, community_id, tag_ids } as unknown as Pin
}

const base: Omit<PinVisibilityState, 'pins'> = {
  selectedCommunity: null,
  activeFolderId: null,
  activeFolderCommunityIds: null,
  showSubscribedOnly: false,
  subscribedIds: new Set(),
  showSavedOnly: false,
  savedPinIds: new Set(),
  hiddenCommunityIds: new Set(),
  selectedTagIds: new Set(),
}

const pins = [pin('p1', 'cA', ['t1']), pin('p2', 'cB', ['t1', 't2']), pin('p3', 'cC')]

describe('selectVisiblePins', () => {
  it('returns all pins with no filters', () => {
    expect(selectVisiblePins({ ...base, pins }).map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('a selected community shows only that community', () => {
    const out = selectVisiblePins({ ...base, pins, selectedCommunity: 'cB' })
    expect(out.map((p) => p.id)).toEqual(['p2'])
  })

  it('showSavedOnly filters to saved pin ids', () => {
    const out = selectVisiblePins({ ...base, pins, showSavedOnly: true, savedPinIds: new Set(['p3']) })
    expect(out.map((p) => p.id)).toEqual(['p3'])
  })

  it('showSubscribedOnly filters to subscribed communities (only when non-empty)', () => {
    const out = selectVisiblePins({ ...base, pins, showSubscribedOnly: true, subscribedIds: new Set(['cA']) })
    expect(out.map((p) => p.id)).toEqual(['p1'])
    // Empty subscription set falls through to "all"
    const all = selectVisiblePins({ ...base, pins, showSubscribedOnly: true, subscribedIds: new Set() })
    expect(all).toHaveLength(3)
  })

  it('hiddenCommunityIds mutes aggregate views but NOT explicit selections', () => {
    const muted = selectVisiblePins({ ...base, pins, hiddenCommunityIds: new Set(['cA']) })
    expect(muted.map((p) => p.id)).toEqual(['p2', 'p3'])
    // Explicit community selection ignores the mute
    const explicit = selectVisiblePins({ ...base, pins, selectedCommunity: 'cA', hiddenCommunityIds: new Set(['cA']) })
    expect(explicit.map((p) => p.id)).toEqual(['p1'])
  })

  it('tag filter requires ALL selected tags', () => {
    const out = selectVisiblePins({ ...base, pins, selectedTagIds: new Set(['t1', 't2']) })
    expect(out.map((p) => p.id)).toEqual(['p2'])
    // A pin with no tags never matches a tag filter
    const none = selectVisiblePins({ ...base, pins, selectedTagIds: new Set(['t9']) })
    expect(none).toHaveLength(0)
  })
})
