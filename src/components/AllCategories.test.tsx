// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { HomeSection } from '@/lib/homeSections'
import AllCategories from './AllCategories'

// Card tiles now render as real <Link>s (see sections.tsx's CardDef.href),
// which is what makes cmd/ctrl-click "open in new tab" work — that pulled
// useCommunitySlug() into this component's own render, which calls
// next/navigation's useRouter() unconditionally. This file used to need no
// router mock at all (see nextNavigationMock's own doc comment for why);
// that's no longer true now that a Link needs a real community slug to
// build its href.
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

const handlers = {
  onNavigate: vi.fn(),
  onOpenFlow: vi.fn(),
  onUp: vi.fn(),
}

describe('AllCategories', () => {
  it('groups categories into their configured sections', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    const homeSections: HomeSection[] = [{ id: 'sec-1', kind: 'section', title: 'Essentials', sortOrder: 0, cardIds: ['grocery'] }]

    renderWithProviders(<AllCategories {...handlers} />, {
      content: { categories: [grocery, synagogue], homeSections },
    })

    expect(screen.getByText('All categories')).toBeInTheDocument()
    expect(screen.getByText('Essentials')).toBeInTheDocument()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    // Not in any configured section — falls into the catch-all "More" group.
    expect(screen.getByText('More')).toBeInTheDocument()
    expect(screen.getByText('Synagogues')).toBeInTheDocument()
  })

  it('calls onUp when the Up button is clicked', async () => {
    const onUp = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<AllCategories {...handlers} onUp={onUp} />, {
      content: { categories: [makeCategory()] },
    })

    await user.click(screen.getByText('Home'))

    expect(onUp).toHaveBeenCalledTimes(1)
  })

  it('renders every card in a single "More" group when no home sections are configured', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderWithProviders(<AllCategories {...handlers} />, {
      content: { categories: [grocery], homeSections: [] },
    })

    expect(screen.getByText('More')).toBeInTheDocument()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.queryByText('Essentials')).not.toBeInTheDocument()
  })

  // Clicking a heading on the home screen sends you here with ?section=X and
  // this scrolls to it. It used to work exactly once per mounted instance: a
  // single latched ref, never cleared. The App Router keeps this segment's
  // client state cached, so going back and clicking a second heading could
  // reuse the same instance with the ref spent, and the page just sat at the
  // top. A rerender of the same instance with a new section is that situation.
  it('scrolls again when a new section is requested of the same instance', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    const homeSections: HomeSection[] = [
      { id: 'sec-1', kind: 'section', title: 'Essentials', sortOrder: 0, cardIds: ['grocery'] },
      { id: 'sec-2', kind: 'section', title: 'Community', sortOrder: 1, cardIds: ['synagogue'] },
    ]
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function () {
      scrolled.push((this as HTMLElement).id)
    }

    try {
      const { rerenderWithProviders } = renderWithProviders(
        <AllCategories {...handlers} scrollToSection="Essentials" />,
        { content: { categories: [grocery, synagogue], homeSections } },
      )
      expect(scrolled).toEqual(['section-essentials'])

      rerenderWithProviders(<AllCategories {...handlers} scrollToSection="Community" />)
      expect(scrolled).toEqual(['section-essentials', 'section-community'])

      // Still only once per request, though — sections arriving late must not
      // yank the page back from wherever the visitor has since scrolled.
      rerenderWithProviders(<AllCategories {...handlers} scrollToSection="Community" />)
      expect(scrolled).toEqual(['section-essentials', 'section-community'])
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})
