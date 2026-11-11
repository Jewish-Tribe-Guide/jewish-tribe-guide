// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { CategoryTileRow, CompactCardGrid } from './sections'
import type { CardDef } from './sections'
import CategoryTiles from './CategoryTiles'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// A category's own picture ("Or use a picture instead" in its admin settings)
// replaces the glyph on every badge of it. Nov 11: Food had one set and it
// showed only in the search dropdown, because the home tiles never passed it
// through. Each home place a category is drawn as its badge is checked here.

const PICTURE = 'https://example.supabase.co/storage/v1/object/public/site-assets/category-icon/food-pic.jpeg'
const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', icon: '🍽️', iconImageUrl: PICTURE })
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', icon: '🛒' })
const card = (id: string, title: string): CardDef => ({ id, title, icon: '🍽️', href: `/philly/${id}`, go: () => {} }) as CardDef

/** The <img> inside the link named `name`, by its decoded src, or null. */
function pictureIn(container: HTMLElement, href: string): string | null {
  const img = container.querySelector(`a[href="${href}"] img`) as HTMLImageElement | null
  return img ? decodeURIComponent(img.getAttribute('src') ?? '') : null
}

describe('a category’s picture on the home', () => {
  it('computer home: the Explore by Category tile shows it, and a category without one keeps its glyph', () => {
    const { container } = render(
      <CategoryTileRow cards={[card('restaurant', 'Food'), card('grocery', 'Grocery')]} categories={[food, grocery]} expanded onExpand={() => {}} />,
    )
    expect(pictureIn(container, '/philly/restaurant')).toContain('category-icon/food-pic')
    expect(pictureIn(container, '/philly/grocery')).toBeNull()
  })

  // Board H1 (Nov 11): the computer tiles are photos. A category with no
  // picture of its own uses its wide card photo; with neither, its line
  // icon on grey, or its initial, never its emoji.
  it('computer home: a category with only a card photo shows that', () => {
    const hotel = makeCategory({ id: 'hotel', label: 'Hotel', pluralLabel: 'Hotels', icon: '🏨', cardImageUrl: 'https://images.unsplash.com/photo-hotel' })
    const { container } = render(<CategoryTileRow cards={[card('hotel', 'Hotels')]} categories={[hotel]} expanded onExpand={() => {}} />)
    expect(pictureIn(container, '/philly/hotel')).toContain('photo-hotel')
  })

  it('computer home: the eruv card finds the eruv category, whatever its id', () => {
    const eruv = makeCategory({ id: 'eruv-information', kind: 'eruv', label: 'Eruv', pluralLabel: 'Eruv Information', icon: '⭕', cardImageUrl: 'https://images.unsplash.com/photo-eruv' })
    const { container } = render(<CategoryTileRow cards={[card('eruv', 'Eruv Information')]} categories={[eruv]} expanded onExpand={() => {}} />)
    expect(pictureIn(container, '/philly/eruv')).toContain('photo-eruv')
  })

  it('computer home: no picture at all draws the line icon or the initial, never the emoji', () => {
    const sukkahs = makeCategory({ id: 'sukkahs', label: 'Sukkah', pluralLabel: 'Sukkahs', icon: '📋' })
    const { container } = render(
      <CategoryTileRow cards={[card('grocery', 'Grocery'), card('sukkahs', 'Sukkahs')]} categories={[grocery, sukkahs]} expanded onExpand={() => {}} />,
    )
    const glyphs = container.querySelectorAll('[data-testid="category-tile-glyph"]')
    expect(glyphs).toHaveLength(2)
    expect(glyphs[0]!.querySelector('svg')).not.toBeNull()
    expect(glyphs[1]).toHaveTextContent(/^S$/)
    expect(container.textContent).not.toMatch(/🛒|📋|🍽️/u)
    expect(container.querySelector('a[href="/philly/sukkahs"]')).toHaveAccessibleName('Sukkahs')
  })

  it('search rows (the compact index) show it too', () => {
    const { container } = render(<CompactCardGrid cards={[card('restaurant', 'Food'), card('grocery', 'Grocery')]} categories={[food, grocery]} />)
    expect(pictureIn(container, '/philly/restaurant')).toContain('category-icon/food-pic')
    expect(pictureIn(container, '/philly/grocery')).toBeNull()
  })

  it('phone home: the category tiles show it', () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ ok: true, eruvim: [] }))))
    const { container } = renderWithProviders(
      <CategoryTiles communitySlug="philly" listings={[makeListing({ id: 'a', category: 'restaurant' }), makeListing({ id: 'b', category: 'grocery' })]} />,
      { content: { categories: [food, grocery], homeSections: [] } },
    )
    expect(pictureIn(container, '/philly/restaurant')).toContain('category-icon/food-pic')
    expect(pictureIn(container, '/philly/grocery')).toBeNull()
  })
})
