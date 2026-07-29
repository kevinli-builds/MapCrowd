'use client'

import { useEffect, useState } from 'react'
import { ImageIcon, Route as RouteIcon, MapPin, Loader2, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { ProfileYearbook } from '@/lib/types'
import { weeklyBars } from '@/lib/insights'

const BAR_MAX_PX = 48

// 'YYYY-MM' → single-letter month label (compact year axis; duplicates are fine).
function monthLetter(ym: string): string {
  return ['', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][Number(ym.slice(5, 7))] ?? ''
}

/**
 * "Your year on MapCrowd" (§9 C2) — shown only on your own profile. A 12-month pin
 * activity chart plus photo/route counts, from the self-only get_my_yearbook RPC
 * (migration 41). Silently renders nothing if the RPC fails so it never breaks the
 * public profile page.
 */
export default function ProfileYearbook() {
  const [data, setData] = useState<ProfileYearbook | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_my_yearbook').then(({ data, error }) => {
      if (cancelled) return
      if (!error && data) setData(data as ProfileYearbook)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-10 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your year…
      </div>
    )
  }
  if (!data) return null

  const bars = weeklyBars(data.monthly, BAR_MAX_PX)
  const peak = Math.max(0, ...data.monthly.map((m) => m.count))
  const nothingYet = data.pins_12mo === 0 && data.photo_count === 0 && data.route_count === 0

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
        <Sparkles className="h-4 w-4 text-indigo-500" />
        Your year
      </h2>

      {nothingYet ? (
        <p className="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-400">
          Your yearbook fills in as you drop pins, add photos, and build routes.
        </p>
      ) : (
        <>
          {/* 12-month pin activity */}
          <div className="mb-5">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-xs text-gray-500">Pins added / month</p>
              <p className="text-xs text-gray-400">{data.pins_12mo} in the last year</p>
            </div>
            {peak === 0 ? (
              <p className="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-400">
                No pins in the last 12 months.
              </p>
            ) : (
              <div className="flex items-end justify-between gap-1.5" style={{ height: BAR_MAX_PX + 18 }}>
                {data.monthly.map((m, i) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <div
                      className="w-full max-w-7 rounded-t bg-indigo-500/80"
                      style={{ height: bars[i] }}
                      title={`${m.month}: ${m.count} pin${m.count === 1 ? '' : 's'}`}
                    />
                    <span className="text-[10px] text-gray-400">{monthLetter(m.month)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lifetime tiles (pins/votes/communities already show in the header above) */}
          <div className="grid grid-cols-3 gap-3">
            <Tile icon={<MapPin className="h-3.5 w-3.5" />} label="Pins / year" value={data.pins_12mo} />
            <Tile icon={<ImageIcon className="h-3.5 w-3.5" />} label="Photos" value={data.photo_count} />
            <Tile icon={<RouteIcon className="h-3.5 w-3.5" />} label="Routes" value={data.route_count} />
          </div>
        </>
      )}
    </section>
  )
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-gray-500">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
    </div>
  )
}
