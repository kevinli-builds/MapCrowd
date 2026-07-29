'use client'

import { useEffect, useState } from 'react'
import { Users, TrendingUp, Inbox, ThumbsUp, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CommunityInsights } from '@/lib/types'
import { weeklyBars, formatPendingLatency, growthBadge } from '@/lib/insights'

interface CommunityInsightsPanelProps {
  communityId: string
}

const BAR_MAX_PX = 44

/**
 * The mod "Insights" tab body (§9 C1): a read-only snapshot answering "is my
 * community alive?" — subscriber growth, recent contributors, the moderation
 * backlog, the pins/week trend, and the top-voted pins. Self-contained: it fetches
 * the mod-gated get_community_insights RPC (migration 40) on mount.
 */
export default function CommunityInsightsPanel({ communityId }: CommunityInsightsPanelProps) {
  const [data, setData] = useState<CommunityInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .rpc('get_community_insights', { p_community_id: communityId })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message.replace(/^.*?:\s*/, '') || 'Could not load insights')
        else setData(data as CommunityInsights)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [communityId])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading insights…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="m-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <p className="text-red-700">{error ?? 'No insights available.'}</p>
      </div>
    )
  }

  const bars = weeklyBars(data.weekly, BAR_MAX_PX)
  const peakWeek = Math.max(0, ...data.weekly.map((w) => w.count))
  const total8w = data.weekly.reduce((n, w) => n + w.count, 0)
  const subGrowth = growthBadge(data.subscribers_30d)

  return (
    <div className="space-y-6 p-5">
      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-gray-500">
            <Users className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Subscribers</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-gray-900">{data.subscriber_count}</span>
            {subGrowth && <span className="text-xs font-semibold text-green-600">{subGrowth} / 30d</span>}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-gray-500">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Contributors</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-gray-900">{data.contributors_30d}</span>
            <span className="text-xs text-gray-400">last 30d</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-gray-500">
            <Inbox className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wider">Queue</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold ${data.pending_count > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {data.pending_count}
            </span>
            <span className="text-xs text-gray-400">
              {data.pending_count > 0 ? `oldest ${formatPendingLatency(data.oldest_pending_hours)}` : 'clear'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Weekly pin trend ── */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Pins added / week</h4>
          <span className="text-xs text-gray-400">{total8w} in 8 weeks</span>
        </div>
        {peakWeek === 0 ? (
          <p className="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-400">
            No pins added in the last 8 weeks.
          </p>
        ) : (
          <div className="flex items-end justify-between gap-1.5" style={{ height: BAR_MAX_PX + 4 }}>
            {data.weekly.map((w, i) => (
              <div key={w.week} className="flex flex-1 flex-col items-center justify-end gap-1">
                <div
                  className="w-full max-w-8 rounded-t bg-indigo-500/80"
                  style={{ height: bars[i] }}
                  title={`Week of ${w.week}: ${w.count} pin${w.count === 1 ? '' : 's'}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Top pins ── */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Top pins</h4>
        {data.top_pins.length === 0 ? (
          <p className="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-400">No pins yet.</p>
        ) : (
          <ul className="space-y-1">
            {data.top_pins.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                <span className="w-4 shrink-0 text-center text-xs font-semibold text-gray-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{p.title}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-gray-500">
                  <ThumbsUp className="h-3 w-3" />
                  {p.vote_count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
