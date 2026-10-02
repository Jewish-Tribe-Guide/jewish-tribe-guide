// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ChangesProvider } from '@/lib/changesContext'
import type { ChangeLogRow } from '@/lib/whatChanged'
import ChangesScreen from './ChangesScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/changes',
  useSearchParams: () => new URLSearchParams(),
}))

// The What changed page at Friday Oct 2, 2026, 1:30 PM in New York (the test
// community's time zone), from the log as the server hands it over.
const categories = [makeCategory({ id: 'grocery', label: 'Grocery' }), makeCategory({ id: 'restaurant', label: 'Food' })]
let id = 1
const row = (createdAt: string, over: Partial<ChangeLogRow> = {}): ChangeLogRow => ({
  id: id++,
  createdAt,
  kind: 'listing_edited',
  source: 'submission',
  item: null,
  submissionId: null,
  hidden: false,
  listing: { id: '11111111-aaaa', name: 'ALDI', category: 'grocery', status: 'approved' },
  ...over,
})

function show(rows: ChangeLogRow[] | null) {
  renderWithProviders(
    <ChangesProvider rows={rows}>
      <ChangesScreen failed={rows === null} />
    </ChangesProvider>,
    { content: { categories }, community: { timezone: 'America/New_York' } },
  )
  // useNow reads the clock when the tab is focused.
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-02T13:30:00-04:00'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the What changed page', () => {
  it('by day in the community’s time, newest first, each line opening its listing', () => {
    show([
      row('2026-10-01T22:00:00Z', { listing: { id: '22222222-bbbb', name: 'Ben & Jerry’s', category: 'restaurant', status: 'approved' } }),
      row('2026-10-01T16:00:00Z', { kind: 'item_added', item: 'Pretzel Buns' }),
      row('2026-09-30T19:00:00Z', { kind: 'listing_added', listing: { id: '33333333-cccc', name: 'Charlie was a sinner.', category: 'restaurant', status: 'approved' } }),
      row('2026-10-02T14:00:00Z', { kind: 'listing_confirmed', source: 'visitor' }),
    ])
    const days = screen.getAllByTestId('changes-day')
    expect(days.map((d) => d.querySelector('h2')?.textContent)).toEqual(['Yesterday', 'Wednesday, Sep 30'])
    expect(within(days[0]).getAllByTestId('change').map((c) => c.textContent)).toEqual(['Ben & Jerry’s updatedFood · 6 PM', 'Pretzel Buns added at ALDIGrocery · 12 PM'])
    expect(within(days[1]).getByRole('link')).toHaveTextContent('New: Charlie was a sinner.')
    expect(screen.getByText(/^3 changes in the last 7 days/)).toBeInTheDocument()
  })

  it('under each edit, everything it changed, one to a line, in full', () => {
    const note = 'Alcoholic beverages are NOT under supervision; list of approved alcoholic beverages available at restaurant upon request.'
    show([
      row('2026-10-01T22:00:00Z', {
        changes: [
          { key: 'hours', label: 'Hours', value: 'Sunday 11 AM – 10 PM' },
          { key: 'kosherNote', label: 'What isn’t kosher?', value: note },
          { key: 'photo', label: '', value: 'New photo', quiet: true },
        ],
      }),
    ])
    const lines = [...screen.getByTestId('change-parts').children].map((c) => c.textContent)
    expect(lines).toEqual(['Hours Sunday 11 AM – 10 PM', `What isn’t kosher? ${note}`, 'New photo'])
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument()
  })

  it('a place taken out of the guide says so, and has no link (its page is gone)', () => {
    show([row('2026-10-01T22:00:00Z', { kind: 'listing_removed', listing: { id: '44444444-dddd', name: 'Closed Deli', category: 'grocery', status: 'archived' } })])
    const change = screen.getByTestId('change')
    expect(change).toHaveTextContent('Closed Deli taken out of the guide')
    expect(within(change).queryByRole('link')).not.toBeInTheDocument()
  })

  it('nothing in 30 days says so; a failed read says that, not “nothing changed”', () => {
    show([row('2026-08-01T22:00:00Z')])
    expect(screen.getByText('Nothing’s changed in the last 30 days.')).toBeInTheDocument()
    cleanup()
    show(null)
    expect(screen.getByText(/couldn’t be loaded/)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing’s changed/)).not.toBeInTheDocument()
  })
})
