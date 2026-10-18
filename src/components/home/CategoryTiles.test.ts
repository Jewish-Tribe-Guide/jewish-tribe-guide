import { describe, expect, it } from 'vitest'
import { mostListedFirst } from './CategoryTiles'
import type { CardDef } from './sections'

const card = (id: string, counts = true): CardDef => ({ id, title: id, href: `/philly/${id}`, ...(counts ? { count: 'places' } : {}) }) as CardDef

describe('mostListedFirst (the phone home’s tiles)', () => {
  const cards = [card('hotel'), card('restaurant'), card('volunteer', false), card('synagogue'), card('mikvah')]

  it('puts the categories with the most places first, as the computer’s grid does', () => {
    const ids = mostListedFirst(cards, { hotel: 9, restaurant: 73, synagogue: 40, mikvah: 4 }).map((c) => c.id)
    expect(ids).toEqual(['restaurant', 'synagogue', 'hotel', 'mikvah', 'volunteer'])
  })

  it('keeps a card that counts nothing after those that do, even an empty category', () => {
    const ids = mostListedFirst(cards, { restaurant: 73 }).map((c) => c.id)
    expect(ids.at(-1)).toBe('volunteer')
    expect(ids.slice(0, 1)).toEqual(['restaurant'])
  })

  it('keeps the admin’s order for ties, and until the places load', () => {
    expect(mostListedFirst(cards, { hotel: 5, restaurant: 5, synagogue: 5, mikvah: 5 }).map((c) => c.id)).toEqual(['hotel', 'restaurant', 'synagogue', 'mikvah', 'volunteer'])
    expect(mostListedFirst(cards, null).map((c) => c.id)).toEqual(cards.map((c) => c.id))
  })
})
