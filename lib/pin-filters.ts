import type { Pin } from './types'

/**
 * Inputs that decide which pins are visible on the map / in the list.
 * Extracted from app/page.tsx so the (pure) filtering rules can be unit-tested
 * independently of the page's state wiring.
 */
export interface PinVisibilityState {
  pins: Pin[]
  /** A single explicitly-selected community, or null. */
  selectedCommunity: string | null
  /** Whether a sidebar folder is active (drives the "explicit" rule). */
  activeFolderId: string | null
  /** Community ids in the active folder, or null when no folder is active. */
  activeFolderCommunityIds: Set<string> | null
  showSubscribedOnly: boolean
  subscribedIds: Set<string>
  showSavedOnly: boolean
  savedPinIds: Set<string>
  /** Per-community map mute — only applies to the broad aggregate views. */
  hiddenCommunityIds: Set<string>
  /** Tag filter — a pin must carry ALL selected tags. */
  selectedTagIds: Set<string>
}

/**
 * Derive the visible pin set.
 *
 * Explicit selections (a single community, a folder, or saved) show exactly what
 * was asked for; the per-community visibility toggle only mutes the broad
 * "All" / "My Subscriptions" aggregate views.
 */
export function selectVisiblePins(s: PinVisibilityState): Pin[] {
  const { pins } = s
  const explicit = !!s.selectedCommunity || !!s.activeFolderId || s.showSavedOnly

  let result: Pin[]
  if (s.selectedCommunity) result = pins.filter((p) => p.community_id === s.selectedCommunity)
  else if (s.activeFolderCommunityIds) result = pins.filter((p) => s.activeFolderCommunityIds!.has(p.community_id))
  else if (s.showSavedOnly) result = pins.filter((p) => s.savedPinIds.has(p.id))
  else if (s.showSubscribedOnly && s.subscribedIds.size > 0)
    result = pins.filter((p) => s.subscribedIds.has(p.community_id))
  else result = pins

  if (!explicit && s.hiddenCommunityIds.size > 0) {
    result = result.filter((p) => !s.hiddenCommunityIds.has(p.community_id))
  }

  if (s.selectedTagIds.size > 0) {
    result = result.filter((p) =>
      p.tag_ids ? Array.from(s.selectedTagIds).every((id) => p.tag_ids!.includes(id)) : false
    )
  }
  return result
}
