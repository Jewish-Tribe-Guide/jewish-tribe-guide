// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ListingsProvider } from '@/lib/listingsContext'
import { LocationProvider } from '@/lib/locationContext'
import { ChangesProvider } from '@/lib/changesContext'
import { makeSavedSearch } from '@/lib/savedSearches'
import type { ChangeLogRow } from '@/lib/whatChanged'
import YouScreen from './YouScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/you',
  useSearchParams: () => new URLSearchParams(),
}))

const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
const listings = [
  makeListing({ id: 'tj', name: 'Trader Joe’s', category: 'grocery', m: ['Challah'] }),
  makeListing({ id: 'ac', name: 'ACME', category: 'grocery', m: ['Challah'] }),
]
const save = (...ids: string[]) => localStorage.setItem('jpc:pinned-listings', JSON.stringify(ids.map((id) => ({ id, categoryId: 'grocery' }))))
const challah = makeSavedSearch({ words: 'challah', kind: 'category', categoryId: 'grocery', href: '/test-community/grocery?q=challah' })

function show(changes: ChangeLogRow[] | null = null) {
  return renderWithProviders(
    <LocationProvider>
      <ListingsProvider listings={listings}>
        <ChangesProvider rows={changes}>
          <YouScreen />
        </ChangesProvider>
      </ListingsProvider>
    </LocationProvider>,
    { content: { categories: [grocery] } },
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

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
})
