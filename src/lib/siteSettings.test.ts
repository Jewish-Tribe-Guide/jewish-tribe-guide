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
    expect(iconVersion('https://x.test/a.png')).toMatch(/^[a-z0-9]{1,12}$/)
  })

  it('handles no logo without producing an empty query value', () => {
    for (const v of [null, undefined, '', '   ']) expect(iconVersion(v)).toBe('0')
  })

  it('ignores surrounding whitespace, which the admin field can carry', () => {
    expect(iconVersion('  https://x.test/a.png  ')).toBe(iconVersion('https://x.test/a.png'))
  })
})
