'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Download, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CommunityWrapped } from '@/lib/types'
import { wrappedStats, wrappedHeadline } from '@/lib/wrapped'
import { safeColor } from '@/lib/sanitize'

const W = 1080
const H = 1350

// Darken a #hex colour toward black by factor f (0..1) for the gradient's foot.
function darken(hex: string, f: number): string {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = Math.round(parseInt(n.slice(0, 2), 16) * f)
  const g = Math.round(parseInt(n.slice(2, 4), 16) * f)
  const b = Math.round(parseInt(n.slice(4, 6), 16) * f)
  return `rgb(${r}, ${g}, ${b})`
}

function drawCard(canvas: HTMLCanvasElement, w: CommunityWrapped) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const color = safeColor(w.color) // guard the DB colour before it hits a canvas fill

  // Background gradient in the community's colour.
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, color)
  grad.addColorStop(1, darken(color, 0.45))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  const cx = W / 2

  // Icon + name + subtitle.
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = '150px "Segoe UI Emoji", sans-serif'
  ctx.fillText(w.icon || '📍', cx, 250)

  ctx.font = 'bold 76px system-ui, sans-serif'
  ctx.fillText(fit(ctx, w.name, W - 120, 76), cx, 370)

  ctx.font = '600 34px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText('Y E A R   I N   R E V I E W', cx, 440)

  // Headline (top pin / event).
  ctx.font = '36px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(fit(ctx, wrappedHeadline(w), W - 120, 36), cx, 545)

  // Stat blocks — big value over a small label, evenly spaced.
  const stats = wrappedStats(w)
  const top = 660
  const gap = (H - 180 - top) / stats.length
  stats.forEach((s, i) => {
    const y = top + gap * i + gap / 2
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 84px system-ui, sans-serif'
    ctx.fillText(s.value, cx, y)
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '30px system-ui, sans-serif'
    ctx.fillText(s.label.toUpperCase(), cx, y + 44)
  })

  // Footer.
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '600 34px system-ui, sans-serif'
  ctx.fillText('🗺️ MapCrowd', cx, H - 70)
}

// Shrink the font until the text fits within maxWidth; returns the (possibly
// unchanged) string and sets the ctx font to the fitted size.
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number): string {
  let px = startPx
  const family = ctx.font.replace(/^.*?\d+px\s*/, '')
  const weight = ctx.font.match(/^(bold|\d00)\s/)?.[1] ?? ''
  while (px > 24 && ctx.measureText(text).width > maxWidth) {
    px -= 4
    ctx.font = `${weight} ${px}px ${family}`.trim()
  }
  return text
}

interface CommunityWrappedProps {
  communityId: string
  onClose: () => void
}

/**
 * Community "Wrapped" (§4 D6) — a shareable portrait story card rendered to a canvas
 * from the mod-gated get_community_wrapped RPC, with a PNG download. Pure card copy
 * (stat lines / headline) lives in lib/wrapped.ts; this does the drawing + fetch.
 */
export default function CommunityWrappedCard({ communityId, onClose }: CommunityWrappedProps) {
  const [data, setData] = useState<CommunityWrapped | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_community_wrapped', { p_community_id: communityId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) setError(error.message.replace(/^.*?:\s*/, '') || 'Could not build your Wrapped')
      else setData(data as CommunityWrapped)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [communityId])

  useEffect(() => {
    if (!data || !canvasRef.current) return
    drawCard(canvasRef.current, data)
    setPreviewUrl(canvasRef.current.toDataURL('image/png'))
  }, [data])

  const download = () => {
    const c = canvasRef.current
    if (!c) return
    c.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(data?.name ?? 'community').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-wrapped.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div
      className="fixed inset-0 z-[1350] flex items-end bg-black/60 sm:items-center sm:justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-sm sm:rounded-2xl" style={{ maxHeight: '92dvh' }}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="font-semibold text-gray-900">Community Wrapped</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Building your Wrapped…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-red-700">{error}</p>
            </div>
          ) : (
            <>
              {/* Hidden full-res canvas; the preview <img> is the same pixels, scaled by CSS. */}
              <canvas ref={canvasRef} width={W} height={H} className="hidden" />
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Community Wrapped card" className="mx-auto w-full max-w-xs rounded-xl shadow-lg" />
              )}
              <button
                onClick={download}
                disabled={!previewUrl}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Download to share
              </button>
              <p className="mt-2 text-center text-xs text-gray-400">A square-ish story image, perfect for socials.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
