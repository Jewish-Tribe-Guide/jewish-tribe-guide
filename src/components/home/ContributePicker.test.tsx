// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import ContributePicker from './ContributePicker'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

// Step two of HomeBreak's Add/Edit/Report picker (step one — which action —
// is just the three buttons on the card). What matters here: only
// categories that actually support the chosen action show up (a category
// with editing turned off has no business being offered for "Edit"), and
// picking one hands off to the flow that already exists — `create`
// deep-links straight into the Add form, `edit`/`report` land on the
// category's own list, where the real per-listing Edit/Report already live.

describe('ContributePicker', () => {
  it('only lists categories where the chosen action is actually enabled', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const noEdits = makeCategory({
      id: 'synagogue',
      pluralLabel: 'Synagogues',
      capabilities: { add: true, edit: false, report: true, directorySearch: true, map: true },
    })
    renderWithProviders(<ContributePicker action="edit" onClose={vi.fn()} />, {
      content: { categories: [grocery, noEdits] },
    })

    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.queryByText('Synagogues')).not.toBeInTheDocument()
  })

  it('links "create" straight into that category\'s Add form (?form=create)', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderWithProviders(<ContributePicker action="create" onClose={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    const link = screen.getByRole('link', { name: 'Grocery Stores' })
    expect(link).toHaveAttribute('href', expect.stringMatching(/\/grocery\?form=create$/))
  })

  it('links "edit"/"report" to the plain category page — no listing chosen yet, so no form param', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderWithProviders(<ContributePicker action="report" onClose={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    const link = screen.getByRole('link', { name: 'Grocery Stores' })
    expect(link).toHaveAttribute('href', expect.stringMatching(/\/grocery$/))
    expect(link.getAttribute('href')).not.toMatch(/\?/)
  })

  it('shows the action-specific title', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderWithProviders(<ContributePicker action="create" onClose={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    expect(screen.getByRole('heading', { name: 'Add a listing' })).toBeInTheDocument()
  })
})
