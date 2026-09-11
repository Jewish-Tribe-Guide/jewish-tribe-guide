// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CompactCardGrid, cardCount } from './sections'
import type { CardDef } from './sections'
import type { CategoryConfig } from '@/lib/categories'

afterEach(() => cleanup())

// The flat "Browse everything" index on desktop. Two things are being pinned
// down here, and both were real regressions in the shipped build rather than
// hypotheticals:
//
//  1. A 32px crop of a photograph is not a photograph. Every one of this
//     community's twelve category photos rendered to the same brown-grey disc
//     at that size, so the index looked like twelve identical grey circles
//     even though the markup was full of distinct images. The row draws the
//     tinted, colour-ringed glyph now — see CompactCard's own doc.
//  2. A row that says only "Grocery" doesn't say whether Grocery has four
//     places in it or forty.
//
// Both are asserted against the DOM rather than against a class string: the
// bug in (1) was invisible in the markup — the <img> was correct and present
// the whole time — so "no image element is rendered here" is the only form of
// the assertion that would have failed against the old code.

const category = (over: Partial<CategoryConfig> = {}): CategoryConfig =>
  ({
    id: 'grocery',
    label: 'Grocery',
    pluralLabel: 'Grocery',
    icon: '🛒',
    description: '',
    detailFields: [],
    kind: 'listing',
    sortOrder: 10,
    hasAddress: true,
    hasPhone: true,
    upvotesEnabled: true,
    pinColor: '#b63167',
    active: true,
    ...over,
  }) as CategoryConfig

const card = (over: Partial<CardDef> = {}): CardDef =>
  ({
    title: 'Grocery',
    id: 'grocery',
    icon: '🛒',
    href: '/philly/grocery',
    go: () => {},
    ...over,
  }) as CardDef

describe('CompactCard — the browse index row', () => {
  it('draws the glyph, not the category photo, even when a photo is set', () => {
    // The exact shape that used to win: a card whose cardImageUrl is set is
    // precisely the case the old code rendered as a 32px <img>.
    const { container } = render(
      <CompactCardGrid
        cards={[card({ cardImageUrl: 'https://images.unsplash.com/photo-123' })]}
        categories={[category()]}
      />,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Grocery')).toBeTruthy()
  })

  it("carries the category's own colour, so two rows are told apart at a glance", () => {
    const { container } = render(
      <CompactCardGrid
        cards={[card(), card({ title: 'Synagogues', id: 'synagogue', icon: '✡️' })]}
        categories={[category(), category({ id: 'synagogue', pluralLabel: 'Synagogues', pinColor: '#4c7b0d' })]}
      />,
    )

    // The avatars are the only elements carrying an inline background here.
    const tints = [...container.querySelectorAll<HTMLElement>('[style*="background-color"]')]
      .map((el) => el.style.backgroundColor)
    expect(tints.length).toBe(2)
    // Distinct — the whole point. Against the old photo path both were the
    // slate-100 placeholder behind an <img> and this was one repeated value.
    expect(new Set(tints).size).toBe(2)

    // And the ring, which is what survives a white logo covering the tint.
    const rings = [...container.querySelectorAll<HTMLElement>('[style*="box-shadow"]')]
    expect(rings.length).toBe(2)
    expect(rings[0].style.boxShadow).toContain('inset')
  })

  it('shows how many places are behind a category, and nothing when it does not know', () => {
    render(
      <CompactCardGrid
        cards={[card({ count: '22 places' }), card({ title: 'Map', id: 'map', icon: '🗺️' })]}
        categories={[category()]}
      />,
    )

    expect(screen.getByText('22 places')).toBeTruthy()
    // The Map pseudo-category counts nothing; it must not read "0 places".
    expect(screen.queryByText(/0 places/)).toBeNull()
  })
})

// CompactCardGrid collapses past ROWS_WHEN_COLLAPSED rows by measuring each
// card's real rendered row position (same technique GenericDirectory's own
// alignRows uses) and clipping the grid's height, rather than slicing which
// cards render — a fixed item count would be wrong on its own terms here,
// since this grid runs 2/3/4 columns depending on viewport width. jsdom
// doesn't compute real layout (getBoundingClientRect is always zero), so
// there's no row for it to measure and the collapse never engages — the
// same reason alignRows itself has no unit test. What IS testable here,
// and worth pinning down: every card stays mounted regardless of expanded
// state, since the collapse is a CSS clip, not conditional rendering — a
// future change back to slicing would silently drop this. The actual
// collapse-at-N-rows behavior is covered by an e2e test instead (see
// e2e/home.spec.ts), where a real browser lays the grid out for real.
describe('CompactCardGrid — the collapse clips height, it does not unmount cards', () => {
  const manyCards = (n: number): CardDef[] =>
    Array.from({ length: n }, (_, i) => card({ title: `Category ${i}`, id: `cat-${i}` }))

  it('keeps every card in the DOM even when there are many more than fit collapsed', () => {
    render(<CompactCardGrid cards={manyCards(40)} categories={[category()]} />)

    expect(screen.getByText('Category 0')).toBeInTheDocument()
    expect(screen.getByText('Category 39')).toBeInTheDocument()
  })
})

describe('cardCount — the wording', () => {
  it('counts addressable categories as places', () => {
    expect(cardCount(category(), { grocery: 22 })).toBe('22 places')
    expect(cardCount(category(), { grocery: 1 })).toBe('1 place')
  })

  it('does not call an address-less category a place', () => {
    // WhatsApp Groups and Networking are the live cases — you can't go to one,
    // so "19 places" would be wrong in the one word the row exists to add.
    const chat = category({ id: 'whatsapp', hasAddress: false })
    expect(cardCount(chat, { whatsapp: 19 })).toBe('19 listings')
    expect(cardCount(chat, { whatsapp: 1 })).toBe('1 listing')
  })

  it('says nothing while counts are loading, or when there are none', () => {
    expect(cardCount(category(), null)).toBeUndefined()
    expect(cardCount(category(), undefined)).toBeUndefined()
    expect(cardCount(category(), {})).toBeUndefined()
    expect(cardCount(category(), { grocery: 0 })).toBeUndefined()
  })
})
