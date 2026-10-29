// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { resetTodo } from '@/lib/useTodo'
import { SubmissionCard } from './SubmissionCard'
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

// A suggestion's row on To do: a button named "Open <name>".
function row(name: string) {
  return screen.getByRole('button', { name: `Open ${name}` })
}
function queryRow(name: string) {
  return screen.queryByRole('button', { name: `Open ${name}` })
}
async function findRow(name: string) {
  return screen.findByRole('button', { name: `Open ${name}` })
}

/** The bodies of the decisions sent (the list also reads the watches). */
function patches(): Record<string, unknown>[] {
  return vi
    .mocked(fetchJson)
    .mock.calls.filter(([, init]) => init?.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init!.body)))
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
  // The list reads the watches too; a test sets its own answer to decide.
  vi.mocked(fetchJson).mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  resetTodo()
  // An opened suggestion is in the address; the next test starts on the list.
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ModerationQueue — loading and empty states', () => {
  it('shows a clear-queue message once loaded with nothing pending', async () => {
    renderQueue([])
    expect(screen.getByText('Loading submissions…')).toBeInTheDocument()
    expect(await screen.findByText('Nothing to do.')).toBeInTheDocument()
  })

  it('shows an unauthorized message on a 401, without treating it as an empty queue silently', async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(401))
    renderWithProviders(<ModerationQueue session={session({ user: { email: 'notadmin@example.com' } } as never)} />)

    expect(await screen.findByText(/not an authorized admin/)).toBeInTheDocument()
  })
})

const grocerRow = { id: 'l1', community_id: 'philly', category: 'grocery', name: 'Acme Grocery', anchor_id: 'community', distance: null, address: 'Old Address', phone: null, details: {}, status: 'approved', submitted_by: null, created_at: '', reviewed_at: null }

// Board 1: one list, grouped by what you decide, each row a name and one
// line under it.
describe('ModerationQueue — the list', () => {
  it('puts a new place under New places, with where it came from and its category', async () => {
    renderQueue([submission()])
    const box = await screen.findByRole('region', { name: 'New places' })
    expect(within(box).getByRole('button', { name: 'Open Acme Grocery' })).toHaveTextContent(/a visitor · \w{3} \d+Grocery Stores/)
    expect(screen.getByText('1 to decide')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Changes' })).toBeNull()
  })

  it('puts edits, removals and new categories under Changes, each saying what it is to', async () => {
    renderQueue([
      submission({ id: 'edit', operation: 'update', payload: { name: 'Acme Grocery', address: 'New Address', details: {} }, current: grocerRow as never }),
      submission({ id: 'del', operation: 'delete', note: 'Permanently closed', payload: {}, current: { ...grocerRow, name: 'Old Shop' } as never }),
      submission({ id: 'cat', target_type: 'category', payload: { label: 'Kosher Bakeries', firstListing: { name: 'Sweet Treats', address: '2 Oak St', phone: '' } }, categoryLabel: undefined }),
    ])
    const box = await screen.findByRole('region', { name: 'Changes' })
    expect(within(box).getByRole('button', { name: 'Open Acme Grocery' })).toHaveTextContent(/^Acme GroceryAddress · a visitor/)
    expect(within(box).getByRole('button', { name: 'Open Old Shop' })).toHaveTextContent(/Remove it · a visitor/)
    expect(within(box).getByRole('button', { name: 'Open Kosher Bakeries' })).toHaveTextContent(/New category · a visitor/)
    expect(screen.getByText('3 to decide')).toBeInTheDocument()
  })

  it('shows four of a group and the rest behind "N more"', async () => {
    const user = userEvent.setup()
    renderQueue(Array.from({ length: 7 }, (_, i) => submission({ id: `s${i}`, payload: { category: 'grocery', name: `Shop ${i}`, address: '1 Main St', details: {} } })))
    await findRow('Shop 0')
    expect(queryRow('Shop 4')).toBeNull()
    await user.click(screen.getByRole('button', { name: '3 more' }))
    expect(row('Shop 6')).toBeInTheDocument()
  })

  it('opens a removal to its card, with the note, decided there', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderQueue([submission({ operation: 'delete', note: 'Permanently closed', payload: {}, current: { ...grocerRow, address: '1 Main St' } as never })])
    await user.click(await findRow('Acme Grocery'))
    expect(screen.getByText(/Reported for removal.*Permanently closed/)).toBeInTheDocument()
    expect(screen.queryByTestId('submission-review')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(patches()).toEqual([{ status: 'approved' }]))
    expect(await screen.findByText('Nothing to do.')).toBeInTheDocument()
  })

  it('opens a new category to its card, with its first place', async () => {
    const user = userEvent.setup()
    renderQueue([submission({ target_type: 'category', payload: { label: 'Kosher Bakeries', description: 'Near the hospital', firstListing: { name: 'Sweet Treats', address: '2 Oak St', phone: '555-0000' } }, categoryLabel: undefined })])
    await user.click(await findRow('Kosher Bakeries'))
    expect(screen.getByText('New category')).toBeInTheDocument()
    expect(screen.getByText('Sweet Treats')).toBeInTheDocument()
  })
})

// Some categories configure `googleDescription` as a real, human-editable
// "Description" field (see useListingDraft's address-pick autofill and
// googlePlaces.ts's recurring sync) — that's real content worth a
// moderator seeing. Others never configure it at all, in which case any
// value there is only the sync's own fallback card-subtitle text and
// should stay hidden, same as geo/placeId/businessStatus.
describe('a suggestion’s card and googleDescription', () => {
  const described = submission({ payload: { category: 'grocery', name: 'Acme Grocery', address: '1 Main St', phone: '555-1234', details: { googleDescription: 'A neighborhood grocery store.' } } })
  function card(fields: { key: string; type: 'text'; label: string }[]) {
    renderWithProviders(<SubmissionCard submission={described} categoriesById={new Map([['grocery', makeCategory({ id: 'grocery', detailFields: fields })]])} />)
  }

  it('shows the Description field when the category has configured googleDescription', () => {
    card([{ key: 'googleDescription', type: 'text', label: 'Description' }])
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('A neighborhood grocery store.')).toBeInTheDocument()
  })

  it('hides googleDescription when the category never configured it as a field', () => {
    card([])
    expect(screen.queryByText('A neighborhood grocery store.')).not.toBeInTheDocument()
  })
})

describe('ModerationQueue — deciding', () => {
  it('approving sends the decision, and the list no longer has it', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderQueue([submission()])
    await user.click(await findRow('Acme Grocery'))
    await user.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(patches()).toEqual([{ status: 'approved' }]))
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/submissions/sub-1?community=test-community',
      expect.objectContaining({ method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      'Failed to update.',
    )
    expect(await screen.findByText('Nothing to do.')).toBeInTheDocument()
    expect(queryRow('Acme Grocery')).toBeNull()
  })

  it('rejecting asks for a reason, and confirming sends it along', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderQueue([submission()])
    await user.click(await findRow('Acme Grocery'))
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    await user.type(screen.getByLabelText(/Reason for rejection/), 'Duplicate listing')
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }))

    await waitFor(() => expect(patches()).toEqual([{ status: 'rejected', reason: 'Duplicate listing' }]))
  })

  it('canceling a reject leaves the suggestion undecided', async () => {
    const user = userEvent.setup()
    renderQueue([submission()])
    await user.click(await findRow('Acme Grocery'))
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(patches()).toEqual([])
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  // Board 3: "‹ To do", where you are, and Next.
  it('says which one of how many is open, and Next opens the next', async () => {
    const user = userEvent.setup()
    renderQueue([submission(), submission({ id: 'sub-2', payload: { category: 'grocery', name: 'Giant', address: '2 Main St', details: {} } })])
    await user.click(await findRow('Acme Grocery'))
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next ›' }))
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    expect(window.location.search).toBe('?open=sub-2')
    expect(screen.queryByRole('button', { name: 'Next ›' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '‹ To do' }))
    expect(await findRow('Giant')).toBeInTheDocument()
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
    const user = userEvent.setup()
    renderShulQueue([aiEdit])
    await user.click(await findRow('Mekor Habracha'))
    expect(screen.getByText('Read by AI')).toBeInTheDocument()
    expect(screen.getByText(/1 time in the original isn’t used/)).toBeInTheDocument()
    expect(screen.getByText(/from what they pasted/)).toBeInTheDocument()
  })

  it('clicking a card opens it, with the original marked beside the change, and Back returns to the list', async () => {
    const user = userEvent.setup()
    renderShulQueue([aiEdit])
    await user.click(await findRow('Mekor Habracha'))

    expect(screen.getByRole('button', { name: '‹ To do' })).toBeInTheDocument()
    expect(window.location.search).toBe('?open=sub-ai')
    const original = screen.getByRole('region', { name: 'The original' })
    expect(original.querySelector('[data-mark="used"]')?.textContent).toBe('6:20pm')
    expect(original.querySelector('[data-mark="unused"]')?.textContent).toBe('6:23pm')
    // Only what changes is in the form; the rabbi didn't change.
    expect(screen.getAllByTestId('review-field')).toHaveLength(1)
    expect(screen.queryByLabelText('Rabbi')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '‹ To do' }))
    expect(await findRow('Mekor Habracha')).toBeInTheDocument()
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
      await user.click(await findRow('Mekor Habracha'))
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
    expect(await findRow('Mekor Habracha')).toBeInTheDocument()
  })

  it('approves with the admin’s fix, and sends no copy when nothing was changed', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderShulQueue([aiEdit, submission()])
    await user.click(await findRow('Mekor Habracha'))
    await user.selectOptions(screen.getByLabelText('Change another field'), 'Rabbi')
    await user.clear(screen.getByLabelText('Rabbi'))
    await user.type(screen.getByLabelText('Rabbi'), 'Rabbi Why')
    await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))

    await waitFor(() => expect(patches()).toHaveLength(1))
    const body = patches()[0] as { status: string; payload: { details: { rabbi: string; minyanim: { time: string }[] } } }
    expect(body.status).toBe('approved')
    expect(body.payload.details.rabbi).toBe('Rabbi Why')
    expect(body.payload.details.minyanim[0].time).toBe('6:20 PM')
    // Back on the list, without it.
    expect(await findRow('Acme Grocery')).toBeInTheDocument()
    expect(queryRow('Mekor Habracha')).not.toBeInTheDocument()

    await user.click(row('Acme Grocery'))
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(patches()).toHaveLength(2))
    expect(patches()[1]).toEqual({ status: 'approved' })
  })

  it('“Keep as it was” puts a field back to the listing’s own value', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderShulQueue([aiEdit])
    await user.click(await findRow('Mekor Habracha'))
    await user.click(screen.getByRole('button', { name: 'Keep davening times as it was' }))
    await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    const body = patches()[0] as { payload: { details: { minyanim: { time: string }[] } } }
    expect(body.payload.details.minyanim[0].time).toBe('6:23 PM')
  })

  it('keeps the card open, with the fix and the reason, when approving fails', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockRejectedValue(new Error('Address is required.'))
    renderShulQueue([submission()])
    await user.click(await findRow('Acme Grocery'))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'ACME Markets')
    await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))

    expect(await screen.findByText('Address is required.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('ACME Markets')
  })

  it('shows a person’s note where the original would be', async () => {
    const user = userEvent.setup()
    renderShulQueue([submission({ note: 'Saw the sign on the door.', payload: { ...aiEdit.payload }, operation: 'update', target_id: 'shul-1', current: current as never, categoryLabel: 'Synagogues' })])
    await user.click(await findRow('Mekor Habracha'))
    const opened = screen.getByTestId('submission-review')
    expect(screen.queryByRole('region', { name: 'The original' })).not.toBeInTheDocument()
    expect(within(opened).getByRole('region', { name: 'What changes on the listing' })).toHaveTextContent('Their note: Saw the sign on the door.')
  })

  // Regression: the opened card offered Approve on a new place with no
  // address, and approving failed "Address is required."
  it('won’t approve a new place with no address from the opened card either, until one is typed', async () => {
    const user = userEvent.setup()
    renderShulQueue([submission({ id: 'new', payload: { category: 'grocery', name: 'Giant', address: '', phone: '', details: {} } })])
    await user.click(await screen.findByRole('button', { name: 'Open Giant' }))
    const opened = screen.getByTestId('submission-review')
    expect(within(opened).queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument()
    expect(within(opened).getByRole('button', { name: 'Reject' })).toBeInTheDocument()

    await user.type(within(opened).getByLabelText('Address'), '1 Main St')
    expect(within(opened).getByRole('button', { name: 'Approve with your changes' })).toBeInTheDocument()
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
    await user.click(await findRow('Bakery'))
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pick the Google place' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Bakery on the Way')
    expect(screen.getByLabelText('Phone')).toHaveValue('(215) 555-0100')
    const rows = screen.getAllByTestId('review-field').map((r) => r.textContent ?? '')
    expect(rows.some((t) => t.includes('Hours'))).toBe(true)
    expect(rows.some((t) => t.includes('Website'))).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    const body = patches()[0] as { payload: { details: Record<string, unknown> } & Record<string, unknown> }
    expect(body.payload).toMatchObject({ name: 'Bakery on the Way', phone: '(215) 555-0100', address: '1 Bakery Way, Philadelphia, PA 19103, USA', geo: { lat: 39.95, lng: -75.17 } })
    expect(body.payload.details).toMatchObject({ hours, w: 'https://bakery.example/', hechsher: 'KCL' })
    // A description already written is kept.
    expect(body.payload.details.googleDescription).toBe('Our own words')
    // The place goes with it, and what Google filled, so approving links the
    // listing and Google owns those rows (reviewEdits.ts).
    expect(body.payload.details).toMatchObject({
      placeId: 'ChIJbakery',
      businessStatus: 'OPERATIONAL',
      googleAutofill: { name: 'Bakery on the Way', phone: '(215) 555-0100', hours: JSON.stringify(hours), website: 'https://bakery.example/', description: 'A bakery, said Google' },
    })
  })

  it('fills a description only where there is none', async () => {
    const user = userEvent.setup()
    edit.payload = { ...(edit.payload as object), details: { hechsher: 'KCL' } } as never
    try {
      renderBakeryQueue()
      await user.click(await findRow('Bakery'))
      await user.click(screen.getByRole('button', { name: 'Pick the Google place' }))
      await user.click(screen.getByRole('button', { name: 'Approve with your changes' }))
      await waitFor(() => expect(patches()).toHaveLength(1))
      const body = patches()[0] as { payload: { details: Record<string, unknown> } & Record<string, unknown> }
      expect(body.payload.details.googleDescription).toBe('A bakery, said Google')
    } finally {
      edit.payload = { category: 'bakery', name: 'Bakery', address: '1 Bakery Way', phone: '', details: { hechsher: 'KCL', googleDescription: 'Our own words' } } as never
    }
  })
})

// Step 6 (board "Setup"): a guide not yet set up has its checklist first,
// each step ticked by what's saved, and the nav's number takes in the
// steps left.
describe('ModerationQueue — Set up your guide', () => {
  const SETUP = { logo: true, admins: 2, categories: 0, places: 0, heroWords: false }

  function renderWithSetup(setup: typeof SETUP, items: EnrichedSubmission[] = []) {
    vi.mocked(fetch).mockImplementation(async (url) => ({ ...fakeResponse(200), url: String(url) }) as Response)
    vi.mocked(parseOkJson).mockImplementation(async (res) => (String((res as Response).url).includes('/api/admin/setup') ? { setup } : { submissions: items }))
    return renderWithProviders(<ModerationQueue session={session()} />, {
      content: { categories: [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })] },
    })
  }

  it('lists the four, ticks the ones saved, and says nothing else is waiting', async () => {
    renderWithSetup(SETUP)
    const box = await screen.findByRole('region', { name: 'Set up your guide' })
    expect(within(box).getByText('2 of 4 done')).toBeInTheDocument()
    const rows = within(box).getAllByRole('link')
    expect(rows.map((r) => [r.textContent, r.getAttribute('data-done')])).toEqual([
      ['Name and logoDone', 'true'],
      ['A second adminDone', 'true'],
      ['Your first categoryPick a kind, then add its places', 'false'],
      ['The home page’s wordsThe big line and the line under it', 'false'],
    ])
    expect(rows.map((r) => r.getAttribute('href')!.replace(/^.*\/admin/, ''))).toEqual(['/community', '/team', '/categories/cat:new', '/home'])
    expect(screen.getByText('Nothing else to do.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing to do.')).toBeNull()
  })

  it('a category with no places yet sends you to add them', async () => {
    renderWithSetup({ ...SETUP, categories: 1 })
    const row = await screen.findByRole('link', { name: /Your first category/ })
    expect(row).toHaveTextContent('Add its places')
    expect(row.getAttribute('href')).toMatch(/\/admin\/places$/)
  })

  it('is gone once all four are done', async () => {
    renderWithSetup({ logo: true, admins: 3, categories: 4, places: 20, heroWords: true })
    expect(await screen.findByText('Nothing to do.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Set up your guide' })).toBeNull()
  })

  it('sits above what there is to decide', async () => {
    renderWithSetup(SETUP, [submission()])
    await screen.findByRole('region', { name: 'New places' })
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(regions.slice(0, 2)).toEqual(['Set up your guide', 'New places'])
    expect(screen.getByText('1 to decide')).toBeInTheDocument()
  })
})
