// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { CardDef, ListingHit } from './sections'
import HeroSearchDropdown from './HeroSearchDropdown'

afterEach(() => cleanup())

const noopGo = () => {}
const foodCard: CardDef = { title: 'Food', id: 'restaurant', href: '/philly/restaurant', icon: '🍔', count: '72 places', go: noopGo }
const groceryCard: CardDef = { title: 'Grocery', id: 'grocery', href: '/philly/grocery', icon: '🛒', count: '22 places', go: noopGo }

function makeHit(overrides: Partial<ListingHit> = {}): ListingHit {
  const category = makeCategory()
  return {
    item: makeListing(),
    category,
    categoryLabel: category.pluralLabel,
    matchedTags: [],
    term: 'food',
    ...overrides,
  }
}

const noop = () => {}

describe('HeroSearchDropdown', () => {
  it('shows matching categories and listings', () => {
    render(
      <HeroSearchDropdown
        query="food"
        cards={[foodCard, groceryCard]}
        placeHits={[makeHit()]}
        categories={[]}
        onCardClick={noop}
        onOpenPlace={noop}
      />,
    )

    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('72 places →')).toBeInTheDocument()
    expect(screen.getByText('Grocery')).toBeInTheDocument()
    expect(screen.getByText('Test Grocery')).toBeInTheDocument()
  })

  it('shows no "See all" row when there is nothing more to expand (everything already fits under the caps)', () => {
    render(
      <HeroSearchDropdown
        query="food"
        cards={[foodCard, groceryCard]}
        placeHits={[makeHit()]}
        categories={[]}
        onCardClick={noop}
        onOpenPlace={noop}
      />,
    )

    expect(screen.queryByText(/See all/)).not.toBeInTheDocument()
  })

  it('caps categories and listings independently at 4 each, and "See all" expands both in place', async () => {
    const user = userEvent.setup()
    const cards = Array.from({ length: 6 }, (_, i) => ({ title: `Cat ${i}`, id: `cat${i}`, href: `/philly/cat${i}`, go: noopGo }))
    const hits = Array.from({ length: 6 }, (_, i) => makeHit({ item: makeListing({ id: `l${i}`, name: `Listing ${i}` }) }))
    render(
      <HeroSearchDropdown query="food" cards={cards} placeHits={hits} categories={[]} onCardClick={noop} onOpenPlace={noop} />,
    )

    expect(screen.getAllByText(/^Cat \d$/)).toHaveLength(4)
    expect(screen.getAllByText(/^Listing \d$/)).toHaveLength(4)
    expect(screen.getByText(/See all 12 results for/)).toBeInTheDocument()

    await user.click(screen.getByText(/See all 12 results for/))

    expect(screen.getAllByText(/^Cat \d$/)).toHaveLength(6)
    expect(screen.getAllByText(/^Listing \d$/)).toHaveLength(6)
    expect(screen.getByText('Show fewer results')).toBeInTheDocument()
  })

  it('"Show fewer results" collapses back to the capped view', async () => {
    const user = userEvent.setup()
    const cards = Array.from({ length: 6 }, (_, i) => ({ title: `Cat ${i}`, id: `cat${i}`, href: `/philly/cat${i}`, go: noopGo }))
    render(<HeroSearchDropdown query="food" cards={cards} placeHits={[]} categories={[]} onCardClick={noop} onOpenPlace={noop} />)

    await user.click(screen.getByText(/See all 6 results for/))
    expect(screen.getAllByText(/^Cat \d$/)).toHaveLength(6)

    await user.click(screen.getByText('Show fewer results'))
    expect(screen.getAllByText(/^Cat \d$/)).toHaveLength(4)
    expect(screen.getByText(/See all 6 results for/)).toBeInTheDocument()
  })

  it('shows a "nothing matches" message instead of empty sections when there are no results at all', () => {
    render(<HeroSearchDropdown query="asdfasdf" cards={[]} placeHits={[]} categories={[]} onCardClick={noop} onOpenPlace={noop} />)

    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument()
    expect(screen.queryByText(/See all/)).not.toBeInTheDocument()
  })

  it('calls onCardClick with the clicked category, and onOpenPlace with the clicked listing', async () => {
    const user = userEvent.setup()
    const onCardClick = vi.fn()
    const onOpenPlace = vi.fn()
    const hit = makeHit()
    render(
      <HeroSearchDropdown
        query="food"
        cards={[foodCard]}
        placeHits={[hit]}
        categories={[]}
        onCardClick={onCardClick}
        onOpenPlace={onOpenPlace}
      />,
    )

    await user.click(screen.getByText('Food'))
    expect(onCardClick).toHaveBeenCalledWith(foodCard)

    await user.click(screen.getByText('Test Grocery'))
    expect(onOpenPlace).toHaveBeenCalledWith(hit)
  })
})
