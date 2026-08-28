import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { categoryColorUsage, categoryTint, getCategoryColor, isValidPinColor, PIN_COLORS } from './categoryColor'
import type { CategoryConfig } from './categories'

// The colour is assigned by position rather than stored, so the map pin and the
// listing card's icon always agree without an admin picking one. The cost of
// that choice is that it's positional: this file pins the properties the rest
// of the app relies on.

const cat = (id: string): CategoryConfig => ({
  id,
  label: id,
  pluralLabel: id,
  icon: '📍',
  description: '',
  kind: 'listing',
  detailFields: [],
})

const categories = ['synagogue', 'restaurant', 'grocery', 'hotel', 'mikvah'].map(cat)

describe('getCategoryColor', () => {
  it('gives the same category the same colour on every call', () => {
    expect(getCategoryColor(categories, 'grocery')).toBe(getCategoryColor(categories, 'grocery'))
  })

  it('gives neighbouring categories different colours', () => {
    const colors = categories.map((c) => getCategoryColor(categories, c.id))
    expect(new Set(colors).size).toBe(categories.length)
  })

  it('returns a hex colour a map pin and a CSS rule can both use', () => {
    for (const c of categories) {
      expect(getCategoryColor(categories, c.id)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  // A missing colour would render an invisible pin or a transparent avatar,
  // which reads as a broken map rather than as loading.
  it('falls back to a real colour while categories are still loading', () => {
    expect(getCategoryColor(null, 'grocery')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(getCategoryColor(undefined, 'grocery')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(getCategoryColor([], 'grocery')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('falls back for a stale or deleted category id', () => {
    expect(getCategoryColor(categories, 'no-such-category')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('gives the fallback a colour no real category uses, so it reads as "unknown"', () => {
    const fallback = getCategoryColor(categories, 'no-such-category')
    expect(categories.map((c) => getCategoryColor(categories, c.id))).not.toContain(fallback)
  })

  it('keeps assigning colours past the end of the palette', () => {
    const many = Array.from({ length: 25 }, (_, i) => cat(`c${i}`))
    for (const c of many) {
      expect(getCategoryColor(many, c.id)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  // The bug this is here for: the palette held ten colours, the site had
  // sixteen categories, and `index % PALETTE.length` handed the eleventh
  // category the first one's colour byte-for-byte. Restaurants and Synagogues
  // came out #257d96 both, which on a map full of pins is simply wrong rather
  // than merely tight. The old version of this file only ever checked five
  // categories, so it passed the entire time.
  //
  // Twenty, not "the palette length": the number that matters is how many
  // categories a real deployment has (sixteen when this was found), and
  // asserting against PALETTE.length would let someone shrink the palette and
  // still be green.
  it('gives twenty categories twenty different colours, since real sites have more than ten', () => {
    const many = Array.from({ length: 20 }, (_, i) => cat(`c${i}`))
    const colors = many.map((c) => getCategoryColor(many, c.id))
    expect(new Set(colors).size).toBe(20)
  })

  // The subtler half of the same bug, and the one the first fix walked into:
  // making the back half of the palette the same hues again, darker, gives
  // category n and category n+10 a matched light/dark pair — Restaurants and
  // Synagogues came out cyan and dark cyan, which on a map still reads as one
  // colour. Distinct-hex was true and useless. So this measures actual
  // perceptual distance (OKLab) rather than inequality.
  //
  // 0.08 is chosen against the palette's own worst case: green/lime sit 0.047
  // apart and are the tightest pair anyone has accepted here, so a pair that
  // the wrap creates on purpose should be comfortably looser than that.
  it('keeps a category and the one ten later far apart, not the same hue twice', () => {
    const oklab = (hex: string) => {
      const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
      const s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
      return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s2,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s2,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s2,
      ]
    }
    const distance = (a: string, b: string) => {
      const [x, y] = [oklab(a), oklab(b)]
      return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
    }

    const many = Array.from({ length: 20 }, (_, i) => cat(`c${i}`))
    const colors = many.map((c) => getCategoryColor(many, c.id))
    for (let i = 0; i + 10 < colors.length; i += 1) {
      expect(distance(colors[i], colors[i + 10]), `categories ${i} and ${i + 10}`).toBeGreaterThan(0.08)
    }
  })

  // Past the palette it does wrap, and that's accepted — but the wrap has to
  // be far enough out that no plausible category list reaches it.
  it('does not repeat a colour until well past any realistic category count', () => {
    const many = Array.from({ length: 40 }, (_, i) => cat(`c${i}`))
    const colors = many.map((c) => getCategoryColor(many, c.id))
    const firstRepeat = colors.findIndex((c, i) => colors.indexOf(c) !== i)
    expect(firstRepeat).toBeGreaterThanOrEqual(20)
  })

  // Reordering the category list reassigns colours — that's inherent to a
  // positional palette, and it's fine (the pin and the card move together).
  // What must not happen is a category's colour depending on which *screen*
  // asked, so both callers must pass the same list.
  it('depends only on position in the list it was given', () => {
    const reordered = [...categories].reverse()
    expect(getCategoryColor(reordered, 'mikvah')).toBe(getCategoryColor(categories, 'synagogue'))
  })

  // The palette was pulled back in chroma to quiet the map down, which is a
  // knob someone will reach for again. Every pin has a white glyph drawn on
  // top of it, so there is a floor on how light these can get before the
  // glyph stops being readable — this is that floor, stated once rather than
  // rediscovered by squinting at a screenshot.
  it('stays dark enough for the white glyph on top of every pin to read', () => {
    const channel = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const contrastWithWhite = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
      return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05)
    }
    const many = Array.from({ length: 25 }, (_, i) => cat(`c${i}`))
    for (const c of many) {
      expect(contrastWithWhite(getCategoryColor(many, c.id))).toBeGreaterThan(3)
    }
  })
})

describe('categoryTint', () => {
  it('produces a color a browser will parse, not a truncated hex', () => {
    // '#2657bf' + a two-digit alpha — an 8-digit hex. Getting this wrong
    // yields a string CSS silently ignores, i.e. an invisible avatar.
    expect(categoryTint('#2657bf')).toMatch(/^#[0-9a-f]{8}$/i)
  })

  it("keeps the pin's own color as the base, so the two still read as one thing", () => {
    expect(categoryTint('#2657bf').startsWith('#2657bf')).toBe(true)
  })
})

describe('a category owns its colour', () => {
  // The bug this closes: colour used to be derived purely from position, so a
  // category's identity on the map depended on what its neighbours were
  // called. Renaming one category moved it alphabetically and silently
  // recoloured both it and everything it passed; hiding one shifted everything
  // after it; and two databases with different category lists drew different
  // pins from identical code.
  it('uses the colour stored on the category, not its position', () => {
    const list = [cat('a'), { ...cat('b'), pinColor: '#123456' }, cat('c')]
    expect(getCategoryColor(list, 'b')).toBe('#123456')
  })

  it('keeps that colour when the category moves position', () => {
    const b = { ...cat('b'), pinColor: '#123456' }
    expect(getCategoryColor([cat('a'), b, cat('c')], 'b')).toBe('#123456')
    // Renamed so it now sorts first, or a neighbour was hidden — same colour.
    expect(getCategoryColor([b, cat('c')], 'b')).toBe('#123456')
    expect(getCategoryColor([cat('c'), cat('a'), b], 'b')).toBe('#123456')
  })

  it('does not let one category\'s stored colour shift another\'s fallback', () => {
    const withStored = [cat('a'), { ...cat('b'), pinColor: '#123456' }, cat('c')]
    const without = [cat('a'), cat('b'), cat('c')]
    expect(getCategoryColor(withStored, 'c')).toBe(getCategoryColor(without, 'c'))
  })

  it('falls back to the positional palette when nothing is stored', () => {
    const list = [cat('a'), cat('b')]
    expect(getCategoryColor(list, 'b')).toBe(PIN_COLORS[1])
  })

  it('treats blank or whitespace as "not set" rather than as a colour', () => {
    for (const pinColor of ['', '   ', null, undefined]) {
      const list = [cat('a'), { ...cat('b'), pinColor }]
      expect(getCategoryColor(list, 'b')).toBe(PIN_COLORS[1])
    }
  })
})

describe('isValidPinColor', () => {
  it('accepts a six-digit hex', () => {
    expect(isValidPinColor('#2657bf')).toBe(true)
    expect(isValidPinColor('#ABCDEF')).toBe(true)
  })

  // The value is interpolated into an inline style on every pin for the
  // category, so anything that isn't plainly a colour is refused rather than
  // rendered.
  it('refuses shorthand, names, functions and anything with a delimiter in it', () => {
    for (const bad of ['#fff', 'red', 'rgb(0,0,0)', '#2657bf;', 'url(x)', '', '  ', '#12345g']) {
      expect(isValidPinColor(bad), bad).toBe(false)
    }
  })

  it('accepts every colour the picker offers', () => {
    for (const c of PIN_COLORS) expect(isValidPinColor(c), c).toBe(true)
  })
})

describe('the migration backfill', () => {
  // supabase/migrations/20240101000034_category_pin_color.sql hardcodes the
  // palette in SQL, because a migration can't import TypeScript. It exists to
  // write today's computed colour into every existing row so nothing changes
  // appearance the day it ships — which only holds if the two lists are the
  // same, in the same order.
  it('uses the same palette, in the same order, as the code', () => {
    const sql = readFileSync('supabase/migrations/20240101000034_category_pin_color.sql', 'utf-8')
    const inSql = [...sql.matchAll(/'(#[0-9a-f]{6})'/gi)].map((m) => m[1].toLowerCase())
    expect(inSql).toEqual(PIN_COLORS.map((c) => c.toLowerCase()))
  })
})
describe('categoryColorUsage', () => {
  function listing(id: string, overrides: Partial<CategoryConfig> = {}): CategoryConfig {
    return { ...cat(id), kind: 'listing', ...overrides }
  }

  it('reports the category holding an explicitly-set colour', () => {
    const list = [listing('a', { pinColor: '#123456' }), listing('b')]
    expect(categoryColorUsage(list, 'b')?.get('#123456')?.map((u) => u.id)).toEqual(['a'])
  })

  it('counts a category still on Automatic — its colour is just as taken', () => {
    const list = [listing('a'), listing('b')]
    const usage = categoryColorUsage(list, 'b')
    const holder = usage.get(getCategoryColor(list, 'a').toLowerCase())
    expect(holder?.map((u) => u.id)).toEqual(['a'])
    expect(holder?.[0].automatic).toBe(true)
  })

  it('excludes the category being edited, so its own colour never reads as taken', () => {
    const list = [listing('a', { pinColor: '#123456' })]
    expect(categoryColorUsage(list, 'a').get('#123456')).toBeUndefined()
  })

  it('ignores hidden categories and pseudo-categories — neither draws a pin', () => {
    const list = [
      listing('hidden', { pinColor: '#123456', active: false }),
      listing('map-card', { pinColor: '#654321', kind: 'map' }),
      listing('real', { pinColor: '#abcdef' }),
    ]
    const usage = categoryColorUsage(list)
    expect(usage.get('#123456')).toBeUndefined()
    expect(usage.get('#654321')).toBeUndefined()
    expect(usage.get('#abcdef')?.map((u) => u.id)).toEqual(['real'])
  })

  it('lists every holder when a colour is already doubled up', () => {
    const list = [listing('a', { pinColor: '#123456' }), listing('b', { pinColor: '#123456' })]
    expect(categoryColorUsage(list).get('#123456')?.map((u) => u.id)).toEqual(['a', 'b'])
  })

  it('matches case-insensitively on the stored hex', () => {
    const list = [listing('a', { pinColor: '#ABCDEF' })]
    expect(categoryColorUsage(list).get('#abcdef')?.map((u) => u.id)).toEqual(['a'])
  })

  it('is empty for a null list, so a still-loading editor renders plain swatches', () => {
    expect(categoryColorUsage(null).size).toBe(0)
  })
})
