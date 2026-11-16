// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ListingsProvider } from '@/lib/listingsContext'
import { LocationProvider } from '@/lib/locationContext'
import { ChangesProvider } from '@/lib/changesContext'
import { makeSavedSearch } from '@/lib/savedSearches'
import type { ChangeLogRow } from '@/lib/whatChanged'
import type { Eruv } from '@/lib/eruv'
import { clearEruvStatuses } from '@/lib/useEruvStatuses'
import { ForcedViewport } from '@/lib/useIsMobile'
import { ScreenHeaderProvider, useScreenHeader } from '@/lib/headerVisibility'
import YouScreen from './YouScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/you',
  useSearchParams: () => new URLSearchParams(),
}))

// The time, for a test that needs one (a saved eruv's "this Shabbos").
const clock = vi.hoisted(() => ({ at: null as number | null }))
vi.mock('@/lib/useNow', async (actual) => {
  const real = await actual<typeof import('@/lib/useNow')>()
  return { ...real, useNow: () => clock.at ?? real.useNow() }
})

const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
const listings = [
  makeListing({ id: 'tj', name: 'Trader Joe’s', category: 'grocery', m: ['Challah'] }),
  makeListing({ id: 'ac', name: 'ACME', category: 'grocery', m: ['Challah'] }),
]
const save = (...ids: string[]) => localStorage.setItem('jpc:pinned-listings', JSON.stringify(ids.map((id) => ({ id, categoryId: 'grocery' }))))
const eruvPage = makeCategory({ id: 'eruv-information', kind: 'eruv', label: 'Eruv Information', pluralLabel: 'Eruvim' })
const centerCity: Eruv = {
  id: 'center-city', name: 'Center City Eruv', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: 'https://example.org', statusDated: false,
  status: 'up', statusWords: 'The Eruv is Up!', statusPostedOn: null, statusCheckedAt: '2026-10-09T18:55:00Z', statusErrorAt: null, statusError: null,
}
// /api/eruv, answered; anything else as it was.
function eruvim(list: Eruv[]) {
  const real = globalThis.fetch
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    String(url).startsWith('/api/eruv') ? Promise.resolve(new Response(JSON.stringify({ ok: true, available: true, timezone: 'America/New_York', candles: 18 * 60 + 12, eruvim: list }))) : real(url, init),
  )
}
// A finger's swipe left across a row.
function swipe(el: HTMLElement) {
  fireEvent.pointerDown(el, { pointerType: 'touch', clientX: 300, clientY: 100 })
  fireEvent.pointerMove(el, { pointerType: 'touch', clientX: 150, clientY: 100 })
  fireEvent.pointerUp(el, { pointerType: 'touch', clientX: 150, clientY: 100 })
}
const challah = makeSavedSearch({ words: 'challah', kind: 'category', categoryId: 'grocery', href: '/test-community/grocery?q=challah' })

function show(changes: ChangeLogRow[] | null = null, { mobile = false } = {}) {
  return renderWithProviders(
    <ForcedViewport isMobile={mobile}>
      <LocationProvider>
        <ListingsProvider listings={listings}>
          <ChangesProvider rows={changes}>
            <YouScreen />
          </ChangesProvider>
        </ListingsProvider>
      </LocationProvider>
    </ForcedViewport>,
    { content: { categories: [grocery, eruvPage] } },
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  clock.at = null
  clearEruvStatuses()
  vi.unstubAllGlobals()
})

describe('You', () => {
  // Board W11 (the user, Nov 15): the same words on a phone and a computer,
  // and on a computer three dashed outlines where the cards will go.
  it('nothing saved: says how to save, and a computer draws where the cards will go', () => {
    show()
    expect(screen.getByTestId('you-empty')).toHaveTextContent('Nothing saved yet')
    expect(screen.getByTestId('you-empty')).toHaveTextContent('Tap the bookmark on any place or search.')
    expect(screen.getByTestId('you-empty-cards').children).toHaveLength(3)
    expect(screen.getByTestId('category-hero-count')).toBeEmptyDOMElement()
  })

  it('saved places, newest first, and saved searches with what they find now, in the home line’s words', async () => {
    save('ac', 'tj')
    localStorage.setItem('jpc:saved-searches', JSON.stringify([challah]))
    show()
    const places = within(screen.getByTestId('you-places')).getAllByRole('link').map((a) => a.textContent)
    expect(places[0]).toMatch(/^TJTrader Joe’s|Trader Joe’s/)
    expect(places[1]).toMatch(/ACME/)
    const searches = screen.getByTestId('you-searches')
    expect(within(searches).getByRole('link')).toHaveAttribute('href', '/test-community/grocery?q=challah')
    expect(await within(searches).findByText('Grocery · 2 with Challah')).toBeInTheDocument()
    expect(screen.getByText('Saved on this phone')).toBeInTheDocument()
    // Board W11: what's kept here, on the computer's photo.
    expect(screen.getByTestId('category-hero-count')).toHaveTextContent('2 places · 1 search')
  })

  it('removing a place says so, with Undo, which puts it back where it was', async () => {
    const user = userEvent.setup()
    save('ac', 'tj')
    show()
    await user.click(screen.getByRole('button', { name: 'Save ACME' }))
    expect(within(screen.getByTestId('you-places')).queryByText('ACME')).not.toBeInTheDocument()
    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Removed from You')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(JSON.parse(localStorage.getItem('jpc:pinned-listings')!).map((p: { id: string }) => p.id)).toEqual(['ac', 'tj'])
  })

  it('removing a search takes it off', async () => {
    const user = userEvent.setup()
    save('tj')
    localStorage.setItem('jpc:saved-searches', JSON.stringify([challah]))
    show()
    await user.click(screen.getByRole('button', { name: 'Save “challah”' }))
    expect(screen.queryByTestId('you-searches')).not.toBeInTheDocument()
    expect(localStorage.getItem('jpc:saved-searches')).toBeNull()
  })

  // Oct 15: the bookmark used to appear only on hover, flashing past every
  // row the mouse crossed, with a chevron it replaced. Now desktop's bookmark
  // is always there (a phone swipes, so it's desktop-only), and no row has a
  // chevron. Later the same day: "why wouldn't you use the same symbol that
  // we have on the listings and searches themselves?" So it's SaveButton,
  // filled, not a look of its own.
  it('desktop’s remove is the same bookmark as everywhere, always there, not on hover, and no row has a chevron', () => {
    save('tj')
    localStorage.setItem('jpc:saved-searches', JSON.stringify([challah]))
    show()
    const marks = screen.getAllByTestId('you-row-bookmark')
    expect(marks.map((m) => within(m).getByTestId('save-button').getAttribute('aria-label'))).toEqual(['Save Trader Joe’s', 'Save “challah”'])
    for (const m of marks) {
      expect(within(m).getByTestId('save-button')).toHaveAttribute('aria-pressed', 'true')
      for (const el of [m, ...m.querySelectorAll('*')]) expect(el.getAttribute('class') ?? '').not.toMatch(/opacity-0|group-hover:/)
      expect(m.className).toMatch(/\bdesktop:flex\b/)
    }
    // ChevronRightIcon's path.
    expect(document.querySelector('path[d="M9 18l6-6-6-6"]')).toBeNull()
  })

  // Oct 15: "Desktop You page shouldn't have swipe." A phone swipes a row
  // to Remove; desktop has its bookmark instead, as a listing row has no
  // swipe there either.
  it('a phone swipes a row to Remove; desktop doesn’t swipe at all', () => {
    save('tj')
    localStorage.setItem('jpc:saved-searches', JSON.stringify([challah]))
    show(null, { mobile: true })
    swipe(screen.getByText('Trader Joe’s'))
    expect(screen.getByRole('button', { name: 'Remove Trader Joe’s' })).toBeInTheDocument()
    swipe(screen.getByText('“challah”'))
    expect(screen.getByRole('button', { name: 'Remove “challah”' })).toBeInTheDocument()
    cleanup()

    show()
    swipe(screen.getByText('Trader Joe’s'))
    swipe(screen.getByText('“challah”'))
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })

  it('a dot and two words on a place that changed since the last look; none the first time', async () => {
    save('tj', 'ac')
    const changes: ChangeLogRow[] = [
      {
        id: 7,
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        kind: 'listing_edited',
        source: 'submission',
        item: null,
        submissionId: 's1',
        hidden: false,
        changes: [{ key: 'hours', label: 'Hours', value: 'Sunday 9 AM – 9 PM' }],
        listing: { id: 'tj', name: 'Trader Joe’s', category: 'grocery', status: 'approved' },
      },
    ]
    show(changes)
    expect(screen.queryByTestId('you-changed-dot')).not.toBeInTheDocument()
    cleanup()

    localStorage.setItem('jpc:you-seen-at', String(Date.now() - 3_600_000))
    show(changes)
    expect(await screen.findAllByTestId('you-changed-dot')).toHaveLength(1)
    expect(screen.getByText('New hours')).toBeInTheDocument()
  })

  // Oct 15: an eruv couldn't be saved; now it's saved from its listing as
  // the Eruv page's, and You says whether it's up.
  it('a saved restaurant in a category that can list minyanim says whether it’s open, not “No davening times”', () => {
    // Food has a minyanim field for the few restaurants that host one; a
    // place without any is a restaurant, and its row is its hours (Nov 15).
    const food = makeCategory({
      id: 'food',
      label: 'Food',
      pluralLabel: 'Food',
      detailFields: [
        { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' },
        { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
      ],
    })
    const allDay = { open: '00:00', close: '23:59' }
    const hours = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, allDay]))
    const cafe = makeListing({ id: 'cafe', name: 'HipCityVeg', category: 'food', hours })
    localStorage.setItem('jpc:pinned-listings', JSON.stringify([{ id: 'cafe', categoryId: 'food' }]))
    clock.at = new Date(2026, 9, 7, 14, 0).getTime()
    renderWithProviders(
      <ForcedViewport isMobile={false}>
        <LocationProvider>
          <ListingsProvider listings={[cafe]}>
            <ChangesProvider rows={null}>
              <YouScreen />
            </ChangesProvider>
          </ListingsProvider>
        </LocationProvider>
      </ForcedViewport>,
      { content: { categories: [food] } },
    )
    const row = screen.getByText('HipCityVeg').closest('.group') as HTMLElement
    expect(within(row).getByText(/^Open/)).toBeTruthy()
    expect(within(row).queryByText(/davening/i)).toBeNull()
  })

  it('a saved eruv: whether it’s up and when the guide checked, opening it on the Eruv page; removing it says so', async () => {
    const user = userEvent.setup()
    clock.at = Date.parse('2026-10-09T19:00:00Z') // Fri 3 PM in Philadelphia
    eruvim([centerCity])
    localStorage.setItem('jpc:pinned-listings', JSON.stringify([{ id: 'tj', categoryId: 'grocery' }, { id: 'center-city', categoryId: 'eruv-information' }]))
    show()
    const places = await screen.findByTestId('you-places')
    const links = within(places).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual([expect.stringContaining('Center City EruvUp for this Shabbos · From example.org, 2:55 PM'), expect.stringContaining('Trader Joe’s')])
    expect(links[0]).toHaveAttribute('href', '/test-community/eruv?item=center-city')
    expect(within(links[0]).getByText('Up for this Shabbos')).toHaveClass('text-green-700')
    await user.click(screen.getByRole('button', { name: 'Save Center City Eruv' }))
    expect(within(screen.getByTestId('you-places')).queryByText('Center City Eruv')).not.toBeInTheDocument()
    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Removed from You')
  })

  it('a saved eruv that’s gone is skipped', async () => {
    eruvim([])
    localStorage.setItem('jpc:pinned-listings', JSON.stringify([{ id: 'tj', categoryId: 'grocery' }, { id: 'center-city', categoryId: 'eruv-information' }]))
    show()
    const places = await screen.findByTestId('you-places')
    expect(within(places).getAllByRole('link').map((a) => a.textContent)).toEqual([expect.stringContaining('Trader Joe’s')])
  })

  // Nov 16 (canvas "Search on You", boards 1-4 and 2b): a place or a search
  // can be saved without leaving You. The home's lines, under a box of You's
  // own, each with a bigger round bookmark.
  describe('its own search', () => {
    it('a box under the title, asking for a place or a search; once something is saved, for more', () => {
      show()
      expect(screen.getByRole('textbox', { name: 'Find a place or a search to save' })).toHaveAttribute('placeholder', 'Find a place or a search to save')
      cleanup()
      save('tj')
      show()
      expect(screen.getByRole('textbox', { name: 'Find a place or a search to save' })).toHaveAttribute('placeholder', 'Find more to save')
    })

    it('typing a name shows its place with the round bookmark, which saves it into Places right there', async () => {
      const user = userEvent.setup()
      show()
      await user.type(screen.getByRole('textbox', { name: 'Find a place or a search to save' }), 'trader')
      const lines = await screen.findByTestId('search-lines')
      const bookmark = within(lines).getByRole('button', { name: 'Save Trader Joe’s' })
      expect(bookmark).toHaveAttribute('aria-pressed', 'false')
      // Board 2b: a tinted 44px circle even before it's saved.
      expect(bookmark.className).toMatch(/\bh-11\b/)
      expect(bookmark.className).toMatch(/bg-primary\/10/)
      await user.click(bookmark)
      expect(within(screen.getByTestId('search-lines')).getByRole('button', { name: 'Save Trader Joe’s' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(screen.getByTestId('you-places')).getByText('Trader Joe’s')).toBeInTheDocument()
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('a kind of place’s line saves the search; the line itself, or Enter, still opens it', async () => {
      const user = userEvent.setup()
      mockRouter.push.mockClear()
      show()
      const box = screen.getByRole('textbox', { name: 'Find a place or a search to save' })
      await user.type(box, 'challah')
      const lines = await screen.findByTestId('search-lines')
      await user.click(within(lines).getByRole('button', { name: /^Save “challah” in / }))
      expect(within(screen.getByTestId('you-searches')).getByText('“challah”')).toBeInTheDocument()
      await user.type(box, '{Enter}')
      expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining('/test-community/grocery'))
    })

    it('nothing found says so', async () => {
      const user = userEvent.setup()
      show()
      await user.type(screen.getByRole('textbox', { name: 'Find a place or a search to save' }), 'zzzqqq')
      expect(await screen.findByTestId('you-search-nothing')).toHaveTextContent('Nothing in the guide for “zzzqqq”')
    })
  })
})

// The user, Nov 16: You names itself in the phone header, so a phone's page
// starts with its search.
describe('You — the header', () => {
  function HeaderTitle() {
    const h = useScreenHeader()
    return <p data-testid="header-state">{h ? `${h.title}${h.onBack ? ' ‹' : ''}` : 'none'}</p>
  }
  it('says You there, with no Back, and the page’s own title is for a screen reader', () => {
    renderWithProviders(
      <ScreenHeaderProvider>
        <ForcedViewport isMobile>
          <LocationProvider>
            <ListingsProvider listings={listings}>
              <ChangesProvider rows={null}>
                <YouScreen />
                <HeaderTitle />
              </ChangesProvider>
            </ListingsProvider>
          </LocationProvider>
        </ForcedViewport>
      </ScreenHeaderProvider>,
      { content: { categories: [grocery, eruvPage] } },
    )
    expect(screen.getByTestId('header-state')).toHaveTextContent(/^You$/)
    expect(screen.getByRole('heading', { level: 1, name: 'You' })).toHaveClass('sr-only')
  })
})

