import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Pin } from '@/lib/types'

/**
 * Pins + the current user's private pin relationships (see OPUS_BRIEF §7 step 4):
 * the approved/unexpired pin set (with realtime refresh), saved bookmarks, and the
 * follow graph. Save/follow are exposed as primitives that assume a signed-in user;
 * the page wraps them with the sign-in prompt (they also share the auth modal, which
 * stays in the page). Delete/edit of a pin also touch the open pin modal, so the page
 * keeps those handlers and drives the list via removePin / applyPinPatch.
 */
export function usePins(user: User | null) {
  const [pins, setPins] = useState<Pin[]>([])
  const [savedPinIds, setSavedPinIds] = useState<Set<string>>(new Set())
  const [followedUserIds, setFollowedUserIds] = useState<Set<string>>(new Set())

  // ── Pins (public, realtime) ──────────────────────────────────────────────────
  const fetchPins = useCallback(async () => {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('pins')
      .select('*, community:communities(*), profile:profiles(username, avatar_url), pin_tags(tag_id)')
      .eq('status', 'approved')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
    if (data) {
      // Flatten the pin_tags join into a string[] of tag ids for filtering.
      setPins(
        data.map((p) => {
          const { pin_tags, ...pin } = p as Pin & { pin_tags?: { tag_id: string }[] }
          return { ...pin, tag_ids: (pin_tags ?? []).map((t) => t.tag_id) }
        })
      )
    }
  }, [])

  useEffect(() => { fetchPins() }, [fetchPins])

  useEffect(() => {
    const channel = supabase
      .channel('pins-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pins' }, () => fetchPins())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchPins])

  // ── Saved bookmarks ──────────────────────────────────────────────────────────
  const fetchSaved = useCallback(async () => {
    if (!user) { setSavedPinIds(new Set()); return }
    const { data } = await supabase.from('saved_pins').select('pin_id').eq('user_id', user.id)
    if (data) setSavedPinIds(new Set(data.map((s) => s.pin_id)))
  }, [user])

  useEffect(() => { fetchSaved() }, [fetchSaved])

  // Assumes a signed-in user (the page gates the sign-in prompt).
  const toggleSave = useCallback(async (pinId: string) => {
    if (!user) return
    if (savedPinIds.has(pinId)) {
      setSavedPinIds((prev) => { const n = new Set(prev); n.delete(pinId); return n })
      await supabase.from('saved_pins').delete().eq('user_id', user.id).eq('pin_id', pinId)
    } else {
      setSavedPinIds((prev) => new Set([...prev, pinId]))
      await supabase.from('saved_pins').insert({ user_id: user.id, pin_id: pinId })
    }
  }, [user, savedPinIds])

  // ── Follows ──────────────────────────────────────────────────────────────────
  const fetchFollowing = useCallback(async () => {
    if (!user) { setFollowedUserIds(new Set()); return }
    const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', user.id)
    if (data) setFollowedUserIds(new Set(data.map((f) => f.followee_id)))
  }, [user])

  useEffect(() => { fetchFollowing() }, [fetchFollowing])

  const toggleFollow = useCallback(async (targetUserId: string) => {
    if (!user || targetUserId === user.id) return // can't follow yourself
    if (followedUserIds.has(targetUserId)) {
      setFollowedUserIds((prev) => { const n = new Set(prev); n.delete(targetUserId); return n })
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('followee_id', targetUserId)
    } else {
      setFollowedUserIds((prev) => new Set([...prev, targetUserId]))
      await supabase.from('follows').insert({ follower_id: user.id, followee_id: targetUserId })
    }
  }, [user, followedUserIds])

  // ── List mutations the page's delete/edit handlers drive ─────────────────────
  const removePin = useCallback(async (pinId: string) => {
    await supabase.from('pins').delete().eq('id', pinId)
    setPins((prev) => prev.filter((p) => p.id !== pinId))
  }, [])

  const applyPinPatch = useCallback((updated: Partial<Pin> & { id: string }) => {
    setPins((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
  }, [])

  return {
    pins,
    refetchPins: fetchPins,
    savedPinIds,
    toggleSave,
    followedUserIds,
    toggleFollow,
    removePin,
    applyPinPatch,
  }
}
