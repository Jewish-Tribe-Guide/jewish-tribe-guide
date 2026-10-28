// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import type { EnrichedSubmission } from '@/types'
import ModerationQueue from './ModerationQueue'

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))
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
    reviewed_by: null,
    case_number: 1,
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
    expect(screen.getByText('New place')).toBeInTheDocument()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    // "by Jane Doe" is part of the same "Submitted <date> by Jane Doe" line
    // now (see SubmissionCard's own comment on why "when" always shows) —
    // a regex, not the old exact string, since it's no longer standalone text.
    expect(screen.getByText(/by Jane Doe/)).toBeInTheDocument()
  })

  it('renders an update as a before → after diff for a changed field', async () => {
    renderQueue([
      submission({
        operation: 'update',
        payload: { name: 'Acme Grocery', details: {} },
        current: { id: 'l1', community_id: 'philly', category: 'grocery', name: 'Acme Grocery', anchor_id: 'community', distance: null, address: 'Old Address', phone: null, details: {}, status: 'approved', submitted_by: null, created_at: '', reviewed_at: null },
      }),
    ])

    await screen.findByText('Edit')
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

    await screen.findByText('Removal')
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

    await screen.findByText('New category')
    expect(screen.getByText('Kosher Bakeries')).toBeInTheDocument()
    expect(screen.getByText('Sweet Treats')).toBeInTheDocument()
  })

  // Some categories configure `googleDescription` as a real, human-editable
  // "Description" field (see useListingDraft's address-pick autofill and
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

// The opened card (agreed Oct 5, canvas QOpen): the original beside a form
// the admin can fix, so a typo is fixed instead of rejected and redone.
// "Pick the Google place" stands in for choosing a suggestion: Google's
// details for it are `picked`.
const picked = vi.hoisted(() => ({
  place: null as null | Record<string, unknown>,
}))
vi.mock('@/components/intake/AddressInput', () => ({
  default: ({ id, value, onChange, onCoords, onPlaceSelect }: { id?: string; value: string; onChange: (v: string) => void; onCoords?: (g: { lat: number; lng: number }) => void; onPlaceSelect?: (p: never) => void }) => (
    <>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      {onPlaceSelect && (
        <button
          type="button"
          onClick={() => {
            onChange('1 Bakery Way, Philadelphia, PA 19103, USA')
            onCoords?.({ lat: 39.95, lng: -75.17 })
            onPlaceSelect(picked.place as never)
          }}
        >
          Pick the Google place
        </button>
      )}
    </>
  ),
}))

describe('ModerationQueue — an opened card', () => {
  const shulCategory = makeCategory({
    id: 'synagogue',
    pluralLabel: 'Synagogues',
    detailFields: [
      { key: 'minyanim', type: 'minyanim', label: 'Davening times' },
      { key: 'rabbi', type: 'text', label: 'Rabbi' },
    ],
  })
  const current = {
    id: 'shul-1',
    category: 'synagogue',
    name: 'Mekor Habracha',
    address: '1500 Walnut St',
    phone: '',
    details: { rabbi: 'Rabbi Ex', minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['fri'], time: '6:23 PM' }] },
  }
  // What the shul card's "Update their times" files (api/resource/[id]/times).
  const aiEdit = submission({
    id: 'sub-ai',
    operation: 'update',
    target_id: 'shul-1',
    categoryLabel: 'Synagogues',
    submitted_by: null,
    current: current as never,
    payload: {
      category: 'synagogue',
      name: 'Mekor Habracha',
      address: '1500 Walnut St',
      phone: '',
      details: { rabbi: 'Rabbi Ex', minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['fri'], time: '6:20 PM' }] },
    },
    note: 'Times for particular days, sent from the shul’s card.\n\nRead from what they pasted:\n6:23pm Candle Lighting\n6:20pm Mincha',
  })

  function renderShulQueue(items: EnrichedSubmission[]) {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200))
    vi.mocked(parseOkJson).mockResolvedValue({ submissions: items })
    return renderWithProviders(<ModerationQueue session={session()} />, {
      content: { categories: [shulCategory, makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })] },
    })
  }

  afterEach(() => window.history.replaceState(null, '', '/'))

  it('labels an AI-read card and says when a time in the original wasn’t used', async () => {
    renderShulQueue([aiEdit])
    await findTitleText('Mekor Habracha')
    expect(screen.getByText('Read by AI')).toBeInTheDocument()
    expect(screen.getByText(/1 time in the original isn’t used/)).toBeInTheDocument()
    expect(screen.getByText(/from what they pasted/)).toBeInTheDocument()
  })

  it('clicking a card opens it, with the original marked beside the change, and Back returns to the list', async () => {
    const user = userEvent.setup()
    renderShulQueue([aiEdit])
    await user.click(await screen.findByText('Synagogues'))

    expect(screen.getByRole('button', { name: /Moderation · 1 waiting/ })).toBeInTheDocument()
    expect(window.location.search).toBe('?open=sub-ai')
    const original = screen.getByRole('region', { name: 'The original' })
    expect(original.querySelector('[data-mark="used"]')?.textContent).toBe('6:20pm')
    expect(original.querySelector('[data-mark="unused"]')?.textContent).toBe('6:23pm')
    // Only what changes is in the form; the rabbi didn't change.
    expect(screen.getAllByTestId('review-field')).toHaveLength(1)
    expect(screen.queryByLabelText('Rabbi')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Moderation · 1 waiting/ }))
    expect(await findTitleText('Mekor Habracha')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  // In the real browser, Next.js and the analytics script wrap pushState
  // and the address changes a moment after the call. The first build read
  // the address straight after its own push, saw the list, and the click
  // did nothing visible (found on dev, Oct 5).
  it('opens at once even when the address only changes a moment after the push', async () => {
    const user = userEvent.setup()
    const push = window.history.pushState.bind(window.history)
    const spy = vi.spyOn(window.history, 'pushState').mockImplementation((...args) => void setTimeout(() => push(...args), 50))
    try {
      renderShulQueue([aiEdit])
      await user.click(await screen.findByText('Synagogues'))
      expect(screen.getByTestId('submission-review')).toBeInTheDocument()
      await waitFor(() => expect(window.location.search).toBe('?open=sub-ai'))
      expect(screen.getByTestId('submission-review')).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  it('opens the card a shared link names, and Back from it returns to the list', async () => {
    window.history.replaceState(null, '', '/?open=sub-ai')
    renderShulQueue([aiEdit])
    expect(await screen.findByTestId('submission-review')).toBeInTheDocument()
    window.history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(await findTitleText('Mekor Habracha')).toBeInTheDocument()
  })

  it('approves with the admin’s fix, and sends no copy when nothing was changed', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderShulQueue([aiEdit, submission()])
    await user.click(await screen.findByText('Synagogues'))
    await user.selectOptions(screen.getByLabelText('Change another field'), 'Rabbi')
    await user.clear(screen.getByLabelText('Rabbi'))
    await user.type(screen.getByLabelText('Rabbi'), 'Rabbi Why')
    await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.status).toBe('approved')
    expect(body.payload.details.rabbi).toBe('Rabbi Why')
    expect(body.payload.details.minyanim[0].time).toBe('6:20 PM')
    // Back on the list, without it.
    expect(await findTitleText('Acme Grocery')).toBeInTheDocument()
    expect(queryTitleText('Mekor Habracha')).not.toBeInTheDocument()

    await user.click(screen.getByText('Grocery Stores'))
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2))
    expect(JSON.parse((vi.mocked(fetchJson).mock.calls[1]![1] as RequestInit).body as string)).toEqual({ status: 'approved' })
  })

  it('“Keep as it was” puts a field back to the listing’s own value', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderShulQueue([aiEdit])
    await user.click(await screen.findByText('Synagogues'))
    await user.click(screen.getByRole('button', { name: 'Keep davening times as it was' }))
    await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.payload.details.minyanim[0].time).toBe('6:23 PM')
  })

  it('keeps the card open, with the fix and the reason, when approving fails', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockRejectedValue(new Error('Address is required.'))
    renderShulQueue([submission()])
    await user.click(await screen.findByText('Grocery Stores'))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'ACME Markets')
    await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))

    expect(await screen.findByText('Address is required.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('ACME Markets')
  })

  it('shows a person’s note where the original would be', async () => {
    const user = userEvent.setup()
    renderShulQueue([submission({ note: 'Saw the sign on the door.', payload: { ...aiEdit.payload }, operation: 'update', target_id: 'shul-1', current: current as never, categoryLabel: 'Synagogues' })])
    await user.click(await screen.findByText('Synagogues'))
    const opened = screen.getByTestId('submission-review')
    expect(screen.queryByRole('region', { name: 'The original' })).not.toBeInTheDocument()
    expect(within(opened).getByRole('region', { name: 'What changes on the listing' })).toHaveTextContent('Their note: Saw the sign on the door.')
  })

  it('doesn’t open a removal, and won’t approve a new place with no address from the list', async () => {
    renderShulQueue([
      submission({ id: 'del', operation: 'delete', target_id: 'shul-1', payload: {}, current: current as never, note: 'Closed' }),
      submission({ id: 'new', payload: { category: 'grocery', name: 'Giant', address: '', phone: '', details: {} } }),
    ])
    await findTitleText('Giant')
    expect(screen.queryByRole('button', { name: 'Open Mekor Habracha' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Giant' })).toBeInTheDocument()
    expect(screen.getByText(/needs its address/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1)
  })
})

// Picking a place in the address fills the rest from Google, as the
// listing's own editor does (the user, Oct 28: it didn't in the queue).
describe('ModerationQueue — an address picked from Google', () => {
  const bakery = makeCategory({
    id: 'bakery',
    pluralLabel: 'Bakeries',
    detailFields: [
      { key: 'hours', type: 'hours', label: 'Hours' },
      { key: 'w', type: 'url', label: 'Website' },
      { key: 'googleDescription', type: 'text', label: 'Description' },
      { key: 'hechsher', type: 'text', label: 'Hechsher' },
    ],
  })
  const hours = { mon: { open: '07:00', close: '15:00' } }
  const current = { id: 'b-1', category: 'bakery', name: 'Bakery', address: '', phone: '', details: { hechsher: 'KCL', googleDescription: 'Our own words' } }
  const edit = submission({
    id: 'sub-b',
    operation: 'update',
    target_id: 'b-1',
    categoryLabel: 'Bakeries',
    current: current as never,
    payload: { category: 'bakery', name: 'Bakery', address: '1 Bakery Way', phone: '', details: { hechsher: 'KCL', googleDescription: 'Our own words' } },
  })

  beforeEach(() => {
    picked.place = {
      placeId: 'ChIJbakery',
      name: 'Bakery on the Way',
      phone: '2155550100',
      hours,
      website: 'https://bakery.example/',
      description: 'A bakery, said Google',
      businessStatus: 'OPERATIONAL',
    }
  })

  function renderBakeryQueue() {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200))
    vi.mocked(parseOkJson).mockResolvedValue({ submissions: [edit] })
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    return renderWithProviders(<ModerationQueue session={session()} />, { content: { categories: [bakery] } })
  }

  it('fills the name, phone, hours and website, opens each row, and approves with them', async () => {
    const user = userEvent.setup()
    renderBakeryQueue()
    await user.click(await screen.findByText('Bakeries'))
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pick the Google place' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Bakery on the Way')
    expect(screen.getByLabelText('Phone')).toHaveValue('(215) 555-0100')
    const rows = screen.getAllByTestId('review-field').map((r) => r.textContent ?? '')
    expect(rows.some((t) => t.includes('Hours'))).toBe(true)
    expect(rows.some((t) => t.includes('Website'))).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.payload).toMatchObject({ name: 'Bakery on the Way', phone: '(215) 555-0100', address: '1 Bakery Way, Philadelphia, PA 19103, USA', geo: { lat: 39.95, lng: -75.17 } })
    expect(body.payload.details).toMatchObject({ hours, w: 'https://bakery.example/', hechsher: 'KCL' })
    // A description already written is kept; Google's place id isn't taken
    // from the queue (reviewEdits.ts).
    expect(body.payload.details.googleDescription).toBe('Our own words')
    expect(body.payload.details.placeId).toBeUndefined()
  })

  it('fills a description only where there is none', async () => {
    const user = userEvent.setup()
    edit.payload = { ...(edit.payload as object), details: { hechsher: 'KCL' } } as never
    try {
      renderBakeryQueue()
      await user.click(await screen.findByText('Bakeries'))
      await user.click(screen.getByRole('button', { name: 'Pick the Google place' }))
      await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))
      await waitFor(() => expect(fetchJson).toHaveBeenCalled())
      const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
      expect(body.payload.details.googleDescription).toBe('A bakery, said Google')
    } finally {
      edit.payload = { category: 'bakery', name: 'Bakery', address: '1 Bakery Way', phone: '', details: { hechsher: 'KCL', googleDescription: 'Our own words' } } as never
    }
  })
})
