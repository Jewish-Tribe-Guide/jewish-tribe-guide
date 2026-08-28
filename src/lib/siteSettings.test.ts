import { describe, expect, it } from 'vitest'
import { iconVersion } from './siteSettings'

// The home-screen icon is generated from the admin's logo, and its URL used to
// be constant — so uploading a new logo left phones showing the old icon
// indefinitely, because nothing about the URL told anything to refetch.
describe('iconVersion', () => {
  it('changes when the logo changes', () => {
    expect(iconVersion('https://x.test/a.png')).not.toBe(iconVersion('https://x.test/b.png'))
  })

  it('is stable for the same logo, so caching still works across builds', () => {
    expect(iconVersion('https://x.test/a.png')).toBe(iconVersion('https://x.test/a.png'))
  })

  it('is URL-safe and short enough to read in a query string', () => {
    expect(iconVersion('https://x.test/a.png')).toMatch(/^[a-z0-9]{1,12}-\d+$/)
  })

  it('handles no logo without producing an empty query value', () => {
    for (const v of [null, undefined, '', '   ']) expect(iconVersion(v)).toMatch(/^0-\d+$/)
  })

  // The reason the token has a second half at all. Keying only on the logo
  // meant a change to how the icon is DRAWN — the inset, the trim, the padding
  // colour — left the URL identical, so the CDN and every phone kept serving
  // the old PNG and the change never became visible however often it shipped.
  it('carries a render version, so redrawing an unchanged logo still busts caches', () => {
    const token = iconVersion('https://x.test/a.png')
    expect(token).toMatch(/-\d+$/)
    expect(token.split('-')[1]).not.toBe('')
  })

  it('ignores surrounding whitespace, which the admin field can carry', () => {
    expect(iconVersion('  https://x.test/a.png  ')).toBe(iconVersion('https://x.test/a.png'))
  })
})
