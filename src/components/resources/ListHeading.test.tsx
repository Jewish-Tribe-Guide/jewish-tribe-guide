// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ListHeading from './ListHeading'

// The list's row on a phone (board G1, Nov 16): Map first, then Filters and
// Sort, on one line. What gives way for Map is pinned here; whether it
// really fits one line at 360 is a layout question, so e2e/phone-map-row
// asks it in a real browser.

afterEach(cleanup)

const filters = { active: 0, onOpen: vi.fn() }
const sort = { byPopular: false, onSelect: vi.fn() }

describe('ListHeading — Map in the row', () => {
  it('puts Map between Filters and Sort, on a phone only, as a link to the Map tab', () => {
    render(<ListHeading count={71} total={71} filters={filters} sort={sort} mapHref="/philly/map?cat=restaurant&from=restaurant" />)
    const map = screen.getByRole('link', { name: 'Map' })
    expect(map).toHaveAttribute('href', '/philly/map?cat=restaurant&from=restaurant')
    // A computer has the map beside the list instead.
    expect(map.className).toMatch(/(^|\s)lg:hidden(\s|$)/)
    // Sort's menu at the end (the user, Nov 17).
    const buttons = [...map.parentElement!.children]
    expect(buttons.map((b) => b.textContent)).toEqual(['Filters', 'Map', expect.stringMatching(/^Sort/)])
  })

  it('draws Map as a word: Filters keeps its symbol, Sort its chevron', () => {
    render(<ListHeading count={71} total={71} filters={filters} sort={sort} mapHref="/m" />)
    expect(screen.getByRole('link', { name: 'Map' }).querySelector('svg')).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters' }).querySelectorAll('svg')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Sort Distance' }).querySelectorAll('svg')).toHaveLength(1)
  })

  it('takes the bare count off a phone to make room, and keeps it on a computer', () => {
    render(<ListHeading count={71} total={71} filters={filters} sort={sort} mapHref="/m" />)
    const count = screen.getByRole('heading', { name: '71 listings' })
    expect(count.className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(count.className).toMatch(/(^|\s)lg:block(\s|$)/)
  })

  it('moves a group’s name under the buttons on a phone rather than dropping it', () => {
    render(<ListHeading label="Open now" count={57} total={71} filters={filters} mapHref="/m" />)
    const name = screen.getByRole('heading', { name: 'Open now · 57' })
    expect(name.className).not.toMatch(/(^|\s)hidden(\s|$)/)
    expect(name.className).toMatch(/(^|\s)order-last(\s|$)/)
    expect(name.className).toMatch(/(^|\s)basis-full(\s|$)/)
  })

  it('changes nothing without Map (the eruv list keeps its count)', () => {
    render(<ListHeading noun count={3} total={3} units={['eruv', 'eruvim']} />)
    const count = screen.getByRole('heading', { name: '3 eruvim' })
    expect(count.className).not.toMatch(/(^|\s)hidden(\s|$)/)
    expect(count.className).not.toMatch(/order-last/)
    expect(screen.queryByRole('link', { name: 'Map' })).not.toBeInTheDocument()
  })

  it('keeps "left today", which says something the rows don’t', () => {
    render(<ListHeading count={4} total={4} units={['minyan', 'minyanim']} suffix="left today" filters={filters} mapHref="/m" />)
    expect(screen.getByRole('heading', { name: /4 minyanim\s*left today/ }).className).not.toMatch(/(^|\s)hidden(\s|$)/)
  })

  it('says Sort on a phone too, not just the choice', () => {
    render(<ListHeading count={71} total={71} sort={sort} mapHref="/m" />)
    const button = screen.getByRole('button', { name: 'Sort Distance' })
    const word = [...button.querySelectorAll('span')].find((e) => e.textContent === 'Sort')!
    expect(word.className).not.toMatch(/sr-only/)
  })

  it('spaces the buttons 8px apart, a phone as a computer', () => {
    render(<ListHeading count={71} total={71} filters={filters} sort={sort} mapHref="/m" />)
    const group = screen.getByRole('link', { name: 'Map' }).parentElement!
    // On a phone the group dissolves into the row, whose gap is 8px.
    expect(group.className).toMatch(/(^|\s)lg:gap-2(\s|$)/)
    expect(group.parentElement!.className).toMatch(/(^|\s)gap-x-2(\s|$)/)
  })

  // The user, Nov 17: "always know that filter and map are on the left and
  // then the right is either sort, toggle, or nothing". Where each lands
  // is measured in e2e/phone-map-row; this pins what puts it there.
  it('on a phone, Sort is pushed to the right, after Filters and Map', () => {
    render(<ListHeading count={71} total={71} filters={filters} sort={sort} mapHref="/m" />)
    const sortBox = screen.getByRole('button', { name: 'Sort Distance' }).parentElement!.parentElement!
    expect(sortBox.className).toMatch(/(^|\s)max-lg:ml-auto(\s|$)/)
    expect(screen.getByRole('link', { name: 'Map' }).parentElement!.className).toMatch(/(^|\s)contents(\s|$)/)
  })

  it('on a phone, Synagogues’ switch comes after Filters and Map, to the right; a computer shows it first', () => {
    render(<ListHeading count={71} total={71} filters={filters} mapHref="/m" lead={<span>switch</span>} />)
    const lead = screen.getByTestId('list-lead')
    // After them in the page itself, so Tab and a screen reader agree with the eye.
    expect(screen.getByRole('link', { name: 'Map' }).compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lead.className).toMatch(/(^|\s)max-lg:ml-auto(\s|$)/)
    expect(lead.className).toMatch(/(^|\s)lg:order-first(\s|$)/)
  })

  it('makes Map wider than its word, from 375 wide up', () => {
    render(<ListHeading count={71} total={71} filters={filters} sort={sort} mapHref="/m" />)
    expect(screen.getByRole('link', { name: 'Map' }).className).toMatch(/(^|\s)min-\[375px\]:px-5(\s|$)/)
  })
})
