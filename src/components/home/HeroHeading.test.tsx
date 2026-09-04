// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import HeroHeading from './HeroHeading'

afterEach(() => cleanup())

// Desktop can afford to say who this is — nothing else on the page does, at
// any size — so its hero leads with the site name; `heroTitle` (the
// practical "what are you looking for" prompt) is demoted to a small label
// on its own search section there. Mobile has to stay lean, so it keeps
// `heroTitle` as its one big heading — the name already has its own line in
// the sticky header above it, and repeating it large would just cost mobile's
// scarcer vertical space to restate something already on screen.
describe('HeroHeading — name vs. heroTitle placement', () => {
  const settings = { name: 'Philly Jewish Guide', heroTitle: 'What are you looking for?', mission: 'Your guide to Jewish Philadelphia' }

  it('desktop: the site name is the big heading; heroTitle labels the search section', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)

    // Both layouts render at once (CSS-only mobile/desktop split — see the
    // component's own doc), so headings are scoped by heading level: the
    // desktop band's <h1> is the only <h1> in the tree (mobile's lead line
    // is also an <h1> — see the mobile assertion below for how that one is
    // told apart), and heroTitle now surfaces as an <h2> only.
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.some((h) => h.textContent === settings.name)).toBe(true)

    const h2s = screen.getAllByRole('heading', { level: 2 })
    expect(h2s.some((h) => h.textContent === settings.heroTitle)).toBe(true)
  })

  it('mobile: heroTitle is still the one big heading — the name is not repeated there', () => {
    render(<HeroHeading settings={settings} query="" onQueryChange={vi.fn()} />)

    // Both layouts are in the DOM; heroTitle appears as an <h1> (mobile's
    // lead line) as well as the <h2> asserted above — never a second <h1>
    // carrying the site name, which would mean mobile got a name heading too.
    const h1sWithHeroTitle = screen.getAllByRole('heading', { level: 1 }).filter((h) => h.textContent === settings.heroTitle)
    expect(h1sWithHeroTitle.length).toBe(1)

    const h1sWithName = screen.getAllByRole('heading', { level: 1 }).filter((h) => h.textContent === settings.name)
    expect(h1sWithName.length).toBe(1) // desktop's own <h1> only — not a second one for mobile
  })
})
