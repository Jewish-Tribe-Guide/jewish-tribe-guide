// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import HeroHeading from './HeroHeading'
import { CardGrid, type CardDef } from './sections'

// Spied, with the real implementation left in place, so what the hero asks the
// browser to preload can be asserted directly.
const preloadSpy = vi.hoisted(() => vi.fn())
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return { ...actual, preload: (...args: Parameters<typeof actual.preload>) => (preloadSpy(...args), actual.preload(...args)) }
})

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  preloadSpy.mockClear()
  // A real <link> the hero hoisted into <head> outlives the test that rendered it.
  document.head.querySelectorAll('link[rel="preload"]').forEach((l) => l.remove())
})

// The home screen renders its mobile and desktop layouts at the same time and
// hides one with CSS. That makes image loading a correctness matter here, not
// just a tuning one: an eager <img> or a <link rel="preload"> in a display:none
// subtree is still fetched. Measured on a production build, a phone downloaded
// the desktop-only hero photo, and a desktop downloaded ~10 mobile-grid tiles
// it never showed — the first because of `priority` on the hero, the second
// because every section's grid marked its own first four tiles `priority`.

const imgs = (root: ParentNode) => [...root.querySelectorAll('img')]
const preloads = () => document.head.querySelectorAll('link[rel="preload"][as="image"]')

function cards(n: number, prefix = 'c'): CardDef[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `${prefix}${i}`,
    href: `/x/${prefix}${i}`,
    go: () => {},
    cardImageUrl: `https://images.unsplash.com/photo-${prefix}${i}`,
  }))
}

describe('desktop hero photo', () => {
  const settings = {
    name: 'n',
    heroTitle: 't',
    mission: 'm',
    searchPlaceholder: 's',
    desktopHeroHeadline: 'h',
    desktopHeroSubhead: 'sub',
    desktopHeroImage: { url: 'https://images.unsplash.com/photo-hero', alt: 'A street' },
  }

  it('is lazy with high fetch priority, and adds no unconditional <head> preload', () => {
    const { container } = render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)
    const hero = imgs(container).find((i) => i.alt === 'A street')!

    // Default lazy loading is what makes the browser skip it inside the
    // `hidden` (phone) subtree; fetchpriority keeps it winning on desktop.
    expect(hero.getAttribute('loading')).toBe('lazy')
    expect(hero.getAttribute('fetchpriority')).toBe('high')
  })

  it('preloads only at desktop sizes, so a phone never fetches it but desktop still starts early', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)

    expect(preloadSpy).toHaveBeenCalledTimes(1)
    const [href, opts] = preloadSpy.mock.calls[0]!
    expect(href).toContain('/_next/image')
    expect(opts).toMatchObject({ as: 'image', fetchPriority: 'high', imageSizes: '58vw' })
    // Without a media condition this is exactly the bug: every phone preloads
    // the photo it then hides. Must match the `desktop:` variant in globals.css.
    expect(opts.media).toBe('(min-width: 640px) and (min-height: 640px)')
    expect(opts.imageSrcSet).toContain('640w')
  })

  it('preloads nothing when there is no hero photo', () => {
    render(<HeroHeading settings={{ ...settings, desktopHeroImage: null }} query="" onQueryChange={vi.fn()} />)
    expect(preloadSpy).not.toHaveBeenCalled()
  })
})

describe('CardGrid image loading', () => {
  it('loads no tile eagerly unless asked to', () => {
    const { container } = renderWithProviders(<CardGrid cards={cards(6)} />)
    expect(imgs(container).filter((i) => i.getAttribute('loading') === 'eager')).toHaveLength(0)
    expect(preloads()).toHaveLength(0)
  })

  it('loads exactly priorityCount leading tiles eagerly, at high priority, without a preload', () => {
    const { container } = renderWithProviders(<CardGrid cards={cards(8)} priorityCount={4} />)
    const all = imgs(container)

    expect(all).toHaveLength(8)
    expect(all.filter((i) => i.getAttribute('loading') === 'eager')).toHaveLength(4)
    expect(all.slice(0, 4).every((i) => i.getAttribute('fetchpriority') === 'high')).toBe(true)
    expect(all.slice(4).every((i) => i.getAttribute('loading') === 'lazy')).toBe(true)
    expect(preloads()).toHaveLength(0)
  })

  it('counts per grid, so it is the caller that decides which grid is the first one', () => {
    // Two sections, as the home screen renders them. Only the first passes a
    // count, so the page as a whole has four eager tiles, not eight.
    const { container } = renderWithProviders(
      <>
        <CardGrid cards={cards(4, 'a')} priorityCount={4} />
        <CardGrid cards={cards(4, 'b')} />
      </>,
    )
    expect(imgs(container).filter((i) => i.getAttribute('loading') === 'eager')).toHaveLength(4)
  })
})
