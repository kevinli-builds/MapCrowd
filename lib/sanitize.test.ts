import { describe, it, expect } from 'vitest'
import { safeColor, escapeHtml, safeHttpUrl } from './sanitize'

describe('safeColor', () => {
  it('passes through valid hex colors', () => {
    expect(safeColor('#fff')).toBe('#fff')
    expect(safeColor('#6366f1')).toBe('#6366f1')
    expect(safeColor('  #AABBCC  ')).toBe('#AABBCC')
  })
  it('falls back on non-hex / injection attempts', () => {
    expect(safeColor('red')).toBe('#6366f1')
    expect(safeColor('#fff;background:url(x)')).toBe('#6366f1')
    expect(safeColor('"><script>')).toBe('#6366f1')
    expect(safeColor(null)).toBe('#6366f1')
    expect(safeColor(undefined)).toBe('#6366f1')
  })
  it('honors a custom fallback', () => {
    expect(safeColor('nope', '#000')).toBe('#000')
  })
})

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)>`)).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    )
    expect(escapeHtml(`a&b"c'd`)).toBe('a&amp;b&quot;c&#39;d')
  })
  it('handles null/undefined as empty string', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('safeHttpUrl', () => {
  it('allows http(s) urls', () => {
    expect(safeHttpUrl('https://example.com')).toBe('https://example.com')
    expect(safeHttpUrl('HTTP://example.com')).toBe('HTTP://example.com')
  })
  it('blocks dangerous schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html,<script>')).toBeNull()
    expect(safeHttpUrl('/relative')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
  })
})
