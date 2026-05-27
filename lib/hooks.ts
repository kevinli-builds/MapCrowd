import { useState, useEffect } from 'react'

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` ms
 * of inactivity.  The pending timer is cancelled automatically on cleanup,
 * so there are no leaked timers or stale-closure issues.
 *
 * @example
 *   const debouncedQuery = useDebounce(query, DEBOUNCE_MS.pinSearch)
 *   useEffect(() => {
 *     if (!debouncedQuery) return
 *     // fire the network request here
 *   }, [debouncedQuery])
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
