'use client'

import { useState, useRef, useEffect } from 'react'
import { Layers, Check } from 'lucide-react'
import type { MapStyle } from '@/components/MapInner'

const OPTIONS: { value: MapStyle; label: string; swatch: string }[] = [
  { value: 'light',     label: 'Light',     swatch: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
  { value: 'dark',      label: 'Dark',      swatch: 'linear-gradient(135deg,#1e293b,#0f172a)' },
  { value: 'satellite', label: 'Satellite', swatch: 'linear-gradient(135deg,#365314,#1e3a5f)' },
]

interface MapStyleSwitcherProps {
  value: MapStyle
  onChange: (style: MapStyle) => void
}

export default function MapStyleSwitcher({ value, onChange }: MapStyleSwitcherProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      {/* Popover — opens upward so it never collides with the bottom nav */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-36 overflow-hidden rounded-xl border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur-sm">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-800 ${
                value === opt.value ? 'text-white' : 'text-gray-400'
              }`}
            >
              <span className="h-4 w-4 shrink-0 rounded border border-white/20" style={{ background: opt.swatch }} />
              <span className="flex-1">{opt.label}</span>
              {value === opt.value && <Check className="h-3.5 w-3.5 text-indigo-400" />}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        title="Map style"
        aria-label="Change map style"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-700 bg-gray-900 text-gray-300 shadow-lg transition-colors hover:border-indigo-500 hover:text-white"
      >
        <Layers className="h-4 w-4" />
      </button>
    </div>
  )
}
