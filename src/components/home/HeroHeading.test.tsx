// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import HeroHeading, { splitMission } from './HeroHeading'

afterEach(() => cleanup())

describe('splitMission', () => {
  it('splits a dash-joined mission into a headline and a subhead', () => {
    // The real, live mission on this deployment — not invented for the
    // test. Splitting on it is mechanical, not editorial: see the
    // function's own doc for why this isn't the same thing as writing new
    // marketing copy.
    expect(splitMission('Your guide to Jewish Philadelphia — kept current by you, and by the community that uses it')).toEqual({
      headline: 'Your guide to Jewish Philadelphia',
      subhead: 'kept current by you, and by the community that uses it',
    })
  })

  it('falls back to the whole string as the headline when there is no dash to split on', () => {
    expect(splitMission('A guide to Jewish Philadelphia')).toEqual({
      headline: 'A guide to Jewish Philadelphia',
      subhead: null,
    })
  })

  it('trims surrounding whitespace, including a trailing newline from the admin textarea', () => {
    expect(splitMission('Your guide to Jewish Philadelphia — kept current by you\n')).toEqual({
      headline: 'Your guide to Jewish Philadelphia',
      subhead: 'kept current by you',
    })
  })
})

// Desktop used to lead with the site name here, on the reasoning that
// nowhere else on that layout said who this is. That stopped being true once
// SiteHeader dropped its own tagline line (see that component's own doc) —
// the header already names the site, right beside this section — so desktop
// now leads with `mission` instead, split into a bold headline clause and a
// smaller supporting one (see splitMission above) rather than the site name
// again, which would be exactly the redundancy this change removes. Mobile
// is unaffected: it already led with `heroTitle` (the practical "what are
// you looking for" prompt), never the name, for the same "already in the
// header" reasoning — see the mobile assertion below.
describe('HeroHeading — desktop headline vs. mobile heroTitle', () => {
  const settings = {
    name: 'Philly Jewish Guide',
    heroTitle: 'What are you looking for?',
    mission: 'Your guide to Jewish Philadelphia — kept current by you, and by the community that uses it',
  }

  it('desktop: mission splits into a bold headline and a smaller subhead; the site name is not repeated here at all', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)

    // Both layouts render at once (CSS-only mobile/desktop split — see the
    // component's own doc), so headings are scoped by heading level: the
    // desktop band's <h1> carries only the headline clause, not the whole
    // mission run-on — the rest shows up as a separate paragraph (mobile's
    // own lead line, a different <h1>, carries heroTitle instead — see the
    // mobile assertion below).
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.some((h) => h.textContent === 'Your guide to Jewish Philadelphia')).toBe(true)
    expect(h1s.some((h) => h.textContent === settings.mission)).toBe(false)
    expect(screen.getByText('kept current by you, and by the community that uses it').tagName).toBe('P')

    // The site name doesn't render anywhere in this component any more —
    // SiteHeader is where it lives now, once and only once.
    expect(screen.queryByText(settings.name)).not.toBeInTheDocument()

    // heroTitle used to surface as a small <h2> label here too — it doesn't
    // any more, since search (and the label heading it) moved out to its own
    // section entirely rather than staying folded into the hero band.
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('mobile: heroTitle is still the one big heading — mission stays one plain, unsplit paragraph under it', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)

    // Both layouts are in the DOM; heroTitle appears as an <h1> (mobile's
    // lead line) — never a second <h1> carrying any part of the mission.
    const h1sWithHeroTitle = screen.getAllByRole('heading', { level: 1 }).filter((h) => h.textContent === settings.heroTitle)
    expect(h1sWithHeroTitle.length).toBe(1)

    // Mobile shows the FULL, unsplit mission as a plain paragraph — the
    // dash-splitting above is a desktop-only headline treatment, not a
    // change to what mobile has always shown.
    expect(screen.getByText(settings.mission).tagName).toBe('P')
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
