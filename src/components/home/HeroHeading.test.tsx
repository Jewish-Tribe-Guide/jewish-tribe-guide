// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import HeroHeading from './HeroHeading'

afterEach(() => cleanup())

// Desktop used to lead with the site name here, on the reasoning that
// nowhere else on that layout said who this is. That stopped being true once
// SiteHeader dropped its own tagline line (see that component's own doc) —
// the header already names the site, right beside this section — so desktop
// now leads with the admin-editable desktopHeroHeadline/Subhead fields
// instead of the site name again, which would be exactly the redundancy this
// change removes. Mobile is unaffected: it already led with `heroTitle` (the
// practical "what are you looking for" prompt), never the name, for the same
// "already in the header" reasoning — see the mobile assertion below.
describe('HeroHeading — desktop headline vs. mobile heroTitle', () => {
  const settings = {
    name: 'Philly Jewish Guide',
    heroTitle: 'What are you looking for?',
    mission: 'Your guide to Jewish Philadelphia — kept current by you, and by the community that uses it',
    searchPlaceholder: 'Search — kosher food, mikvah, shuls, schools…',
    desktopHeroHeadline: 'Your guide to Jewish Philadelphia',
    desktopHeroSubhead: 'kept current by you, and by the community that uses it',
    desktopHeroImage: null,
  }

  it('desktop: renders desktopHeroHeadline as a bold <h1> and desktopHeroSubhead as a smaller paragraph; the site name and mission are not repeated here at all', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)

    // Both layouts render at once (CSS-only mobile/desktop split — see the
    // component's own doc), so headings are scoped by heading level: the
    // desktop band's <h1> carries only desktopHeroHeadline, not mobile's
    // heroTitle (a different <h1> — see the mobile assertion below).
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.some((h) => h.textContent === settings.desktopHeroHeadline)).toBe(true)
    expect(screen.getByText(settings.desktopHeroSubhead).tagName).toBe('P')

    // The site name doesn't render anywhere in this component any more —
    // SiteHeader is where it lives now, once and only once.
    expect(screen.queryByText(settings.name)).not.toBeInTheDocument()

    // heroTitle used to surface as a small <h2> label here too — it doesn't
    // any more, since search (and the label heading it) moved out to its own
    // section entirely rather than staying folded into the hero band.
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('desktop: renders the headline alone when desktopHeroSubhead is empty', () => {
    render(
      <HeroHeading
        settings={{ ...settings, desktopHeroSubhead: '' }}
        query=""
        onQueryChange={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('heading', { level: 1 }).some((h) => h.textContent === settings.desktopHeroHeadline)).toBe(
      true,
    )
  })

  it('mobile: heroTitle is still the one big heading — mission stays one plain, unsplit paragraph under it', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)

    // Both layouts are in the DOM; heroTitle appears as an <h1> (mobile's
    // lead line) — never a second <h1> carrying any part of the mission.
    const h1sWithHeroTitle = screen.getAllByRole('heading', { level: 1 }).filter((h) => h.textContent === settings.heroTitle)
    expect(h1sWithHeroTitle.length).toBe(1)

    // Mobile shows the FULL, unsplit mission as a plain paragraph — desktop's
    // separate hero fields are a desktop-only headline treatment, not a
    // change to what mobile has always shown.
    expect(screen.getByText(settings.mission).tagName).toBe('P')
  })
})

// The hero's photo panel — desktopHeroImage is admin-editable (Desktop tab's
// Hero card). Two things matter here: a real photo gets a real, describable
// alt (never aria-hidden — that combination is exactly the axe violation
// this file's placeholder already shipped once), and a deployment with
// nothing set still renders instead of breaking.
describe('HeroHeading — the photo panel', () => {
  const settings = {
    name: 'Philly Jewish Guide',
    heroTitle: 'What are you looking for?',
    mission: 'Your guide to Jewish Philadelphia',
    searchPlaceholder: 'Search — kosher food, mikvah, shuls, schools…',
    desktopHeroHeadline: 'Your guide to Jewish Philadelphia',
    desktopHeroSubhead: '',
  }

  it('renders the configured photo with a real alt, not aria-hidden', () => {
    render(
      <HeroHeading
        settings={{ ...settings, desktopHeroImage: { url: 'https://images.unsplash.com/photo-test', alt: 'A test skyline' } }}
        query=""
        onQueryChange={vi.fn()}
      />,
    )

    const img = screen.getByAltText('A test skyline')
    expect(img).toBeTruthy()
    expect(img.closest('[aria-hidden]')).toBeNull()
  })

  it('falls back to the aria-hidden placeholder when no photo is configured', () => {
    const { container } = render(
      <HeroHeading settings={{ ...settings, desktopHeroImage: null }} query="" onQueryChange={vi.fn()} />,
    )

    // No <img> at all — the placeholder is a CSS gradient + inline SVG, not
    // an <img> with an empty/missing alt (which would be its own violation).
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[aria-hidden="true"] svg')).toBeTruthy()
  })
})
