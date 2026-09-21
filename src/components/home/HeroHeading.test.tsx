// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CardDef } from './sections'
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

// Desktop mockup match (Phase 3, docs/desktop-mockup-plan.md), later
// trimmed: the mockup's own "People · Places · Community" tagline and its
// short quote naming the community's region were both cut after review —
// the user's own call — so this now asserts they're gone rather than
// present. Every desktop home-screen button (including View Map) later
// lost its icon too, the user's own call — see the plain-text assertion
// below.
describe('HeroHeading — Phase 3 desktop details', () => {
  const settings = {
    name: 'Philly Jewish Guide',
    heroTitle: 'What are you looking for?',
    mission: 'Your guide to Jewish Philadelphia',
    searchPlaceholder: 'Search — kosher food, mikvah, shuls, schools…',
    desktopHeroHeadline: 'Your guide to Jewish Philadelphia',
    desktopHeroSubhead: '',
    desktopHeroImage: null,
  }

  it('no longer renders the People · Places · Community tagline', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)
    expect(screen.queryByText('People · Places · Community')).not.toBeInTheDocument()
  })

  it('no longer renders the "stronger Jewish [region] together" quote', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)
    expect(screen.queryByText(/stronger Jewish/)).not.toBeInTheDocument()
  })

  it('the desktop View Map button renders plain text — no icon, and not the raw admin-set emoji string, next to the label', () => {
    const { container } = render(
      <HeroHeading settings={settings} query="" onQueryChange={vi.fn()} mapIcon="🗺️" onViewMap={vi.fn()} />,
    )

    // Scoped to the `desktop:block` section rather than asserting on every
    // button in the document — mobile has no "View Map" button of its own
    // any more (see the next describe block).
    const desktopSection = container.querySelector('.desktop\\:block')
    expect(desktopSection).not.toBeNull()
    const desktopViewMap = Array.from(desktopSection!.querySelectorAll('button')).find((b) => b.textContent?.includes('View Map'))
    expect(desktopViewMap).toBeTruthy()
    expect(desktopViewMap!.textContent).not.toContain('🗺️')
    expect(desktopViewMap!.querySelector('svg')).toBeNull()
  })

  // Mobile used to render its own "View Map" button below the search box —
  // removed since mobile already reaches the map through its own tab
  // (MobileTabBar), making the hero's copy redundant.
  it('renders no "View Map" button on mobile, even when a Map category is configured', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} mapIcon="🗺️" onViewMap={vi.fn()} />)

    const buttons = screen.getAllByRole('button', { name: /View Map/ })
    expect(buttons).toHaveLength(1)
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

// The user's own reported pain point: typing in the hero search box used to
// scroll a visitor down to a card near the bottom of the page — nothing
// changed where they were actually looking. HeroSearchDropdown opens right
// under the box instead; this covers the open/close state machine
// HeroHeading owns around it (HeroSearchDropdown itself, and its own
// content/capping/click-handler behavior, are covered in
// HeroSearchDropdown.test.tsx).
describe('HeroHeading — the search dropdown', () => {
  const settings = {
    name: 'Philly Jewish Guide',
    heroTitle: 'What are you looking for?',
    mission: 'Your guide to Jewish Philadelphia',
    searchPlaceholder: 'Search — kosher food, mikvah, shuls, schools…',
    desktopHeroHeadline: 'Your guide to Jewish Philadelphia',
    desktopHeroSubhead: '',
    desktopHeroImage: null,
  }
  const foodCard: CardDef = { title: 'Food', id: 'restaurant', href: '/philly/restaurant', go: () => {} }

  // A real controlled query (useState), same shape as Landing's own — the
  // dropdown reopening on typing depends on a genuine query→prop round
  // trip, which a fixed `query=""` prop can't exercise.
  function Wrapper(props: Partial<React.ComponentProps<typeof HeroHeading>> = {}) {
    const [query, setQuery] = useState('')
    return (
      <HeroHeading
        settings={settings}
        query={query}
        onQueryChange={setQuery}
        searchCards={[foodCard]}
        searchPlaceHits={[]}
        categories={[]}
        {...props}
      />
    )
  }

  // Two "Search resources" inputs exist at once (CSS-only mobile/desktop
  // split — see the component's own doc); scoped to the desktop section
  // the same way the "Phase 3" tests above scope their own assertions.
  function desktopSearchInput(container: HTMLElement): HTMLInputElement {
    const desktopSection = container.querySelector('.desktop\\:block')!
    return desktopSection.querySelector('input')!
  }

  it('stays closed with an empty query, and opens once there is one', async () => {
    const user = userEvent.setup()
    const { container } = render(<Wrapper />)

    expect(screen.queryByText('Food')).not.toBeInTheDocument()
    await user.type(desktopSearchInput(container), 'food')
    expect(screen.getByText('Food')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const { container } = render(<Wrapper />)
    await user.type(desktopSearchInput(container), 'food')
    expect(screen.getByText('Food')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
  })

  it('closes on a click outside the search box', async () => {
    const user = userEvent.setup()
    const { container } = render(<Wrapper />)
    await user.type(desktopSearchInput(container), 'food')
    expect(screen.getByText('Food')).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
  })

  // Escape (and "See all") close the dropdown without necessarily blurring
  // the input — refocusing/clicking it again has to reopen the dropdown on
  // its own, without requiring the visitor to edit the text first.
  it('reopens on refocus after being dismissed, without needing to retype', async () => {
    const user = userEvent.setup()
    const { container } = render(<Wrapper />)
    const input = desktopSearchInput(container)
    await user.type(input, 'food')
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Food')).not.toBeInTheDocument()

    await user.click(input)
    expect(screen.getByText('Food')).toBeInTheDocument()
  })

  it('stays hidden while the search data is still loading (searchCards null), rather than showing a false "nothing matches"', async () => {
    const user = userEvent.setup()
    const { container } = render(<Wrapper searchCards={null} />)
    await user.type(desktopSearchInput(container), 'food')

    expect(screen.queryByText('Food')).not.toBeInTheDocument()
    expect(screen.queryByText(/Nothing matches/)).not.toBeInTheDocument()
  })
})

// Visitors read the site as a static directory. Both layouts render at once
// (CSS decides which shows), so the "community-maintained" line has to be in
// each one — the mobile block used to have no invitation to contribute at all.
describe('HeroHeading — community-maintained line', () => {
  const settings = {
    name: 'Philly Jewish Guide',
    heroTitle: 'What are you looking for?',
    mission: 'mission',
    searchPlaceholder: 'Search',
    desktopHeroHeadline: 'Headline',
    desktopHeroSubhead: 'subhead',
    desktopHeroImage: null,
  }

  it('is in both the mobile block and the desktop band', () => {
    const { container } = render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)
    const mobile = container.querySelector('section.desktop\\:hidden')!
    const desktop = [...container.querySelectorAll('section')].find((s) => s !== mobile)!
    expect(mobile.textContent).toContain('Community-maintained.')
    expect(desktop.textContent).toContain('Community-maintained.')
  })

  it('sits directly under the mission on mobile, above the search box', () => {
    const { container } = render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)
    const mobile = container.querySelector('section.desktop\\:hidden')!
    const text = mobile.textContent!
    expect(text.indexOf('mission')).toBeLessThan(text.indexOf('Community-maintained.'))
    const strip = [...mobile.querySelectorAll('p')].find((p) => p.textContent?.includes('Community-maintained.'))!
    const input = mobile.querySelector('input')!
    expect(strip.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
