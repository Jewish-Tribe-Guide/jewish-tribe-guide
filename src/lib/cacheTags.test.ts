import { describe, expect, it } from 'vitest'
import { allCommunityTags, TAGS } from './cacheTags'

// The failure this file exists to prevent: someone adds a new cached content
// read (a new store with `use cache` + a new tag in TAGS) and doesn't add the
// tag to allCommunityTags. Nothing breaks at build time, every test still
// passes, and the bug only shows up as an admin saving a change and not seeing
// it — days later, reported as "the save doesn't work".

describe('TAGS', () => {
  it('namespaces every per-community tag by community', () => {
    for (const [name, tag] of Object.entries(TAGS)) {
      if (typeof tag !== 'function') continue
      expect(tag('philly'), `TAGS.${name}`).not.toBe(tag('baltimore'))
      expect(tag('philly'), `TAGS.${name}`).toContain('philly')
    }
  })

  it('gives each kind of content its own tag, so one edit does not throw away everything', () => {
    const philly = allCommunityTags('philly')
    expect(new Set(philly).size).toBe(philly.length)
  })
})

describe('allCommunityTags', () => {
  // Derived from TAGS rather than hardcoded, so adding a tag makes this fail
  // until the tag is wired into invalidation.
  const everyPerCommunityTag = (community: string) =>
    Object.values(TAGS)
      .filter((t): t is (c: string) => string => typeof t === 'function')
      .map((t) => t(community))

  it('covers every per-community tag in TAGS', () => {
    expect(new Set(allCommunityTags('philly'))).toEqual(new Set(everyPerCommunityTag('philly')))
  })

  it('does not reach into another community', () => {
    for (const tag of allCommunityTags('philly')) {
      expect(tag).not.toContain('baltimore')
    }
  })

  it('is a plain list of strings a revalidateTag call can take', () => {
    for (const tag of allCommunityTags('philly')) {
      expect(typeof tag).toBe('string')
      expect(tag.length).toBeGreaterThan(0)
    }
  })
})
