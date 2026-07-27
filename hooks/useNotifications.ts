import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AppNotification } from '@/lib/types'

const LIMIT = 30

// Raw shape from the join — Supabase may hand back to-one embeds as an object or a
// single-element array depending on the relationship; coerce to a plain object.
type RawNotification = Omit<AppNotification, 'actor' | 'pin'> & {
  actor: AppNotification['actor'] | AppNotification['actor'][]
  pin: AppNotification['pin'] | AppNotification['pin'][]
}

const one = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] ?? null : v) as T

/**
 * The signed-in user's in-app notifications for the bell (§1 P1). Fetches own rows
 * (RLS-scoped) with the actor + target pin joined, keeps them live via a realtime
 * channel filtered to this user, and exposes markAllRead for "mark-read on open".
 * Rows are written server-side by triggers (migration 39) — nothing here inserts.
 */
export function useNotifications(user: User | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  const fetchNotifications = useCallback(async () => {
    if (!user) { setNotifications([]); return }
    const { data } = await supabase
      .from('notifications')
      .select('id, type, read_at, created_at, actor:profiles!actor_id(username, avatar_url), pin:pins(id, title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    if (data) {
      setNotifications(
        (data as unknown as RawNotification[]).map((n) => ({
          ...n,
          actor: one(n.actor),
          pin: one(n.pin),
        }))
      )
    }
  }, [user])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // Live updates: refetch on any change to this user's notification rows.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchNotifications()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, fetchNotifications])

  const unreadCount = notifications.reduce((n, x) => (x.read_at ? n : n + 1), 0)

  // Mark every unread row read (called when the panel opens). Optimistic + persisted.
  const markAllRead = useCallback(async () => {
    if (!user || unreadCount === 0) return
    const nowIso = new Date().toISOString()
    setNotifications((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: nowIso })))
    await supabase.from('notifications').update({ read_at: nowIso }).eq('user_id', user.id).is('read_at', null)
  }, [user, unreadCount])

  return { notifications, unreadCount, markAllRead, refetch: fetchNotifications }
}
