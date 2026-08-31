// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { getBrowserClient } from '@/lib/supabase/client'
import type { EnrichedSubmission } from '@/types'
import ModerationQueue from './ModerationQueue'

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

function fakeResponse(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as Response
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    access_token: 'tok',
    user: { email: 'admin@example.com' },
    ...overrides,
  } as Session
}

function submission(overrides: Partial<EnrichedSubmission> = {}): EnrichedSubmission {
  return {
    id: 'sub-1',
    community_id: 'philly',
    operation: 'create',
    target_type: 'listing',
    target_id: null,
    payload: { category: 'grocery', name: 'Acme Grocery', address: '1 Main St', phone: '555-1234', details: {} },
    note: null,
    status: 'pending',
    submitted_by: { name: 'Jane Doe' },
    created_at: new Date().toISOString(),
    reviewed_at: null,
    categoryLabel: 'Grocery Stores',
    ...overrides,
  }
}

// The submission title (e.g. "Acme Grocery") and a details row can render
// the exact same text (a create's "Name" detail row repeats the title) —
// scope to the title's own element so a plain getByText doesn't ambiguously
// match both.
function titleText(name: string) {
  return screen.getByText(name, { selector: 'p.font-semibold' })
}
function queryTitleText(name: string) {
  return screen.queryByText(name, { selector: 'p.font-semibold' })
}
async function findTitleText(name: string) {
  return screen.findByText(name, { selector: 'p.font-semibold' })
}

function renderQueue(items: EnrichedSubmission[], sess = session()) {
  vi.mocked(fetch).mockResolvedValue(fakeResponse(200))
  vi.mocked(parseOkJson).mockResolvedValue({ submissions: items })
  return renderWithProviders(<ModerationQueue session={sess} />, {
    content: { categories: [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })] },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(getBrowserClient).mockReturnValue({ auth: { signOut: vi.fn() } } as unknown as ReturnType<typeof getBrowserClient>)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ModerationQueue — loading and empty states', () => {
  it('shows a clear-queue message once loaded with nothing pending', async () => {
    renderQueue([])
    expect(screen.getByText('Loading submissions…')).toBeInTheDocument()
    expect(await screen.findByText('🎉 Nothing pending — the queue is clear.')).toBeInTheDocument()
  })

  it('shows an unauthorized message on a 401, without treating it as an empty queue silently', async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(401))
    renderWithProviders(<ModerationQueue session={session({ user: { email: 'notadmin@example.com' } } as never)} />)

    expect(await screen.findByText(/not an authorized admin/)).toBeInTheDocument()
  })
})

describe('ModerationQueue — a pending submission', () => {
  it('renders a new-listing submission with its category badge and submitter', async () => {
    renderQueue([submission()])

    expect(await findTitleText('Acme Grocery')).toBeInTheDocument()
    expect(screen.getByText('➕ New listing')).toBeInTheDocument()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.getByText('by Jane Doe')).toBeInTheDocument()
  })

  it('renders an update as a before → after diff for a changed field', async () => {
    renderQueue([
      submission({
        operation: 'update',
        payload: { name: 'Acme Grocery', details: {} },
        current: { id: 'l1', community_id: 'philly', category: 'grocery', name: 'Acme Grocery', anchor_id: 'community', distance: null, address: 'Old Address', phone: null, details: {}, status: 'approved', submitted_by: null, created_at: '', reviewed_at: null },
      }),
    ])

    await screen.findByText('✏️ Edit')
    // Address only appears in `current` (the payload didn't touch it), so it
    // shows unchanged rather than as a diff.
    expect(screen.getByText('Old Address')).toBeInTheDocument()
  })

  it('renders a removal report with its note', async () => {
    renderQueue([
      submission({
        operation: 'delete',
        note: 'Permanently closed',
        current: { id: 'l1', community_id: 'philly', category: 'grocery', name: 'Acme Grocery', anchor_id: 'community', distance: null, address: '1 Main St', phone: null, details: {}, status: 'approved', submitted_by: null, created_at: '', reviewed_at: null },
      }),
    ])

    await screen.findByText('🗑️ Removal')
    expect(screen.getByText(/Reported for removal.*Permanently closed/)).toBeInTheDocument()
  })

  it('renders a new-category submission', async () => {
    renderQueue([
      submission({
        target_type: 'category',
        payload: { label: 'Kosher Bakeries', description: 'Bakeries near the hospital', firstListing: { name: 'Sweet Treats', address: '2 Oak St', phone: '555-0000' } },
        categoryLabel: undefined,
      }),
    ])

    await screen.findByText('🆕 New category')
    expect(screen.getByText('Kosher Bakeries')).toBeInTheDocument()
    expect(screen.getByText('Sweet Treats')).toBeInTheDocument()
  })

  // Some categories configure `googleDescription` as a real, human-editable
  // "Description" field (see ListingForm.tsx's intake autofill and
  // googlePlaces.ts's recurring sync) — that's real content worth a
  // moderator seeing. Others never configure it at all, in which case any
  // value there is only the sync's own fallback card-subtitle text and
  // should stay hidden, same as geo/placeId/businessStatus.
  it('shows the Description field when the category has configured googleDescription', async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200))
    vi.mocked(parseOkJson).mockResolvedValue({
      submissions: [
        submission({
          payload: {
            category: 'grocery',
            name: 'Acme Grocery',
            address: '1 Main St',
            phone: '555-1234',
            details: { googleDescription: 'A neighborhood grocery store.' },
          },
        }),
      ],
    })
    renderWithProviders(<ModerationQueue session={session()} />, {
      content: {
        categories: [
          makeCategory({
            id: 'grocery',
            pluralLabel: 'Grocery Stores',
            detailFields: [{ key: 'googleDescription', type: 'text', label: 'Description' }],
          }),
        ],
      },
    })

    await findTitleText('Acme Grocery')
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('A neighborhood grocery store.')).toBeInTheDocument()
  })

  it('hides googleDescription when the category never configured it as a field', async () => {
    renderQueue([
      submission({
        payload: {
          category: 'grocery',
          name: 'Acme Grocery',
          address: '1 Main St',
          phone: '555-1234',
          details: { googleDescription: 'Fallback subtitle text only.' },
        },
      }),
    ])

    await findTitleText('Acme Grocery')
    expect(screen.queryByText('Fallback subtitle text only.')).not.toBeInTheDocument()
  })
})

describe('ModerationQueue — moderating', () => {
  it('approving calls the PATCH endpoint and removes the item from the list', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderQueue([submission()])
    await findTitleText('Acme Grocery')

    await user.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(queryTitleText('Acme Grocery')).not.toBeInTheDocument())
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/submissions/sub-1?community=test-community',
      expect.objectContaining({ method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      'Failed to update.',
    )
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ status: 'approved' })
  })

  it('rejecting opens a reason box, and confirming sends it along', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderQueue([submission()])
    await findTitleText('Acme Grocery')

    await user.click(screen.getByRole('button', { name: 'Reject' }))
    await user.type(screen.getByPlaceholderText(/already listed/), 'Duplicate listing')
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }))

    await waitFor(() => expect(queryTitleText('Acme Grocery')).not.toBeInTheDocument())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ status: 'rejected', reason: 'Duplicate listing' })
  })

  it('canceling a reject leaves the submission in place, unmoderated', async () => {
    const user = userEvent.setup()
    renderQueue([submission()])
    await findTitleText('Acme Grocery')

    await user.click(screen.getByRole('button', { name: 'Reject' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(titleText('Acme Grocery')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })
})

describe('ModerationQueue — signing out', () => {
  it('the Sign out button calls the browser client’s signOut', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn()
    vi.mocked(getBrowserClient).mockReturnValue({ auth: { signOut } } as unknown as ReturnType<typeof getBrowserClient>)
    renderQueue([])
    await screen.findByText('🎉 Nothing pending — the queue is clear.')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
