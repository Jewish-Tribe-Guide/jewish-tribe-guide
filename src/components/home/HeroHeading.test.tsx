// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import HeroHeading from './HeroHeading'

afterEach(() => cleanup())

// Desktop can afford to say who this is — nothing else on the page does, at
// any size — so its hero leads with the site name; `heroTitle` (the
// practical "what are you looking for" prompt) moved out entirely, into its
// own SearchSection below this component (see that component's own test for
// its heading). Mobile has to stay lean, so it keeps `heroTitle` as its one
// big heading, search box directly under it — the name already has its own
// line in the sticky header above it, and repeating it large would just cost
// mobile's scarcer vertical space to restate something already on screen.
describe('HeroHeading — name vs. heroTitle placement', () => {
  const settings = { name: 'Philly Jewish Guide', heroTitle: 'What are you looking for?', mission: 'Your guide to Jewish Philadelphia' }

  it('desktop: the site name is the big heading; heroTitle is not repeated here at all', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)

    // Both layouts render at once (CSS-only mobile/desktop split — see the
    // component's own doc), so headings are scoped by heading level: the
    // desktop band's <h1> is the only <h1> carrying the name (mobile's own
    // lead line is a different <h1> — see the mobile assertion below).
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.some((h) => h.textContent === settings.name)).toBe(true)

    // heroTitle used to surface as a small <h2> label here too — it doesn't
    // any more, since search (and the label heading it) moved out to its own
    // section entirely rather than staying folded into the hero band.
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('mobile: heroTitle is still the one big heading — the name is not repeated there', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)

    // Both layouts are in the DOM; heroTitle appears as an <h1> (mobile's
    // lead line) — never a second <h1> carrying the site name, which would
    // mean mobile got a name heading too.
    const h1sWithHeroTitle = screen.getAllByRole('heading', { level: 1 }).filter((h) => h.textContent === settings.heroTitle)
    expect(h1sWithHeroTitle.length).toBe(1)

    const h1sWithName = screen.getAllByRole('heading', { level: 1 }).filter((h) => h.textContent === settings.name)
    expect(h1sWithName.length).toBe(1) // desktop's own <h1> only — not a second one for mobile
  })
})

// The hero's photo panel — see community.config.ts's own `heroImage` doc for
// why this is a code-level per-deployment field (like themeColor) rather
// than an admin-editable one. Two things matter here: a real photo gets a
// real, describable alt (never aria-hidden — that combination is exactly
// the axe violation this file's placeholder already shipped once), and a
// deployment with nothing set still renders instead of breaking.
describe('HeroHeading — the photo panel', () => {
  const settings = { name: 'Philly Jewish Guide', heroTitle: 'What are you looking for?', mission: 'Your guide to Jewish Philadelphia' }

  it('renders the configured photo with a real alt, not aria-hidden', async () => {
    vi.resetModules()
    vi.doMock('@/community.config', () => ({
      community: { heroImage: { url: 'https://images.unsplash.com/photo-test', alt: 'A test skyline' } },
    }))
    const { default: HeroHeadingWithPhoto } = await import('./HeroHeading')
    render(<HeroHeadingWithPhoto settings={settings} query="" onQueryChange={vi.fn()} />)

    const img = screen.getByAltText('A test skyline')
    expect(img).toBeTruthy()
    expect(img.closest('[aria-hidden]')).toBeNull()
    vi.doUnmock('@/community.config')
  })

  it('falls back to the aria-hidden placeholder when no photo is configured', async () => {
    vi.resetModules()
    vi.doMock('@/community.config', () => ({ community: { heroImage: null } }))
    const { default: HeroHeadingNoPhoto } = await import('./HeroHeading')
    const { container } = render(<HeroHeadingNoPhoto settings={settings} query="" onQueryChange={vi.fn()} />)

    // No <img> at all — the placeholder is a CSS gradient + inline SVG, not
    // an <img> with an empty/missing alt (which would be its own violation).
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[aria-hidden="true"] svg')).toBeTruthy()
    vi.doUnmock('@/community.config')
  })
})
