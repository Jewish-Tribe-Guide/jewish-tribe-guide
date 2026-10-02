import { describe, expect, it } from 'vitest'
import {
  assertUsableSlug,
  FIXED_VIEW_KINDS,
  mapQueryString,
  parseMapQuery,
  routes,
  slugRejectionReason,
} from './routes'

describe('routes', () => {
  it('builds every screen under its community', () => {
    expect(routes.home('philly')).toBe('/philly')
    expect(routes.map('philly')).toBe('/philly/map')
    expect(routes.feedback('philly')).toBe('/philly/feedback')
    expect(routes.slug('philly', 'grocery')).toBe('/philly/grocery')
    expect(routes.listing('philly', 'grocery', 'abc123')).toBe('/philly/grocery/abc123')
    expect(routes.about('philly')).toBe('/philly/about')
    expect(routes.privacy('philly')).toBe('/philly/privacy')
  })

  it('keeps communities apart', () => {
    expect(routes.slug('baltimore', 'grocery')).toBe('/baltimore/grocery')
  })
})

describe('slugRejectionReason', () => {
  it('accepts the slugs already in use', () => {
    for (const slug of ['synagogue', 'restaurant', 'grocery', 'hotel', 'mikvah', 'whatsapp']) {
      expect(slugRejectionReason(slug)).toBeNull()
    }
  })

  it('accepts hyphens and digits', () => {
    expect(slugRejectionReason('day-camps')).toBeNull()
    expect(slugRejectionReason('shul2')).toBeNull()
  })

  it('rejects a slug that would shadow a built-in screen', () => {
    expect(slugRejectionReason('map')).toMatch(/reserved/i)
    expect(slugRejectionReason('all')).toMatch(/reserved/i)
    expect(slugRejectionReason('feedback')).toMatch(/reserved/i)
    expect(slugRejectionReason('admin')).toMatch(/reserved/i)
    expect(slugRejectionReason('api')).toMatch(/reserved/i)
    expect(slugRejectionReason('offline')).toMatch(/reserved/i)
    // Both live under /[community] now (/[community]/about, /[community]/
    // privacy) — a category with either name would shadow that screen at
    // the same URL.
    expect(slugRejectionReason('about')).toMatch(/reserved/i)
    expect(slugRejectionReason('privacy')).toMatch(/reserved/i)
  })

  // A category named "Eruv" would slugify to exactly the word the Eruv
  // Information screen's URL is reserved for (see FIXED_VIEW_KINDS) — this is
  // the collision that let a listing category shadow that screen before
  // FIXED_VIEW_KINDS existed. "Eruv Information" itself is fine; it slugifies
  // to "eruv-information", a different string.
  it('rejects the fixed views’ own slugs', () => {
    for (const slug of Object.keys(FIXED_VIEW_KINDS)) {
      expect(slugRejectionReason(slug), slug).toMatch(/reserved/i)
    }
  })

  // /hospitals was the old Jewish Medical Resources screen, whose only content
  // was made-up placeholder details (fake phone numbers, invented staff). It
  // must not come back as a fixed view, and the URL stays kept for the real
  // hospital pages.
  it('has no hospitals fixed view, but keeps its URL reserved', () => {
    expect(FIXED_VIEW_KINDS).not.toHaveProperty('hospitals')
    expect(Object.values(FIXED_VIEW_KINDS)).not.toContain('medical')
    expect(slugRejectionReason('hospitals')).toMatch(/reserved/i)
  })

  it('is case- and whitespace-insensitive when matching reserved slugs', () => {
    expect(slugRejectionReason('  MAP  ')).toMatch(/reserved/i)
  })

  it('rejects an empty slug', () => {
    expect(slugRejectionReason('')).toMatch(/required/i)
    expect(slugRejectionReason('   ')).toMatch(/required/i)
  })

  it('rejects characters that do not belong in a URL segment', () => {
    expect(slugRejectionReason('Grocery Store')).toMatch(/lowercase/i)
    expect(slugRejectionReason('groceries!')).toMatch(/lowercase/i)
    expect(slugRejectionReason('../etc/passwd')).toMatch(/lowercase/i)
    expect(slugRejectionReason('-leading-hyphen')).toMatch(/lowercase/i)
  })

  it('throws from the assert variant only for a bad slug', () => {
    expect(() => assertUsableSlug('grocery')).not.toThrow()
    expect(() => assertUsableSlug('map')).toThrow(/reserved/i)
  })
})

describe('mapQueryString', () => {
  it('is empty for a default view, keeping the common link short', () => {
    expect(mapQueryString({})).toBe('')
    expect(mapQueryString({ categories: [], query: '', openNow: false })).toBe('')
  })

  it('writes categories, query and the open-now flag', () => {
    expect(mapQueryString({ categories: ['grocery', 'restaurant'] })).toBe('?cat=grocery%2Crestaurant')
    expect(mapQueryString({ query: 'bagel' })).toBe('?q=bagel')
    expect(mapQueryString({ openNow: true })).toBe('?open=1')
  })

  it('writes boolean and select filters', () => {
    expect(mapQueryString({ bool: ['isKosher'] })).toBe('?is=isKosher')
    expect(mapQueryString({ select: { hechsher: ['OU', 'Star-K'] } })).toContain('sel=hechsher%3AOU%7CStar-K')
  })

  it('writes the selected place', () => {
    expect(mapQueryString({ place: 'abc123' })).toBe('?place=abc123')
  })

  // The Pinned, Browse and What changed pages own their paths; a category
  // can't take them.
  it('reserves the Pinned, Browse and What changed pages’ slugs', () => {
    expect(slugRejectionReason('pinned')).toMatch(/reserved/)
    expect(slugRejectionReason('browse')).toMatch(/reserved/)
    expect(slugRejectionReason('changes')).toMatch(/reserved/)
  })

  // "See them on the map", on the Pinned page: the map with only the pins.
  it('writes the Pinned chip, and reads it back', () => {
    expect(mapQueryString({ pinned: true })).toBe('?pinned=1')
    expect(parseMapQuery(new URLSearchParams('pinned=1')).pinned).toBe(true)
    expect(parseMapQuery(new URLSearchParams('')).pinned).toBe(false)
  })
})

describe('parseMapQuery', () => {
  const parse = (qs: string) => parseMapQuery(new URLSearchParams(qs))

  it('round-trips what mapQueryString writes', () => {
    const state = {
      categories: ['grocery', 'restaurant'],
      query: 'bagel',
      openNow: true,
      openIn: null,
      bool: ['isKosher'],
      select: { hechsher: ['OU', 'Star-K'] },
      place: 'abc123',
      pinned: false,
    }
    expect(parse(mapQueryString(state))).toEqual(state)
  })

  // Open now per category (the map's Filters sheet, see mapFilters.ts), and
  // switches and picks written category.key.
  it('round-trips Open now for some categories, and filters with their category', () => {
    const state = {
      categories: null,
      query: null,
      openNow: false,
      openIn: ['grocery', 'restaurant'],
      bool: ['mikvah.keilim'],
      select: { 'restaurant.t': ['Meat'] },
      place: null,
      pinned: false,
    }
    expect(parse(mapQueryString(state))).toEqual(state)
  })

  it('returns defaults for an empty query string', () => {
    expect(parse('')).toEqual({
      categories: null,
      query: null,
      openNow: false,
      openIn: null,
      bool: null,
      select: null,
      place: null,
      pinned: false,
    })
  })

  it('ignores empty and whitespace-only list entries', () => {
    expect(parse('cat=grocery,,%20,restaurant').categories).toEqual(['grocery', 'restaurant'])
    expect(parse('cat=').categories).toBeNull()
  })

  it('ignores a malformed select pair rather than throwing', () => {
    expect(parse('sel=nocolon').select).toBeNull()
    expect(parse('sel=key:').select).toBeNull()
    expect(parse('sel=:value').select).toBeNull()
  })

  it('keeps the good half of a partly malformed select', () => {
    expect(parse('sel=nocolon,hechsher:OU').select).toEqual({ hechsher: ['OU'] })
  })

  it('treats any open value other than 1 as off', () => {
    expect(parse('open=1').openNow).toBe(true)
    expect(parse('open=true').openNow).toBe(false)
    expect(parse('open=0').openNow).toBe(false)
  })
})
