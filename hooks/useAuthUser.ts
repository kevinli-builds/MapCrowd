import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ADMIN_USER_ID } from '@/lib/constants'

/**
 * Authenticated user + derived identity (see OPUS_BRIEF §7 step 2).
 * Owns the session bootstrap + onAuthStateChange subscription, the user's
 * profile username (for the bottom-nav Profile link), and the site-admin flag.
 * Everything downstream takes `user` as an argument rather than reaching for a
 * context — the page passes it into the other hooks.
 */
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [myUsername, setMyUsername] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchMyUsername = useCallback(async () => {
    if (!user) { setMyUsername(null); return }
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()
    setMyUsername(data?.username ?? null)
  }, [user])

  useEffect(() => { fetchMyUsername() }, [fetchMyUsername])

  // Site-wide admin — can delete any community (the real gate is RLS is_site_admin()).
  const isAdmin = !!user && !!ADMIN_USER_ID && user.id === ADMIN_USER_ID

  return { user, authReady, myUsername, isAdmin }
}
