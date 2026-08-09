import { describe, expect, it } from 'vitest'
import { looksLikeCommunitySlug } from './configCommunity'

// This value comes from a cookie and is interpolated straight into a redirect
// path in proxy.ts, which runs before any routing. It gets a shape check for
// that reason, not merely for tidiness.
describe('looksLikeCommunitySlug', () => {
  it('accepts ordinary slugs', () => {
    expect(looksLikeCommunitySlug('philly')).toBe(true)
    expect(looksLikeCommunitySlug('baltimore')).toBe(true)
    expect(looksLikeCommunitySlug('new-york')).toBe(true)
    expect(looksLikeCommunitySlug('community2')).toBe(true)
  })

  it('rejects anything that could escape the path segment', () => {
    expect(looksLikeCommunitySlug('../../etc/passwd')).toBe(false)
    expect(looksLikeCommunitySlug('philly/map')).toBe(false)
    expect(looksLikeCommunitySlug('//evil.example.com')).toBe(false)
    expect(looksLikeCommunitySlug('philly?x=1')).toBe(false)
    expect(looksLikeCommunitySlug('philly#frag')).toBe(false)
    expect(looksLikeCommunitySlug('philly ')).toBe(false)
  })

  it('rejects shapes a slug never has', () => {
    expect(looksLikeCommunitySlug('')).toBe(false)
    expect(looksLikeCommunitySlug('PHILLY')).toBe(false)
    expect(looksLikeCommunitySlug('-leading-hyphen')).toBe(false)
    expect(looksLikeCommunitySlug('a'.repeat(65))).toBe(false)
  })
})
