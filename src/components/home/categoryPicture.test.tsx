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
