'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle2, AlertCircle, LogIn, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type State = 'loading' | 'needsAuth' | 'error' | 'done'

/**
 * Invite-link redemption (§2). Reads /join/<token>, redeems it via the
 * SECURITY DEFINER redeem_invite() RPC once the visitor is signed in, then lands
 * them on the community page. Signed-out visitors get a Google sign-in that returns
 * here to finish joining.
 */
export default function JoinPage() {
  const params = useParams()
  const router = useRouter()
  const token = params?.token as string

  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('')
  const [community, setCommunity] = useState<{ slug: string; name: string } | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session?.user) { setState('needsAuth'); return }

      const { data, error } = await supabase.rpc('redeem_invite', { p_token: token })
      if (cancelled) return
      if (error) {
        setMessage(error.message.replace(/^.*?:\s*/, '') || 'Could not redeem this invite')
        setState('error')
        return
      }
      const c = data as { slug: string; name: string }
      setCommunity(c)
      setState('done')
      setTimeout(() => { if (!cancelled) router.push(`/c/${c.slug}`) }, 1400)
    })()
    return () => { cancelled = true }
  }, [token, router])

  const signIn = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-900">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg">
          <MapPin className="h-5 w-5 text-white" />
        </div>

        {state === 'loading' && (
          <>
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-500">Checking your invite…</p>
          </>
        )}

        {state === 'needsAuth' && (
          <>
            <h1 className="text-lg font-bold">You're invited to a community</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to accept the invite and join.</p>
            <button
              onClick={signIn}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <LogIn className="h-4 w-4" /> Sign in with Google
            </button>
            <Link href="/" className="mt-3 inline-block text-xs text-gray-400 hover:text-gray-600">Not now — go to the map</Link>
          </>
        )}

        {state === 'done' && community && (
          <>
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-green-600" />
            <h1 className="text-lg font-bold">Welcome to {community.name}!</h1>
            <p className="mt-1 text-sm text-gray-500">Taking you there…</p>
          </>
        )}

        {state === 'error' && (
          <>
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <h1 className="text-lg font-bold">Couldn't join</h1>
            <p className="mt-1 text-sm text-gray-500">{message}</p>
            <Link href="/" className="mt-5 inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
              Go to the map
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
