'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { ArrowLeft, Bookmark, BookmarkCheck, Lock, MapPin, Search, Loader2, Compass } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Community } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type SortOption = 'pins' | 'name' | 'newest'

// ── Community card ────────────────────────────────────────────────────────────

function CommunityCard({
  community,
  pinCount,
  subscribed,
  onToggleSubscribe,
  subscribing,
}: {
  community: Community
  pinCount: number
  subscribed: boolean
  onToggleSubscribe: (id: string) => void
  subscribing: boolean
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-colors hover:border-gray-200">
      {/* Colored header */}
      <div
        className="flex items-center justify-center py-8"
        style={{ backgroundColor: community.color + '22', borderBottom: `2px solid ${community.color}40` }}
      >
        <span className="text-5xl">{community.icon}</span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="font-semibold text-gray-900 leading-tight">{community.name}</h2>
          {community.is_private && (
            <Lock className="h-3 w-3 shrink-0 text-gray-500" aria-label="Private community" />
          )}
        </div>

        {community.description ? (
          <p className="mb-3 text-sm text-gray-500 line-clamp-2 flex-1">{community.description}</p>
        ) : (
          <p className="mb-3 text-sm italic text-gray-700 flex-1">No description</p>
        )}

        {/* Stats */}
        <div className="mb-4 flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin className="h-3.5 w-3.5" />
          <span>{pinCount} {pinCount === 1 ? 'pin' : 'pins'}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onToggleSubscribe(community.id)}
            disabled={subscribing}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all disabled:opacity-50 ${
              subscribed
                ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-500'
                : 'border-gray-200 text-gray-600 hover:border-indigo-500 hover:bg-indigo-600/10 hover:text-indigo-700'
            }`}
          >
            {subscribing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : subscribed ? (
              <><BookmarkCheck className="h-3.5 w-3.5" /> Subscribed</>
            ) : (
              <><Bookmark className="h-3.5 w-3.5" /> Subscribe</>
            )}
          </button>
          <Link
            href={`/c/${community.slug}`}
            className="flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-700"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [user, setUser] = useState<User | null>(null)
  const [communities, setCommunities] = useState<Community[]>([])
  const [pinCounts, setPinCounts] = useState<Map<string, number>>(new Map())
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set())
  const [subscribingId, setSubscribingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOption>('pins')

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const [
        { data: { session } },
        { data: communityData },
        { data: pinData },
      ] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from('communities')
          .select('*')
          .eq('is_private', false)
          .order('name'),
        supabase
          .from('pins')
          .select('community_id')
          .eq('status', 'approved')
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
      ])

      setCommunities((communityData ?? []) as Community[])

      // Count pins per community
      const counts = new Map<string, number>()
      for (const { community_id } of pinData ?? []) {
        counts.set(community_id, (counts.get(community_id) ?? 0) + 1)
      }
      setPinCounts(counts)

      // Load subscriptions if logged in
      if (session?.user) {
        setUser(session.user)
        const { data: subs } = await supabase
          .from('community_subscriptions')
          .select('community_id')
          .eq('user_id', session.user.id)
        setSubscribedIds(new Set((subs ?? []).map((s) => s.community_id)))
      }

      setLoading(false)
    }

    init()

    // Keep auth in sync (e.g. OAuth redirect back to this page)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const { data: subs } = await supabase
          .from('community_subscriptions')
          .select('community_id')
          .eq('user_id', session.user.id)
        setSubscribedIds(new Set((subs ?? []).map((s) => s.community_id)))
      } else {
        setSubscribedIds(new Set())
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Subscribe / unsubscribe ─────────────────────────────────────────────────

  const handleToggleSubscribe = async (communityId: string) => {
    if (!user) {
      // Trigger Google OAuth and come back here
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
      })
      return
    }

    setSubscribingId(communityId)
    if (subscribedIds.has(communityId)) {
      await supabase
        .from('community_subscriptions')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', user.id)
      setSubscribedIds((prev) => { const n = new Set(prev); n.delete(communityId); return n })
    } else {
      await supabase
        .from('community_subscriptions')
        .insert({ community_id: communityId, user_id: user.id })
      setSubscribedIds((prev) => new Set([...prev, communityId]))
    }
    setSubscribingId(null)
  }

  // ── Filter + sort ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = q
      ? communities.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.description ?? '').toLowerCase().includes(q)
        )
      : [...communities]

    if (sort === 'pins') {
      list.sort((a, b) => (pinCounts.get(b.id) ?? 0) - (pinCounts.get(a.id) ?? 0))
    } else if (sort === 'newest') {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    // 'name' → already sorted from DB

    return list
  }, [communities, pinCounts, query, sort])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to map
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20">
              <Compass className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Discover Communities</h1>
              <p className="text-sm text-gray-500">
                {loading ? 'Loading…' : `${communities.length} public ${communities.length === 1 ? 'community' : 'communities'}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="border-b border-gray-200 bg-white/50">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search communities…"
              className="w-full rounded-lg border border-gray-200 bg-gray-100 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
            {(['pins', 'name', 'newest'] as SortOption[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  sort === s
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {s === 'pins' ? 'Most pins' : s === 'newest' ? 'Newest' : 'A–Z'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Community grid */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading communities…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-lg font-medium text-gray-600">No communities found</p>
            {query && (
              <p className="mt-1 text-sm text-gray-400">
                Try a different search term
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                pinCount={pinCounts.get(community.id) ?? 0}
                subscribed={subscribedIds.has(community.id)}
                onToggleSubscribe={handleToggleSubscribe}
                subscribing={subscribingId === community.id}
              />
            ))}
          </div>
        )}

        {!loading && !user && (
          <p className="mt-8 text-center text-xs text-gray-400">
            Sign in to subscribe to communities — your subscriptions sync to the map.
          </p>
        )}
      </div>
    </div>
  )
}
