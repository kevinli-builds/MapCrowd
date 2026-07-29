/**
 * Pure presentation helpers for the mod community-insights tab (§9 C1) — kept out
 * of the component so the chart scaling + latency wording are unit-tested
 * (insights.test.ts). The numbers themselves come from the get_community_insights
 * RPC (migration 40); nothing here touches the network.
 */

/**
 * Bar heights (px) for the weekly pin-trend chart, scaled to the busiest week.
 * A non-zero week never renders shorter than `minPx` so a single pin is still
 * visible; an empty week is 0.
 */
export function weeklyBars(weekly: { count: number }[], maxHeightPx = 40, minPx = 3): number[] {
  const max = Math.max(1, ...weekly.map((w) => w.count))
  return weekly.map((w) =>
    w.count <= 0 ? 0 : Math.max(minPx, Math.round((w.count / max) * maxHeightPx))
  )
}

/** Human label for how long the oldest pending pin has waited. */
export function formatPendingLatency(hours: number | null): string {
  if (hours == null) return 'Clear'
  if (hours < 1) return '<1h'
  if (hours < 24) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

/** "+N" growth badge, or empty string when there was no growth in the window. */
export function growthBadge(delta: number): string {
  return delta > 0 ? `+${delta}` : ''
}
