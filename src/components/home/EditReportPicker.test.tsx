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

// HomeBreak's Edit/Report step — a direct listing search (not a category
// picker; see ContributePicker, Add-only now), reusing the exact search the
// homepage's own hero search already does across every category. What
// matters: before typing, a "browse by category" fallback shows instead of
// a dead empty box, a match's category renders alongside its name as a
// disambiguator, only listings/categories whose action is actually enabled
// show up, and picking a listing deep-links straight into its Edit/Report
// form — the same `findView`/`findItemId`/`findAction` navigation a search
// result's own Edit/Report button already uses elsewhere.

function renderPicker(
  action: 'edit' | 'report',
  listings: ReturnType<typeof makeListing>[],
  categories: ReturnType<typeof makeCategory>[],
  onClose = vi.fn(),
) {
  return renderWithProviders(
    <ListingsProvider listings={listings}>
      <EditReportPicker action={action} coords={null} onClose={onClose} />
    </ListingsProvider>,
    { content: { categories } },
  )
}

describe('EditReportPicker', () => {
  it('shows a "browse by category" fallback before typing, not an empty box', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderPicker('edit', [makeListing({ id: 'l1', name: 'Acme Grocery', category: 'grocery' })], [grocery])

    expect(screen.getByText('Or browse by category')).toBeInTheDocument()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.queryByText('Acme Grocery')).not.toBeInTheDocument()
  })

  it('the fallback only lists categories where the action is actually enabled', () => {
    const noEdit = makeCategory({
      id: 'synagogue',
      pluralLabel: 'Synagogues',
      capabilities: { add: true, edit: false, report: true, directorySearch: true, map: true },
    })
    renderPicker('edit', [], [noEdit])

    expect(screen.getByText('Start typing a business name.')).toBeInTheDocument()
    expect(screen.queryByText('Synagogues')).not.toBeInTheDocument()
  })

  it('picking a category from the fallback opens that category and closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderPicker('edit', [], [grocery], onClose)

    await user.click(screen.getByText('Grocery Stores'))

    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining('/grocery'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a matching listing with its category as a disambiguator, once typed', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderPicker('edit', [makeListing({ id: 'l1', name: 'Acme Grocery', category: 'grocery' })], [grocery])

    await user.type(screen.getByLabelText('Search by name…'), 'Acme')

    expect(screen.getByText('Acme Grocery')).toBeInTheDocument()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
  })

  it('hides a match whose category has that action turned off', async () => {
    const user = userEvent.setup()
    const noEdit = makeCategory({
      id: 'synagogue',
      pluralLabel: 'Synagogues',
      capabilities: { add: true, edit: false, report: true, directorySearch: true, map: true },
    })
    renderPicker('edit', [makeListing({ id: 'l1', name: 'Acme Shul', category: 'synagogue' })], [noEdit])

    await user.type(screen.getByLabelText('Search by name…'), 'Acme')

    expect(screen.getByText(/No matches/)).toBeInTheDocument()
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
