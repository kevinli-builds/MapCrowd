'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Users, MapPin, ThumbsUp, Calendar, UserPlus } from 'lucide-react'
import { Pin } from '@/lib/types'
import { timeAgo } from '@/lib/utils'
import Avatar from '@/components/Avatar'

interface FollowingPanelProps {
  pins: Pin[]
  followedUserIds: Set<string>
  /** Fly to + open the pin */
  onSelectPin: (pin: Pin) => void
  signedIn: boolean
  onSignIn: () => void
}

export default function FollowingPanel({
  pins,
  followedUserIds,
  onSelectPin,
  signedIn,
  onSignIn,
}: FollowingPanelProps) {
  // Most-recent-first feed of pins from people the user follows
  const feed = useMemo(
    () =>
      pins
        .filter((p) => p.user_id && followedUserIds.has(p.user_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [pins, followedUserIds]
  )

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!signedIn) {
    return (
      <div className="px-3 py-10 text-center">
        <Users className="mx-auto mb-3 h-8 w-8 text-gray-700" />
        <p className="text-sm font-medium text-gray-400">Follow people you like</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-xs text-gray-600">
          Sign in, then follow other mappers to see their latest pins here.
        </p>
        <button
          onClick={onSignIn}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Sign in
        </button>
      </div>
    )
  }

  if (followedUserIds.size === 0) {
    return (
      <div className="px-3 py-10 text-center">
        <UserPlus className="mx-auto mb-3 h-8 w-8 text-gray-700" />
        <p className="text-sm font-medium text-gray-400">You&apos;re not following anyone yet</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-xs text-gray-600">
          Open any pin and tap the author, or visit a profile, to follow them.
          Their pins will show up here and get a ⭐ on the map.
        </p>
      </div>
    )
  }

  if (feed.length === 0) {
    return (
      <div className="px-3 py-10 text-center">
        <MapPin className="mx-auto mb-3 h-8 w-8 text-gray-700" />
        <p className="text-sm font-medium text-gray-400">No recent activity</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-xs text-gray-600">
          The people you follow haven&apos;t dropped any pins lately. Check back soon!
        </p>
      </div>
    )
  }

  // ── Feed ──────────────────────────────────────────────────────────────────
  return (
    <ul className="space-y-1.5">
      {feed.map((pin) => {
        const comm = pin.community
        const voteColor =
          pin.vote_count > 0 ? 'text-green-400' : pin.vote_count < 0 ? 'text-red-400' : 'text-gray-600'
        return (
          <li key={pin.id}>
            <button
              onClick={() => onSelectPin(pin)}
              className="flex w-full items-start gap-2.5 rounded-lg border border-gray-800 bg-gray-800/30 p-2.5 text-left transition-colors hover:border-gray-700 hover:bg-gray-800/60"
            >
              <Avatar
                src={pin.profile?.avatar_url}
                username={pin.profile?.username ?? '?'}
                userId={pin.user_id ?? '0'}
                className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-[10px]"
                chars={1}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="truncate font-medium text-gray-300">
                    {pin.profile?.username ?? 'Someone'}
                  </span>
                  <span>·</span>
                  <span className="shrink-0">{timeAgo(pin.created_at)}</span>
                </div>

                <p className="mt-0.5 flex items-center gap-1 truncate text-sm font-medium text-white">
                  {pin.event_date && <Calendar className="h-3 w-3 shrink-0 text-indigo-400" />}
                  {pin.title}
                </p>

                <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                  {comm && (
                    <span
                      className="inline-flex max-w-[8rem] items-center gap-1 truncate rounded-full px-1.5 py-0.5"
                      style={{ backgroundColor: comm.color + '22', color: comm.color }}
                    >
                      <span>{comm.icon}</span>
                      <span className="truncate">{comm.name}</span>
                    </span>
                  )}
                  <span className={`flex items-center gap-0.5 ${voteColor}`}>
                    <ThumbsUp className="h-3 w-3" />
                    {pin.vote_count > 0 ? `+${pin.vote_count}` : pin.vote_count}
                  </span>
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
