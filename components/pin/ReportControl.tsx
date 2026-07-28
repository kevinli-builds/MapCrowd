'use client'

import { useEffect, useRef, useState } from 'react'
import { Flag, Loader2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// A small "Report" affordance shown to non-mod, non-author viewers on a pin or
// comment. Opens a reason picker and inserts into `reports` (anonymous allowed);
// a trigger denormalises the target's community so mods see it in their queue.

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'wrong_location', label: 'Wrong location' },
  { value: 'other', label: 'Other' },
]

interface ReportControlProps {
  targetType: 'pin' | 'comment'
  targetId: string
  userId: string | null
  /** Icon-only trigger (used inline in the comment list) */
  compact?: boolean
}

export default function ReportControl({ targetType, targetId, userId, compact = false }: ReportControlProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const submit = async (reason: string) => {
    setState('sending')
    const { error } = await supabase.from('reports').insert({
      reporter_id: userId ?? null,
      target_type: targetType,
      target_id: targetId,
      reason,
    })
    setOpen(false)
    setState(error ? 'idle' : 'done')
  }

  if (state === 'done') {
    return (
      <span
        className={
          compact
            ? 'flex items-center gap-1 text-[10px] text-gray-400'
            : 'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-400'
        }
        title="Thanks — a moderator will review this"
      >
        <Check className="h-3 w-3" /> Reported
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={state === 'sending'}
        title="Report to moderators"
        className={
          compact
            ? 'shrink-0 rounded p-0.5 text-gray-700 transition-colors hover:text-amber-500 disabled:opacity-40'
            : 'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-amber-500 disabled:opacity-40'
        }
      >
        {state === 'sending'
          ? <Loader2 className={compact ? 'h-3 w-3 animate-spin' : 'h-3.5 w-3.5 animate-spin'} />
          : <Flag className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />}
        {!compact && <span className="hidden sm:inline">Report</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 py-1 shadow-xl">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Report this {targetType}
          </p>
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => submit(r.value)}
              className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 transition-colors hover:bg-gray-200 hover:text-gray-900"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
