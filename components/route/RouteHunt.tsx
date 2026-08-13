'use client'

import { useEffect, useState } from 'react'
import { Navigation, Loader2, Trophy, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { distanceMeters } from '@/lib/geo'

const CHECKIN_RADIUS_M = 75

interface HuntStop {
  id: string
  lat: number
  lng: number
  title: string
}

interface RouteHuntProps {
  routeId: string
  stops: HuntStop[]
  currentUserId: string
}

/**
 * Scavenger-hunt progress for a route (§4 D2). Tapping "I'm here" reads GPS and
 * checks you in at the nearest stop within ~75m (client-side distance rule), writing
 * a route_checkins row (own-rows RLS, migration 45). Shows a progress bar and a
 * finisher moment. The distance gate is a game rule, not a security boundary.
 */
export default function RouteHunt({ routeId, stops, currentUserId }: RouteHuntProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('route_checkins')
      .select('pin_id')
      .eq('route_id', routeId)
      .eq('user_id', currentUserId)
      .then(({ data }) => {
        if (cancelled) return
        if (data) setCheckedIds(new Set(data.map((r) => r.pin_id as string)))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [routeId, currentUserId])

  const done = checkedIds.size
  const total = stops.length
  const complete = done >= total && total > 0

  const checkIn = () => {
    if (busy || complete) return
    if (!navigator.geolocation) { setMessage('Location isn’t available on this device.'); return }
    setBusy(true)
    setMessage(null)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        // Nearest not-yet-checked stop.
        let nearest: HuntStop | null = null
        let nearestM = Infinity
        for (const s of stops) {
          if (checkedIds.has(s.id)) continue
          const m = distanceMeters(coords.latitude, coords.longitude, s.lat, s.lng)
          if (m < nearestM) { nearestM = m; nearest = s }
        }
        if (!nearest) { setBusy(false); return }
        if (nearestM > CHECKIN_RADIUS_M) {
          setMessage(`Not close enough yet — nearest stop is ${Math.round(nearestM)} m away.`)
          setBusy(false)
          return
        }
        const { error } = await supabase.from('route_checkins').insert({
          user_id: currentUserId, route_id: routeId, pin_id: nearest.id,
        })
        if (!error) {
          setCheckedIds((prev) => new Set(prev).add(nearest!.id))
          setMessage(`Checked in at “${nearest.title}”! ✅`)
        } else {
          setMessage('Could not check in — try again.')
        }
        setBusy(false)
      },
      (err) => {
        setMessage(err.code === 1 ? 'Location access denied.' : 'Couldn’t get your location.')
        setBusy(false)
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  if (loading || total < 2) return null

  return (
    <div className={`rounded-xl border p-3 ${complete ? 'border-amber-400/50 bg-amber-500/10' : 'border-gray-200 bg-gray-50'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600">
          {complete ? <Trophy className="h-3.5 w-3.5 text-amber-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />}
          {complete ? 'Hunt complete!' : 'Scavenger hunt'}
        </span>
        <span className="text-xs font-medium text-gray-500">{done}/{total} stops</span>
      </div>

      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all ${complete ? 'bg-amber-500' : 'bg-indigo-500'}`}
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>

      {complete ? (
        <p className="text-center text-xs text-amber-700">You visited every stop — nice work! 🏆</p>
      ) : (
        <button
          onClick={checkIn}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          I'm here — check in
        </button>
      )}

      {message && <p className="mt-2 text-center text-xs text-gray-500">{message}</p>}
    </div>
  )
}
