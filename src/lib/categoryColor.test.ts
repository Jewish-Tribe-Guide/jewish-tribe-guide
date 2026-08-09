import { describe, expect, it } from 'vitest'
import { getCategoryColor } from './categoryColor'
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

  // Reordering the category list reassigns colours — that's inherent to a
  // positional palette, and it's fine (the pin and the card move together).
  // What must not happen is a category's colour depending on which *screen*
  // asked, so both callers must pass the same list.
  it('depends only on position in the list it was given', () => {
    const reordered = [...categories].reverse()
    expect(getCategoryColor(reordered, 'mikvah')).toBe(getCategoryColor(categories, 'synagogue'))
  })
})
