import { describe, expect, it } from 'vitest'
import { iconVersion, shareDescription } from './siteSettings'

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

// A shared link says the home page's big line and the line under it (the
// user, Nov 4), instead of a Description kept apart from them.
describe('shareDescription', () => {
  const words = (desktopHeroHeadline: string, desktopHeroSubhead: string, mission = 'The old description') => ({ desktopHeroHeadline, desktopHeroSubhead, mission })

  it('is the big line, then the line under it, as two sentences', () => {
    expect(shareDescription(words('Your guide to Jewish Philadelphia', 'Kept current by you'))).toBe('Your guide to Jewish Philadelphia. Kept current by you')
  })

  it('adds no full stop after a big line that already ends in one', () => {
    expect(shareDescription(words('Your guide!', 'Kept current by you'))).toBe('Your guide! Kept current by you')
    expect(shareDescription(words('Your guide.', 'Kept current by you'))).toBe('Your guide. Kept current by you')
  })

  it('is either line alone when the other is empty', () => {
    expect(shareDescription(words(' Your guide ', ''))).toBe('Your guide')
    expect(shareDescription(words('', 'Kept current by you'))).toBe('Kept current by you')
  })

  it('falls back to the old description only when both are empty', () => {
    expect(shareDescription(words(' ', ''))).toBe('The old description')
  })
})
