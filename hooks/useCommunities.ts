import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Community, CommunityGroup, PendingInvite } from '@/lib/types'

/**
 * Communities + the current user's relationship to them (see OPUS_BRIEF §7 step 3):
 * the full community list (with realtime refresh), subscriptions and their folder
 * assignments, mod/owner roles, pending private-community invites, and personal
 * folders. Fetchers re-run whenever `user` changes and clear themselves on
 * sign-out, so the page's sign-out reset no longer has to touch this state.
 *
 * Cross-cutting handlers that also drive map filters (e.g. toggling a subscription
 * can leave the subscribed-only view) stay in the page and call the `subscribe` /
 * `unsubscribe` primitives returned here — this hook owns data, not navigation.
 */
export function useCommunities(user: User | null) {
  const [communities, setCommunities] = useState<Community[]>([])
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set())
  const [modCommunityIds, setModCommunityIds] = useState<Set<string>>(new Set())
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [groups, setGroups] = useState<CommunityGroup[]>([])
  // communityId → groupId (null = ungrouped). Only subscribed communities appear.
  const [communityGroupMap, setCommunityGroupMap] = useState<Map<string, string | null>>(new Map())

  // ── Derived roles ───────────────────────────────────────────────────────────
  const ownedCommunityIds = useMemo(
    () => new Set(communities.filter((c) => c.created_by === user?.id).map((c) => c.id)),
    [communities, user]
  )
  const moderatedIds = useMemo(
    () => new Set([...ownedCommunityIds, ...modCommunityIds]),
    [ownedCommunityIds, modCommunityIds]
  )
  const canModerate = useCallback((communityId: string) => moderatedIds.has(communityId), [moderatedIds])

  // ── Fetchers ────────────────────────────────────────────────────────────────
  const fetchCommunities = useCallback(async () => {
    const { data } = await supabase.from('communities').select('*').order('name')
    if (data) setCommunities(data)
  }, [])

  const fetchSubscriptions = useCallback(async () => {
    if (!user) {
      setSubscribedIds(new Set())
      setCommunityGroupMap(new Map())
      return
    }
    const { data } = await supabase
      .from('community_subscriptions')
      .select('community_id, group_id')
      .eq('user_id', user.id)
    if (data) {
      setSubscribedIds(new Set(data.map((s) => s.community_id)))
      setCommunityGroupMap(new Map(data.map((s) => [s.community_id, s.group_id ?? null])))
    }
  }, [user])

  const fetchModRoles = useCallback(async () => {
    if (!user) { setModCommunityIds(new Set()); return }
    const { data } = await supabase
      .from('community_moderators')
      .select('community_id')
      .eq('user_id', user.id)
    if (data) setModCommunityIds(new Set(data.map((m) => m.community_id)))
  }, [user])

  const fetchPendingInvites = useCallback(async () => {
    if (!user) { setPendingInvites([]); return }
    const { data } = await supabase
      .from('community_members')
      .select('id, community_id, community:communities(name, icon, color)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
    if (data) setPendingInvites(data as unknown as PendingInvite[])
  }, [user])

  const fetchGroups = useCallback(async () => {
    if (!user) { setGroups([]); return }
    const { data } = await supabase
      .from('community_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('position')
      .order('created_at')
    if (data) setGroups(data)
  }, [user])

  useEffect(() => { fetchCommunities() }, [fetchCommunities])
  useEffect(() => { fetchSubscriptions() }, [fetchSubscriptions])
  useEffect(() => { fetchModRoles() }, [fetchModRoles])
  useEffect(() => { fetchPendingInvites() }, [fetchPendingInvites])
  useEffect(() => { fetchGroups() }, [fetchGroups])

  // Live-refresh the community list (new/renamed/deleted communities).
  useEffect(() => {
    const channel = supabase
      .channel('communities-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communities' }, () =>
        fetchCommunities()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchCommunities])

  // ── Subscription primitives (page wraps these with any filter side-effects) ──
  const subscribe = useCallback(async (communityId: string) => {
    if (!user) return
    await supabase.from('community_subscriptions').insert({ community_id: communityId, user_id: user.id })
    setSubscribedIds((prev) => new Set([...prev, communityId]))
  }, [user])

  const unsubscribe = useCallback(async (communityId: string) => {
    if (!user) return
    await supabase
      .from('community_subscriptions')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', user.id)
    setSubscribedIds((prev) => {
      const next = new Set(prev)
      next.delete(communityId)
      return next
    })
  }, [user])

  // ── Private-community invites ────────────────────────────────────────────────
  const acceptInvite = useCallback(async (memberId: string) => {
    if (!user) return
    await supabase
      .from('community_members')
      .update({ status: 'accepted' })
      .eq('id', memberId)
      .eq('user_id', user.id)
    setPendingInvites((prev) => prev.filter((i) => i.id !== memberId))
    fetchCommunities() // make the newly-joined private community appear
  }, [user, fetchCommunities])

  const declineInvite = useCallback(async (memberId: string) => {
    if (!user) return
    await supabase
      .from('community_members')
      .delete()
      .eq('id', memberId)
      .eq('user_id', user.id)
    setPendingInvites((prev) => prev.filter((i) => i.id !== memberId))
  }, [user])

  // ── Personal folders (groups) ────────────────────────────────────────────────
  const createGroup = useCallback(async (name: string): Promise<string | null> => {
    if (!user) return null
    const position = groups.length
    const { data, error } = await supabase
      .from('community_groups')
      .insert({ user_id: user.id, name: name.trim(), position })
      .select()
      .single()
    if (error || !data) return null
    setGroups((prev) => [...prev, data])
    return data.id
  }, [user, groups.length])

  const renameGroup = useCallback(async (id: string, name: string) => {
    await supabase.from('community_groups').update({ name: name.trim() }).eq('id', id)
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name: name.trim() } : g)))
  }, [])

  const deleteGroup = useCallback(async (id: string) => {
    await supabase.from('community_groups').delete().eq('id', id)
    setGroups((prev) => prev.filter((g) => g.id !== id))
    // Any communities that were in this group fall back to ungrouped.
    setCommunityGroupMap((prev) => {
      const next = new Map(prev)
      for (const [cid, gid] of next) if (gid === id) next.set(cid, null)
      return next
    })
  }, [])

  const assignGroup = useCallback(async (communityId: string, groupId: string | null) => {
    if (!user) return
    await supabase
      .from('community_subscriptions')
      .update({ group_id: groupId })
      .eq('community_id', communityId)
      .eq('user_id', user.id)
    setCommunityGroupMap((prev) => new Map(prev).set(communityId, groupId))
  }, [user])

  // Optimistic list mutations the settings modal drives after it writes to the DB.
  const applyCommunityPatch = useCallback((id: string, patch: Partial<Community>) => {
    setCommunities((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])
  const removeCommunity = useCallback((id: string) => {
    setCommunities((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return {
    communities,
    subscribedIds,
    modCommunityIds,
    ownedCommunityIds,
    moderatedIds,
    canModerate,
    pendingInvites,
    groups,
    communityGroupMap,
    refetchCommunities: fetchCommunities,
    subscribe,
    unsubscribe,
    acceptInvite,
    declineInvite,
    createGroup,
    renameGroup,
    deleteGroup,
    assignGroup,
    applyCommunityPatch,
    removeCommunity,
  }
}
