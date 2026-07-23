import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Pin } from '@/lib/types'
import { selectVisiblePins } from '@/lib/pin-filters'

const HIDDEN_KEY = 'hiddenCommunityIds'

interface UseMapFiltersOptions {
  user: User | null
  pins: Pin[]
  subscribedIds: Set<string>
  savedPinIds: Set<string>
  communityGroupMap: Map<string, string | null>
}

/**
 * The map's filter dimensions + the visible-pin derivation (see OPUS_BRIEF §7 step 6):
 * which community/folder/tag/subscription/saved view is active, plus per-community
 * visibility. Owns the pure state + persistence + the auto-default and leave-saved
 * effects, and wraps the already-tested selectVisiblePins into `filteredPins`.
 *
 * The composite view handlers (select community / subscribed / saved / folder) stay
 * in the page because they also coordinate the route builder and mobile drawer — the
 * page calls `resetFilters()` then sets the one dimension it wants. Keeping those in
 * the page is also what lets the hooks stay independent (no hook imports another).
 */
export function useMapFilters({ user, pins, subscribedIds, savedPinIds, communityGroupMap }: UseMapFiltersOptions) {
  // Tracks whether the user has manually chosen a filter; stops the auto-default
  // from overriding their choice.
  const userChoseFilter = useRef(false)
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null)
  const [showSubscribedOnly, setShowSubscribedOnly] = useState(false)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  // Per-community map visibility (device preference; independent of subscribe).
  const [hiddenCommunityIds, setHiddenCommunityIds] = useState<Set<string>>(new Set())
  // The custom community folder currently filtering the map (null = none).
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  // Tag filter (community-scoped) — empty = show all.
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  // Load the persisted hidden-community set on mount.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]')
      if (Array.isArray(saved)) setHiddenCommunityIds(new Set(saved))
    } catch { /* ignore */ }
  }, [])

  const toggleCommunityVisibility = useCallback((id: string) => {
    setHiddenCommunityIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const toggleTagFilter = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }, [])

  // Clear every filter dimension (the page's view handlers call this, then set the
  // one they want). Does NOT touch the route builder or drawer — that's the page's job.
  const resetFilters = useCallback(() => {
    userChoseFilter.current = true
    setSelectedCommunity(null)
    setShowSubscribedOnly(false)
    setShowSavedOnly(false)
    setActiveFolderId(null)
    setSelectedTagIds(new Set())
  }, [])

  // Reset the manual-filter flag on any auth change, and clear the views on sign-out.
  useEffect(() => {
    userChoseFilter.current = false
    if (!user) {
      setShowSubscribedOnly(false)
      setShowSavedOnly(false)
      setActiveFolderId(null)
      setSelectedCommunity(null)
    }
  }, [user])

  // Auto-default signed-in users with subscriptions to the subscribed-only view.
  useEffect(() => {
    if (userChoseFilter.current) return
    if (user && subscribedIds.size > 0) {
      setShowSubscribedOnly(true)
      setSelectedCommunity(null)
    }
  }, [user, subscribedIds])

  // Leave the Saved view automatically once the last save is removed.
  useEffect(() => {
    if (showSavedOnly && savedPinIds.size === 0) setShowSavedOnly(false)
  }, [showSavedOnly, savedPinIds])

  // Community ids belonging to the active folder (via the community→group map).
  const activeFolderCommunityIds = useMemo(() => {
    if (!activeFolderId) return null
    const ids = new Set<string>()
    for (const [cid, gid] of communityGroupMap) if (gid === activeFolderId) ids.add(cid)
    return ids
  }, [activeFolderId, communityGroupMap])

  const filteredPins = useMemo(
    () => selectVisiblePins({
      pins,
      selectedCommunity,
      activeFolderId,
      activeFolderCommunityIds,
      showSubscribedOnly,
      subscribedIds,
      showSavedOnly,
      savedPinIds,
      hiddenCommunityIds,
      selectedTagIds,
    }),
    [pins, selectedCommunity, activeFolderId, activeFolderCommunityIds, showSubscribedOnly, subscribedIds, showSavedOnly, savedPinIds, hiddenCommunityIds, selectedTagIds]
  )

  return {
    userChoseFilter,
    selectedCommunity, setSelectedCommunity,
    showSubscribedOnly, setShowSubscribedOnly,
    showSavedOnly, setShowSavedOnly,
    hiddenCommunityIds, toggleCommunityVisibility,
    activeFolderId, setActiveFolderId,
    selectedTagIds, toggleTagFilter,
    resetFilters,
    activeFolderCommunityIds,
    filteredPins,
  }
}
