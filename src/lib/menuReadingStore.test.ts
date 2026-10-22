import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase/admin', () => ({ getAdminClient: () => ({}) }))
const { isNoMenu, splitDishes, storedDishes, withMenuDishes } = await import('./menuReadingStore')

// The listing's dishes a menu doesn't name (the user, Oct 21) are kept
// among a reading's dishes, so they need no migration.
describe('dishes a menu doesn’t name, kept with the reading', () => {
  const dishes = [{ name: 'Falafel', quote: 'Falafel in pita', checked: true, onListing: true as const }]

  it('come back apart from the dishes it read', () => {
    const stored = storedDishes(dishes, ['Kugel'])
    expect(stored).toEqual([...dishes, { name: 'Kugel', quote: '', checked: false, missing: true }])
    expect(splitDishes(stored)).toEqual({ dishes, missing: ['Kugel'] })
  })

  it('a reading saved before them has none', () => {
    expect(splitDishes(dishes)).toEqual({ dishes, missing: [] })
    expect(splitDishes(null)).toEqual({ dishes: [], missing: [] })
  })

  it('aren’t dishes: a "No menu" stays one', () => {
    expect(isNoMenu({ status: 'skipped', note: 'No menu', ...splitDishes(storedDishes([], ['Kugel'])) })).toBe(true)
  })
})

// Use this, and Edit's Save to the listing (Oct 21): the list set whole.
describe('withMenuDishes', () => {
  const AT = '2026-10-21T12:00:00.000Z'
  const OLD = '2026-10-14T12:00:00.000Z'
  const details = {
    website: 'https://charlie.example',
    dishes: ['Sliders', 'Tofu', 'Laffa Wraps'],
    dishes_sometimes: ['Soup'],
    itemMenu: { dishes: { Sliders: OLD, Tofu: OLD }, dishes_sometimes: { Soup: OLD } },
    itemSeen: { dishes: { 'Laffa Wraps': OLD } },
    itemGone: { dishes: { Tofu: OLD } },
  }

  it('takes a dish off with its dates, and dates the ones its menu names', () => {
    const out = withMenuDishes(details, 'dishes', { always: ['Sliders', 'Laffa Wraps', 'Kofta'], sometimes: ['Soup'] }, { names: ['Sliders', 'Kofta'], at: AT, menuUrl: 'https://charlie.example/menu' })
    expect(out.dishes).toEqual(['Sliders', 'Laffa Wraps', 'Kofta'])
    expect(out.dishes_sometimes).toEqual(['Soup'])
    expect(out.itemMenu).toEqual({ dishes: { Sliders: AT, Kofta: AT }, dishes_sometimes: { Soup: OLD } })
    // Added by hand: no menu date, its own "seen" kept.
    expect(out.itemSeen).toEqual({ dishes: { 'Laffa Wraps': OLD } })
    // Tofu is off, and so is someone's "Not anymore" for it.
    expect(out.itemGone).toBeUndefined()
    expect(out.menuUrl).toBe('https://charlie.example/menu')
    expect(out.website).toBe('https://charlie.example')
  })

  it('moves a dish’s dates with it between always and not always', () => {
    const out = withMenuDishes(details, 'dishes', { always: ['Soup'], sometimes: ['Sliders'] }, { names: [], at: AT, menuUrl: null })
    expect(out.itemMenu).toEqual({ dishes: { Soup: OLD }, dishes_sometimes: { Sliders: OLD } })
    expect(out.menuUrl).toBeUndefined()
  })

  it('leaves no empty "not always" list behind', () => {
    const out = withMenuDishes(details, 'dishes', { always: ['Sliders'], sometimes: [] }, { names: ['Sliders'], at: AT, menuUrl: null })
    expect('dishes_sometimes' in out).toBe(false)
  })
})
