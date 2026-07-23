import { useEffect, useState } from 'react'
import type { MapStyle } from '@/components/MapInner'

const STORAGE_KEY = 'mapStyle'

/**
 * Map tile style (light / dark / satellite), persisted to localStorage.
 * First of the app/page.tsx hook extractions (see OPUS_BRIEF §7).
 */
export function useMapStyle() {
  const [mapStyle, setMapStyle] = useState<MapStyle>('light')

  // Load the persisted choice once on mount.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'satellite') setMapStyle(saved)
  }, [])

  const changeMapStyle = (style: MapStyle) => {
    setMapStyle(style)
    localStorage.setItem(STORAGE_KEY, style)
  }

  return { mapStyle, changeMapStyle }
}
