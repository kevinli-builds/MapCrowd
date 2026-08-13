'use client'

import { useEffect, useState } from 'react'
import { Link2, Copy, Check, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { timeAgo } from '@/lib/utils'

interface InviteLinkRow {
  token: string
  expires_at: string | null
  max_uses: number | null
  use_count: number
  created_at: string
}

interface InviteLinksProps {
  communityId: string
  currentUserId: string
}

const EXPIRY_OPTS: { label: string; days: number | null }[] = [
  { label: 'Never expires', days: null },
  { label: 'Expires in 7 days', days: 7 },
  { label: 'Expires in 30 days', days: 30 },
]

/**
 * Invite-link manager (§2) shown in the community settings Members tab: mods create
 * copyable /join/<token> links (optional expiry), see each link's usage, and revoke
 * them. RLS restricts these rows to mods; redemption goes through redeem_invite().
 */
export default function InviteLinks({ communityId, currentUserId }: InviteLinksProps) {
  const [links, setLinks] = useState<InviteLinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expiryDays, setExpiryDays] = useState<number | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('community_invite_links')
      .select('token, expires_at, max_uses, use_count, created_at')
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        if (data) setLinks(data as InviteLinkRow[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [communityId])

  const create = async () => {
    setCreating(true)
    const expires_at = expiryDays ? new Date(Date.now() + expiryDays * 86_400_000).toISOString() : null
    const { data } = await supabase
      .from('community_invite_links')
      .insert({ community_id: communityId, created_by: currentUserId, expires_at })
      .select('token, expires_at, max_uses, use_count, created_at')
      .single()
    if (data) setLinks((prev) => [data as InviteLinkRow, ...prev])
    setCreating(false)
  }

  const revoke = async (token: string) => {
    setLinks((prev) => prev.filter((l) => l.token !== token)) // optimistic
    await supabase.from('community_invite_links').delete().eq('token', token)
  }

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}/join/${token}`)
      setCopied(token)
      setTimeout(() => setCopied((t) => (t === token ? null : t)), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div>
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <Link2 className="h-4 w-4 text-indigo-600" /> Invite links
      </h3>
      <p className="mb-3 text-xs text-gray-500">
        Share a link and anyone who opens it joins instantly — no username needed.
      </p>

      {/* Create */}
      <div className="mb-3 flex items-center gap-2">
        <select
          value={expiryDays ?? ''}
          onChange={(e) => setExpiryDays(e.target.value === '' ? null : Number(e.target.value))}
          className="flex-1 rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
        >
          {EXPIRY_OPTS.map((o) => (
            <option key={o.label} value={o.days ?? ''}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={create}
          disabled={creating}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          New link
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : links.length === 0 ? (
        <p className="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-400">
          No invite links yet — create one to start growing.
        </p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => {
            const expired = l.expires_at != null && new Date(l.expires_at) < new Date()
            const usedUp = l.max_uses != null && l.use_count >= l.max_uses
            const dead = expired || usedUp
            return (
              <li key={l.token} className={`rounded-lg border border-gray-200 p-2.5 ${dead ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                    /join/{l.token.slice(0, 8)}…
                  </code>
                  <button
                    onClick={() => copy(l.token)}
                    title="Copy link"
                    className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-indigo-600"
                  >
                    {copied === l.token ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => revoke(l.token)}
                    title="Revoke link"
                    className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 px-1 text-[11px] text-gray-400">
                  {l.use_count} join{l.use_count === 1 ? '' : 's'}
                  {l.max_uses != null && ` / ${l.max_uses} max`}
                  {' · '}
                  {expired ? 'expired' : l.expires_at ? `expires ${timeAgo(l.expires_at).replace(' ago', '')}` : 'never expires'}
                  {' · created '}{timeAgo(l.created_at)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
