// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { track } from '@vercel/analytics'
import SectionTabs from './SectionTabs'
import type { CardSectionDef } from './sections'

// A category-open here (mega-menu item click) and a category-open from
// Landing's own "Browse everything" grid fire the SAME track event with
// different `source` values — see Landing.test.tsx's matching test — so the
// admin Metrics tab can compare real usage between the two nav paths instead
// of guessing which one to keep.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

afterEach(() => cleanup())

const sections: CardSectionDef[] = [
  {
    title: 'Food and Hospitality',
    cards: [{ id: 'grocery', title: 'Grocery Stores', go: vi.fn(), href: '/philly/grocery' }],
  },
]

function renderTabs(overrides: Partial<Parameters<typeof SectionTabs>[0]> = {}) {
  const onOpenCard = vi.fn()
  const utils = render(
    <SectionTabs sections={sections} listings={null} onOpenCard={onOpenCard} {...overrides} />,
  )
  return { ...utils, onOpenCard }
}

describe('SectionTabs — mega-menu', () => {
  it('tracks category_opened with source "tab-nav" when a mega-menu item is clicked', async () => {
    const user = userEvent.setup()
    const { onOpenCard } = renderTabs()

    // Hover opens the menu (see the tab's onMouseEnter) — a real pointer
    // hover, not the click that follows, which lands on the item inside.
    await user.hover(screen.getByRole('button', { name: 'Food and Hospitality' }))
    await user.click(await screen.findByText('Grocery Stores'))

    expect(vi.mocked(track)).toHaveBeenCalledWith('category_opened', { category: 'grocery', source: 'tab-nav' })
    expect(onOpenCard).toHaveBeenCalledWith(sections[0]!.cards[0])
  })

  it('opens the mega-menu on a plain tab click, rather than navigating anywhere', async () => {
    const user = userEvent.setup()
    renderTabs()
    const tab = screen.getByRole('button', { name: 'Food and Hospitality' })

    expect(screen.queryByText('Grocery Stores')).not.toBeInTheDocument()

    await user.click(tab)

    expect(await screen.findByText('Grocery Stores')).toBeInTheDocument()
  })
})
