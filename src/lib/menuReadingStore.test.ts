import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase/admin', () => ({ getAdminClient: () => ({}) }))
const { isNoMenu, splitDishes, storedDishes } = await import('./menuReadingStore')

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
