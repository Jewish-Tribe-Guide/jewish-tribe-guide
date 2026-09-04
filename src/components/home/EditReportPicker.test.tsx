// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ListingsProvider } from '@/lib/listingsContext'
import EditReportPicker from './EditReportPicker'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  mockRouter.push.mockClear()
})

// HomeBreak's Edit/Report step — a direct listing search, not a category
// picker (see ContributePicker, Add-only now). What matters: every eligible
// listing shows before typing (a scrollable list beats a dead empty box),
// typing filters by NAME ONLY — not the shared searchListings' broader tag/
// address haystack, which surfaced unrelated businesses for a query like
// "house of kosher" (see the component's own doc) — each result carries its
// category AND address (two same-named, same-category listings are
// otherwise indistinguishable), only listings whose category actually
// allows the action show up, and picking one deep-links straight into that
// listing's Edit/Report form.

function renderPicker(
  action: 'edit' | 'report',
  listings: ReturnType<typeof makeListing>[],
  categories: ReturnType<typeof makeCategory>[],
  onClose = vi.fn(),
) {
  return renderWithProviders(
    <ListingsProvider listings={listings}>
      <EditReportPicker action={action} onClose={onClose} />
    </ListingsProvider>,
    { content: { categories } },
  )
}

describe('EditReportPicker', () => {
  it('shows every eligible listing before typing, not an empty box', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderPicker('edit', [makeListing({ id: 'l1', name: 'Acme Grocery', category: 'grocery' })], [grocery])

    expect(screen.getByText('Acme Grocery')).toBeInTheDocument()
    expect(screen.getByText(/Grocery Stores/)).toBeInTheDocument()
  })

  it('filters by name only — a query matching a tag/address but not the name finds nothing', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderPicker(
      'edit',
      [makeListing({ id: 'l1', name: 'Acme Grocery', category: 'grocery', address: '1 Rittenhouse Sq' })],
      [grocery],
    )

    // "house" is a substring of "Rittenhouse" (the address) — the shared
    // searchListings helper would match on that; a name-only filter must not.
    await user.type(screen.getByLabelText('Search by name…'), 'house')

    expect(screen.getByText(/No matches/)).toBeInTheDocument()
  })

  it('each result shows its category and address, for two same-named listings in the same category', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderPicker(
      'edit',
      [
        makeListing({ id: 'l1', name: "Trader Joe's", category: 'grocery', address: '2121 Market St' }),
        makeListing({ id: 'l2', name: "Trader Joe's", category: 'grocery', address: '1050 Chestnut St' }),
      ],
      [grocery],
    )

    expect(screen.getByText(/Grocery Stores · 2121 Market St/)).toBeInTheDocument()
    expect(screen.getByText(/Grocery Stores · 1050 Chestnut St/)).toBeInTheDocument()
  })

  it('hides a listing whose category has that action turned off', () => {
    const noEdit = makeCategory({
      id: 'synagogue',
      pluralLabel: 'Synagogues',
      capabilities: { add: true, edit: false, report: true, directorySearch: true, map: true },
    })
    renderPicker('edit', [makeListing({ id: 'l1', name: 'Acme Shul', category: 'synagogue' })], [noEdit])

    expect(screen.queryByText('Acme Shul')).not.toBeInTheDocument()
  })

  it('picking a result deep-links straight into that listing\'s form and closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderPicker('report', [makeListing({ id: 'l1', name: 'Acme Grocery', category: 'grocery' })], [grocery], onClose)

    await user.type(screen.getByLabelText('Search by name…'), 'Acme')
    await user.click(screen.getByText('Acme Grocery'))

    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining('item=l1'))
    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining('form=report'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
