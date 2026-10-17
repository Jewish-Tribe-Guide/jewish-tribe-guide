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
  it('nothing saved: says how to save', () => {
    show()
    expect(screen.getByTestId('you-empty')).toHaveTextContent('Nothing saved yet')
    expect(screen.getByTestId('you-empty')).toHaveTextContent('Tap Save on a place or a search.')
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
})
