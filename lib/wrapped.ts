/**
 * Pure helpers for the community "Wrapped" card (§4 D6) — the stat lines + headline
 * the canvas draws. Kept out of the component so the wording/formatting is
 * unit-tested (wrapped.test.ts); the numbers come from get_community_wrapped.
 */
import type { CommunityWrapped } from './types'

export interface WrappedStat {
  label: string
  value: string
}

/** Truncate a title for the fixed-width card. */
export function truncTitle(title: string, max = 38): string {
  const t = title.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** The big stat lines shown on the card (subscriber growth folded in; routes only if any). */
export function wrappedStats(w: CommunityWrapped): WrappedStat[] {
  const stats: WrappedStat[] = [
    { label: 'Pins on the map', value: String(w.total_pins) },
    { label: 'Dropped this year', value: String(w.pins_this_year) },
    { label: 'Contributors', value: String(w.contributors) },
    {
      label: 'Subscribers',
      value: w.new_subscribers_year > 0
        ? `${w.subscriber_count} (+${w.new_subscribers_year})`
        : String(w.subscriber_count),
    },
  ]
  if (w.route_count > 0) stats.push({ label: 'Public routes', value: String(w.route_count) })
  return stats
}

/** One-line highlight for under the title: the top pin, or a gentle fallback. */
export function wrappedHeadline(w: CommunityWrapped): string {
  if (w.top_pin) {
    const sign = w.top_pin.vote_count >= 0 ? '+' : ''
    return `★ Top pin: “${truncTitle(w.top_pin.title)}” (${sign}${w.top_pin.vote_count})`
  }
  if (w.top_event) return `📅 Biggest event: “${truncTitle(w.top_event.title)}” · ${w.top_event.going} going`
  return 'A year on the map'
}
