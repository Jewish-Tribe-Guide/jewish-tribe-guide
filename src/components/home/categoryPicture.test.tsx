// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { CategoryTileRow, CompactCardGrid } from './sections'
import type { CardDef } from './sections'
import CategoryTiles, { HOME_LABEL, TILE_BOX } from './CategoryTiles'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// A category has one picture, its banner (the user, Nov 11: "the picture can
// just be the banner"). The computer home's tile shows it; a badge (the
// search rows) is the line icon, never a picture or an emoji.

const PICTURE = 'https://example.supabase.co/storage/v1/object/public/site-assets/category-band/food-pic.jpeg'
const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', icon: '🍽️', cardBandImageUrl: PICTURE, cardImageUrl: 'https://images.unsplash.com/photo-older' })
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', icon: '🛒' })
const card = (id: string, title: string): CardDef => ({ id, title, icon: '🍽️', href: `/philly/${id}`, go: () => {} }) as CardDef

/** The <img> inside the link named `name`, by its decoded src, or null. */
function pictureIn(container: HTMLElement, href: string): string | null {
  const img = container.querySelector(`a[href="${href}"] img`) as HTMLImageElement | null
  return img ? decodeURIComponent(img.getAttribute('src') ?? '') : null
}

describe('a category’s one picture on the home', () => {
  it('computer home: the Explore by Category tile shows its banner over an older card photo, and a category without one keeps its glyph', () => {
    const { container } = render(
      <CategoryTileRow cards={[card('restaurant', 'Food'), card('grocery', 'Grocery')]} categories={[food, grocery]} expanded onExpand={() => {}} />,
    )
    expect(pictureIn(container, '/philly/restaurant')).toContain('category-band/food-pic')
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

  it('search rows (the compact index) draw the line icon, not the picture', () => {
    const { container } = render(<CompactCardGrid cards={[card('restaurant', 'Food'), card('grocery', 'Grocery')]} categories={[food, grocery]} />)
    expect(pictureIn(container, '/philly/restaurant')).toBeNull()
    expect(container.querySelector('a[href="/philly/restaurant"] svg')).not.toBeNull()
    expect(container.textContent).not.toMatch(/🛒|🍽️/u)
  })

  // Board J2b (Nov 11): the phone tiles stay three across, each filled by
  // the category's one picture with its name on it. Board K1c (later that
  // day): the name in the middle, and no icon on a tile with no picture,
  // just its tint and its name ("It feels childish").
  it('phone home: a tile is the category’s picture with its name in the middle; no picture is its tint and name, no icon', () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ ok: true, eruvim: [] }))))
    const { container } = renderWithProviders(
      <CategoryTiles communitySlug="philly" listings={[makeListing({ id: 'a', category: 'restaurant' }), makeListing({ id: 'b', category: 'grocery' })]} />,
      { content: { categories: [food, grocery], homeSections: [] } },
    )
    const foodTile = container.querySelector('a[href="/philly/restaurant"]')!
    const groceryTile = container.querySelector('a[href="/philly/grocery"]')!
    expect(pictureIn(container, '/philly/restaurant')).toContain('category-band/food-pic')
    expect(foodTile.querySelector('[data-testid="tile-name"]')).toHaveTextContent('Food')
    for (const tile of [foodTile, groceryTile]) {
      expect(tile.className).toMatch(/\bitems-center\b/)
      expect(tile.className).toMatch(/\bjustify-center\b/)
      expect(tile.querySelector('svg')).toBeNull()
    }
    expect(pictureIn(container, '/philly/grocery')).toBeNull()
    expect(groceryTile.querySelector('[data-testid="tile-name"]')).toHaveTextContent('Grocery')
    expect(container.textContent).not.toMatch(/🛒|🍽️/u)
  })

  // K1c: the tiles sit in one white box under a small label, Right now's.
  it('phone home: the tiles sit in one white box under the small “Explore by Category” label', () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ ok: true, eruvim: [] }))))
    renderWithProviders(
      <CategoryTiles communitySlug="philly" listings={[makeListing({ id: 'a', category: 'restaurant' })]} />,
      { content: { categories: [food, grocery], homeSections: [] } },
    )
    const section = screen.getByTestId('category-tiles')
    const heading = within(section).getByRole('heading', { name: 'Explore by Category' })
    expect(heading.className).toBe(HOME_LABEL)
    expect(within(section).getByRole('list').className).toContain(TILE_BOX)
  })
})
