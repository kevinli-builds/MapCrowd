'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { ArrowLeft, MapPin, ThumbsUp, Users, AlertCircle, Loader2, UserPlus, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Profile, Pin } from '@/lib/types'
import { timeAgo, avatarColor, voteColorClass, formatVoteCount } from '@/lib/utils'
import Avatar from '@/components/Avatar'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const params = useParams()
  const username = params?.username as string

  const [profile, setProfile] = useState<Profile | null>(null)
  const [pins, setPins] = useState<Pin[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // ── Follow state ──────────────────────────────────────────────────────────
  const [viewer, setViewer] = useState<User | null>(null)
  const [following, setFollowing] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [followBusy, setFollowBusy] = useState(false)
  const isOwnProfile = !!viewer && !!profile && viewer.id === profile.id

  const load = useCallback(async () => {
    if (!username) return
    setLoading(true)

    // 1. Fetch profile by username
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (!prof) { setNotFound(true); setLoading(false); return }
    setProfile(prof)

    // 2. Fetch their approved, non-expired pins (sorted by vote score)
    const now = new Date().toISOString()
    const { data: pinData } = await supabase
      .from('pins')
      .select('*, community:communities(id,name,color,icon,slug)')
      .eq('user_id', prof.id)
      .eq('status', 'approved')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('vote_count', { ascending: false })
      .limit(50)

    if (pinData) setPins(pinData)
    setLoading(false)
  }, [username])

  useEffect(() => { load() }, [load])

  // Load follow counts + the viewer's follow status once the profile is known
  useEffect(() => {
    if (!profile) return
    let cancelled = false

    const loadFollowState = async () => {
      const [{ count: followers }, { count: followings }, { data: { session } }] =
        await Promise.all([
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', profile.id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
          supabase.auth.getSession(),
        ])
      if (cancelled) return
      setFollowerCount(followers ?? 0)
      setFollowingCount(followings ?? 0)
      setViewer(session?.user ?? null)

      if (session?.user && session.user.id !== profile.id) {
        const { data } = await supabase
          .from('follows')
          .select('followee_id')
          .eq('follower_id', session.user.id)
          .eq('followee_id', profile.id)
          .maybeSingle()
        if (!cancelled) setFollowing(!!data)
      }
    }
    loadFollowState()
    return () => { cancelled = true }
  }, [profile])

  const toggleFollow = async () => {
    if (!profile) return
    if (!viewer) {
      // Sign in with Google, then come back to this profile
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
      })
      return
    }
    if (viewer.id === profile.id || followBusy) return
    setFollowBusy(true)
    if (following) {
      setFollowing(false)
      setFollowerCount((c) => Math.max(0, c - 1))
      await supabase.from('follows').delete()
        .eq('follower_id', viewer.id).eq('followee_id', profile.id)
    } else {
      setFollowing(true)
      setFollowerCount((c) => c + 1)
      await supabase.from('follows').insert({ follower_id: viewer.id, followee_id: profile.id })
    }
    setFollowBusy(false)
  }

  // ── Derived stats (memoised — only recompute when pins changes) ─────────
  const { totalVotes, communityCount, topCommunities } = useMemo(() => {
    const votes = pins.reduce((sum, p) => sum + p.vote_count, 0)
    const commCount = new Set(pins.map((p) => p.community_id)).size

    const commPinCounts = pins.reduce((acc, p) => {
      acc[p.community_id] = (acc[p.community_id] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    const top = Object.entries(commPinCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([id, count]) => ({
        id,
        count,
        comm: pins.find((p) => p.community_id === id)?.community,
      }))
      .filter((t) => t.comm)

    return { totalVotes: votes, communityCount: commCount, topCommunities: top }
  }, [pins])

  // ── Loading / not-found states ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50 text-gray-600">
        <AlertCircle className="h-12 w-12 text-gray-400" />
        <p className="text-lg font-medium">User not found</p>
        <Link href="/" className="text-indigo-600 hover:underline">← Back to map</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">

      {/* ── Profile header ───────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 pt-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to map
          </Link>
        </div>

        <div className="mx-auto max-w-2xl px-4 py-8">
          {/* Avatar + name */}
          <div className="flex items-center gap-5">
            <Avatar
              src={profile.avatar_url}
              username={profile.username}
              userId={profile.id}
              className="h-20 w-20 rounded-2xl text-3xl ring-4 ring-gray-200"
            />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{profile.username}</h1>
              <p className="mt-1 text-sm text-gray-500">
                Joined{' '}
                {new Date(profile.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>

            {/* Follow button — hidden on your own profile */}
            {!isOwnProfile && (
              <button
                onClick={toggleFollow}
                disabled={followBusy}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                  following
                    ? 'border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-500'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'
                }`}
              >
                {followBusy
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : following
                    ? <><UserCheck className="h-4 w-4" /> Following</>
                    : <><UserPlus className="h-4 w-4" /> Follow</>}
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="mt-6 flex flex-wrap gap-8">
            <div>
              <p className="text-2xl font-bold text-gray-900">{pins.length}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3 w-3" /> Pins
              </p>
            </div>
            <div>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  totalVotes > 0 ? 'text-green-600' : totalVotes < 0 ? 'text-red-500' : 'text-gray-900'
                }`}
              >
                {totalVotes > 0 ? `+${totalVotes}` : totalVotes}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <ThumbsUp className="h-3 w-3" /> Net votes
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{communityCount}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <Users className="h-3 w-3" /> Communities
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{followerCount}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <UserCheck className="h-3 w-3" /> Followers
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{followingCount}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <UserPlus className="h-3 w-3" /> Following
              </p>
            </div>
          </div>

          {/* Top community chips */}
          {topCommunities.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {topCommunities.map(({ id, count, comm }) =>
                comm ? (
                  <Link
                    key={id}
                    href={`/c/${comm.slug}`}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-75"
                    style={{
                      backgroundColor: comm.color + '22',
                      border: `1px solid ${comm.color}55`,
                      color: '#fff',
                    }}
                  >
                    {comm.icon} {comm.name}
                    <span className="ml-1 text-gray-500">({count})</span>
                  </Link>
                ) : null
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Pin feed ─────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
          <MapPin className="h-4 w-4" />
          Pins
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{pins.length}</span>
        </h2>

        {pins.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
            <MapPin className="mx-auto mb-3 h-8 w-8 text-gray-700" />
            <p className="text-gray-500">No pins yet.</p>
            <Link
              href="/"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Go to the map
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {pins.map((pin) => {
              const voteColor = voteColorClass(pin.vote_count)
              const comm = pin.community

              return (
                <li
                  key={pin.id}
                  className="rounded-xl border border-gray-200 bg-gray-100/30 p-4 transition-colors hover:border-gray-200 hover:bg-gray-100/60"
                >
                  <div className="flex items-start gap-3">
                    {/* Vote score */}
                    <div className={`shrink-0 text-center ${voteColor}`}>
                      <ThumbsUp className="mx-auto h-4 w-4 mb-0.5" />
                      <span className="block text-sm font-bold tabular-nums">
                        {formatVoteCount(pin.vote_count)}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-snug text-gray-900">{pin.title}</h3>
                      {pin.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{pin.description}</p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                        {/* Community chip */}
                        {comm && (
                          <Link
                            href={`/c/${comm.slug}`}
                            className="flex items-center gap-1 transition-colors hover:text-gray-600"
                          >
                            <span
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                              style={{ backgroundColor: comm.color + '33', border: `1px solid ${comm.color}` }}
                            >
                              {comm.icon}
                            </span>
                            {comm.name}
                          </Link>
                        )}
                        <span>{timeAgo(pin.created_at)}</span>
                        <span className="font-mono">{pin.lat.toFixed(3)}, {pin.lng.toFixed(3)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
