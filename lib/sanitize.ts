/**
 * Security-critical sanitizers for DB-sourced values that reach a raw-HTML or
 * navigational sink. These are deliberately pure + centralized so they can be
 * unit-tested (see sanitize.test.ts) and reused, rather than re-implemented
 * inline per component where a subtle divergence becomes an XSS hole.
 *
 *   • safeColor   — community.color is interpolated into Leaflet divIcon HTML.
 *   • escapeHtml  — community.icon (and any other string) interpolated there.
 *   • safeHttpUrl — pins.url is rendered as an <a href>; block javascript:/data:.
 */

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/

/** Return the color only if it's a plain hex literal; otherwise a safe default. */
export function safeColor(c: string | null | undefined, fallback = '#6366f1'): string {
  return c && COLOR_RE.test(c.trim()) ? c.trim() : fallback
}

/** Escape the 5 HTML-significant characters so a string can't inject markup. */
export function escapeHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;' : '&#39;'
  )
}

/** Return the URL only if it's an http(s) link; otherwise null (blocks javascript:/data:). */
export function safeHttpUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}
