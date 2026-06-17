import type { TravelMode } from '@/lib/types'
import { supabase } from '@/lib/supabase'

// Snapped-path routing via the /api/route proxy (OpenRouteService server-side).
// Returns an ordered [lat,lng] polyline, or null on any failure so callers can
// fall back to straight lines.

const cache = new Map<string, [number, number][]>()

const sig = (coords: [number, number][], mode: TravelMode) =>
  mode + '|' + coords.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(';')

export async function fetchRouteGeometry(
  coords: [number, number][],
  mode: TravelMode,
  signal?: AbortSignal,
): Promise<[number, number][] | null> {
  if (coords.length < 2) return null
  const key = sig(coords, mode)
  const hit = cache.get(key)
  if (hit) return hit
  try {
    // Only signed-in route owners recompute geometry; send the JWT so the
    // (auth-gated) proxy accepts the request.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { console.warn('[route] no session — straight lines'); return null }
    const res = await fetch('/api/route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ coordinates: coords, profile: mode }),
      signal,
    })
    if (!res.ok) {
      const info = await res.json().catch(() => ({})) as { reason?: string; detail?: string }
      console.warn(
        `[route] proxy ${res.status}` +
        (res.status === 503 ? ' — ORS_API_KEY not set in this env' :
         res.status === 401 ? ` — auth rejected (${info.reason ?? '?'}${info.detail ? ': ' + info.detail : ''})` :
         res.status === 502 ? ' — ORS refused this route (too far / unroutable for the mode?)' : '') +
        '; straight lines',
      )
      return null
    }
    const data = (await res.json()) as { geometry?: [number, number][] }
    if (!Array.isArray(data.geometry) || data.geometry.length < 2) { console.warn('[route] empty geometry'); return null }
    cache.set(key, data.geometry)
    return data.geometry
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') console.warn('[route] request error', e)
    return null
  }
}

export const TRAVEL_MODES: { id: TravelMode; label: string; emoji: string }[] = [
  { id: 'foot-walking', label: 'Walk', emoji: '🚶' },
  { id: 'foot-hiking', label: 'Hike', emoji: '🥾' },
  { id: 'cycling-regular', label: 'Bike', emoji: '🚴' },
  { id: 'driving-car', label: 'Drive', emoji: '🚗' },
]
