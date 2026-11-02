// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { ADMIN_AREA_TAPPED } from '@/lib/adminNav'
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
    expect(await screen.findByText('Nothing to do')).toBeInTheDocument()
  })

  it('shows an unauthorized message on a 401, without treating it as an empty queue silently', async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(401))
    renderWithProviders(<ModerationQueue session={session({ user: { email: 'notadmin@example.com' } } as never)} />)

    expect(await screen.findByText(/not an authorized admin/)).toBeInTheDocument()
  })
})

const grocerRow = { id: 'l1', community_id: 'philly', category: 'grocery', name: 'Acme Grocery', anchor_id: 'community', distance: null, address: 'Old Address', phone: null, details: {}, status: 'approved', submitted_by: null, created_at: '', reviewed_at: null }

// The "one tap per place" boards (Nov 2): a row per place, its name, the
// oldest thing's date, and what's waiting in a grey line.
describe('ModerationQueue — the list', () => {
  it('says a new place is one', async () => {
    renderQueue([submission()])
    expect(await findRow('Acme Grocery')).toHaveTextContent(/^Acme Grocery\w{3} \d+New place$/)
  })

  it('says what each change is to, in a row of its own place', async () => {
    renderQueue([
      submission({ id: 'edit', operation: 'update', target_id: 'l1', payload: { name: 'Acme Grocery', address: 'New Address', details: {} }, current: grocerRow as never }),
      submission({ id: 'del', operation: 'delete', target_id: 'l2', note: 'Permanently closed', payload: {}, current: { ...grocerRow, id: 'l2', name: 'Old Shop' } as never }),
      submission({ id: 'cat', target_type: 'category', payload: { label: 'Kosher Bakeries', firstListing: { name: 'Sweet Treats', address: '2 Oak St', phone: '' } }, categoryLabel: undefined }),
    ])
    expect(await findRow('Acme Grocery')).toHaveTextContent(/Address$/)
    expect(row('Old Shop')).toHaveTextContent(/Closed, says a visitor$/)
    expect(row('Kosher Bakeries')).toHaveTextContent(/New category$/)
    expect(screen.queryByRole('region', { name: /New places|Changes/ })).toBeNull()
  })

  it('puts two suggestions for one place in its one row', async () => {
    renderQueue([
      submission({ id: 'a', operation: 'update', target_id: 'l1', payload: { name: 'Acme Grocery', address: 'New Address', details: {} }, current: grocerRow as never }),
      submission({ id: 'b', operation: 'delete', target_id: 'l1', payload: {}, current: grocerRow as never }),
    ])
    expect(await findRow('Acme Grocery')).toHaveTextContent(/Address · Closed, says a visitor$/)
    expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(1)
  })

  // Nobody is expected to go through every search (the user, Oct 31): they
  // aren't on To do at all, and To do doesn't even read them.
  it('has no searches, and doesn’t load them', async () => {
    renderQueue([submission()])
    await findRow('Acme Grocery')
    expect(screen.queryByText(/Searches nobody found/)).toBeNull()
    const urls = vi.mocked(fetch).mock.calls.map(([u]) => String(u))
    expect(urls.some((u) => u.includes('/api/admin/submissions'))).toBe(true)
    expect(urls.some((u) => u.includes('/api/admin/missed-searches') || u.includes('/api/admin/read-questions'))).toBe(false)
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
    expect(await screen.findByText('Nothing to do')).toBeInTheDocument()
  })

  it('opens a new category to its card, with its first place', async () => {
    const user = userEvent.setup()
    renderQueue([submission({ target_type: 'category', payload: { label: 'Kosher Bakeries', description: 'Near the hospital', firstListing: { name: 'Sweet Treats', address: '2 Oak St', phone: '555-0000' } }, categoryLabel: undefined })])
    await user.click(await findRow('Kosher Bakeries'))
    const opened = screen.getByTestId('todo-place')
    expect(within(opened).getByText('New category')).toBeInTheDocument()
    expect(within(opened).getByText('Sweet Treats')).toBeInTheDocument()
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
    expect(await screen.findByText('Nothing to do')).toBeInTheDocument()
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
    await waitFor(() => expect(screen.queryByTestId('todo-place')).toBeNull())
    expect(row('Giant')).toBeInTheDocument()
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
    const from = screen.getByRole('region', { name: 'Where it came from' })
    expect(within(from).getByText('Read by AI')).toBeInTheDocument()
    expect(within(from).getByText(/1 time in the original isn’t used/)).toBeInTheDocument()
    expect(within(from).getByText(/from the shul’s card/)).toBeInTheDocument()
  })

  // A change opens to one list, new highlighted and old crossed out (boards
  // 3 and 20, Oct 29; one list since Oct 31).
  it('clicking a change opens it, one list for each field it changes, and Back returns to the list', async () => {
    const user = userEvent.setup()
    renderShulQueue([aiEdit])
    await user.click(await findRow('Mekor Habracha'))

    expect(screen.getByRole('heading', { level: 1, name: 'Mekor Habracha' })).toBeInTheDocument()
    expect(window.location.search).toBe('?open=shul-1')
    const original = screen.getByRole('region', { name: 'The original' })
    expect(original.querySelector('[data-mark="used"]')?.textContent).toBe('6:20pm')
    expect(original.querySelector('[data-mark="unused"]')?.textContent).toBe('6:23pm')
    // Only what changes is shown, a shul's times by the box they changed
    // in, as the listing lists them; the rabbi didn't change.
    // Friday's mincha is with Shabbos.
    expect(screen.getByText('Synagogues · a change to Usual Shabbos times')).toBeInTheDocument()
    const times = screen.getByRole('region', { name: 'Usual Shabbos times' })
    expect(within(times).getByRole('deletion')).toHaveTextContent('6:23 PM')
    expect(within(times).getByRole('insertion')).toHaveTextContent('6:20 PM')
    expect(screen.queryByRole('region', { name: 'Usual weekday times' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Rabbi' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '‹ To do' }))
    await waitFor(() => expect(screen.queryByTestId('todo-place')).toBeNull())
    expect(row('Mekor Habracha')).toBeInTheDocument()
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
      expect(screen.getByTestId('change-review')).toBeInTheDocument()
      await waitFor(() => expect(window.location.search).toBe('?open=shul-1'))
      expect(screen.getByTestId('change-review')).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  // A link from before places named the suggestion: it opens its place.
  it('opens the card a shared link names, and Back from it returns to the list', async () => {
    window.history.replaceState(null, '', '/?open=sub-ai')
    renderShulQueue([aiEdit])
    expect(await screen.findByTestId('change-review')).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe('?open=shul-1'))
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await waitFor(() => expect(screen.queryByTestId('todo-place')).toBeNull())
  })

  it('“Update the listing” takes the change as it came, and the list no longer has it', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderShulQueue([aiEdit, submission()])
    await user.click(await findRow('Mekor Habracha'))
    await user.click(within(screen.getByRole('group', { name: 'Decide' })).getByRole('button', { name: 'Update the listing' }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]).toEqual({ status: 'approved' })
    expect(await findRow('Acme Grocery')).toBeInTheDocument()
    expect(queryRow('Mekor Habracha')).not.toBeInTheDocument()
  })

  it('“Leave it” asks why, for whoever sent it, and sends that along', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderShulQueue([aiEdit])
    await user.click(await findRow('Mekor Habracha'))
    const decide = screen.getByRole('group', { name: 'Decide' })
    await user.click(within(decide).getByRole('button', { name: 'Leave it' }))
    await user.type(screen.getByLabelText('Why, for whoever sent it (optional)'), 'Those are last year’s')
    await user.click(within(decide).getByRole('button', { name: 'Leave it' }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]).toMatchObject({ status: 'rejected', reason: 'Those are last year’s' })
  })

  // "Edit, then update" opens the rows the change touches in the site's
  // own editor, starting from what was sent (boards 20b and 20c).
  it('“Edit, then update” opens only the rows it changes, and updates with what the admin left', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderShulQueue([aiEdit])
    await user.click(await findRow('Mekor Habracha'))
    await user.click(screen.getByRole('button', { name: 'Edit, then update' }))
    expect(screen.queryByTestId('change-review')).not.toBeInTheDocument()
    expect(screen.queryByText('Rabbi')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Update the listing' }))
    const body = await waitFor(() => {
      const sent = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(sent).toBeTruthy()
      return JSON.parse(String(sent![1]!.body)) as { status: string; payload: { details: { rabbi: string; minyanim: { time: string }[] } } }
    })
    expect(body.status).toBe('approved')
    expect(body.payload.details.minyanim[0].time).toBe('6:20 PM')
    expect(body.payload.details.rabbi).toBe('Rabbi Ex')
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
    expect(screen.queryByRole('region', { name: 'The original' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Where it came from' })).toHaveTextContent('From Jane Doe')
    expect(screen.getByRole('region', { name: 'Where it came from' })).toHaveTextContent('Saw the sign on the door.')
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

  /** What "Edit, then update" sent. */
  async function updated() {
    return waitFor(() => {
      const sent = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(sent).toBeTruthy()
      return JSON.parse(String(sent![1]!.body)) as { payload: { details: Record<string, unknown> } & Record<string, unknown> }
    })
  }

  // A change's editor is the site's own (board 20b), so the pick fills
  // what it fills there.
  it('fills the name, phone, hours and website, and updates with them', async () => {
    const user = userEvent.setup()
    renderBakeryQueue()
    await user.click(await findRow('Bakery'))
    await user.click(screen.getByRole('button', { name: 'Edit, then update' }))
    await user.click(screen.getByRole('button', { name: 'Pick the Google place' }))
    expect(screen.getByLabelText('Phone')).toHaveValue('(215) 555-0100')
    await user.click(screen.getByRole('button', { name: 'Update the listing' }))

    const body = await updated()
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
    const had = current.details
    current.details = { hechsher: 'KCL' } as never
    try {
      renderBakeryQueue()
      await user.click(await findRow('Bakery'))
      await user.click(screen.getByRole('button', { name: 'Edit, then update' }))
      await user.click(screen.getByRole('button', { name: 'Pick the Google place' }))
      await user.click(screen.getByRole('button', { name: 'Update the listing' }))
      expect((await updated()).payload.details.googleDescription).toBe('A bakery, said Google')
    } finally {
      edit.payload = { category: 'bakery', name: 'Bakery', address: '1 Bakery Way', phone: '', details: { hechsher: 'KCL', googleDescription: 'Our own words' } } as never
      current.details = had
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
    expect(screen.queryByText('Nothing to do')).toBeNull()
  })

  it('a category with no places yet sends you to add them', async () => {
    renderWithSetup({ ...SETUP, categories: 1 })
    const row = await screen.findByRole('link', { name: /Your first category/ })
    expect(row).toHaveTextContent('Add its places')
    expect(row.getAttribute('href')).toMatch(/\/admin\/places$/)
  })

  // The Searches page opens from Reports, Feedback from the nav.
  it('leads nowhere else: not Watches, every search or Feedback', async () => {
    renderWithSetup({ logo: true, admins: 3, categories: 4, places: 20, heroWords: true })
    expect(await screen.findByText('Nothing to do')).toBeInTheDocument()
    expect(screen.getByText('Every place was read this morning')).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toEqual([])
  })

  it('is gone once all four are done', async () => {
    renderWithSetup({ logo: true, admins: 3, categories: 4, places: 20, heroWords: true })
    expect(await screen.findByText('Nothing to do')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Set up your guide' })).toBeNull()
  })

  it('sits above what there is to decide', async () => {
    renderWithSetup(SETUP, [submission()])
    const place = await findRow('Acme Grocery')
    const setup = screen.getByRole('region', { name: 'Set up your guide' })
    expect(setup.compareDocumentPosition(place) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// The "one tap per place" boards (Nov 2): a place opens on its first thing,
// switches at the top for the rest; answered ones tick; a place with
// nothing left gives way to the list (phone) or the next place (computer).
describe('ModerationQueue — a place opened', () => {
  const shul = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', type: 'minyanim', label: 'Davening times' }] })
  const current = { id: 'shul-1', category: 'synagogue', name: 'Mekor Habracha', address: '1500 Walnut St', phone: '', details: { minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['fri'], time: '6:23 PM' }] } }
  const edit = submission({
    id: 'sub-ai',
    operation: 'update',
    target_id: 'shul-1',
    categoryLabel: 'Synagogues',
    current: current as never,
    payload: { category: 'synagogue', name: 'Mekor Habracha', address: '1500 Walnut St', phone: '', details: { minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['fri'], time: '6:20 PM' }] } },
  })
  const notOnGoogle = { id: 'shul-1', name: 'Mekor Habracha', category: 'synagogue', matched: false, notOnGoogle: null }

  function renderRouted({ submissions = [], responses = [], google = [] }: { submissions?: EnrichedSubmission[]; responses?: unknown[]; google?: unknown[] }) {
    vi.mocked(fetch).mockImplementation(async (url) => ({ ...fakeResponse(200), url: String(url) }) as Response)
    vi.mocked(parseOkJson).mockImplementation(async (res) => {
      const url = String((res as Response).url)
      if (url.includes('/api/admin/responses')) return { responses }
      if (url.includes('/api/admin/watches/google')) return { places: google }
      if (url.includes('/api/admin/setup')) return { setup: null }
      return { submissions }
    })
    return renderWithProviders(<ModerationQueue session={session()} />, { content: { categories: [shul, makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })] } })
  }
  const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent)
  let wide = false
  beforeEach(() => {
    wide = false
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: wide && q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} }))
  })

  it('opens on the change, the rest behind switches, and answering it opens the next', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderRouted({ submissions: [edit], google: [notOnGoogle] })
    expect(await findRow('Mekor Habracha')).toHaveTextContent(/Usual Shabbos times · Google not found$/)
    await user.click(row('Mekor Habracha'))
    expect(tabs()).toEqual(['Usual Shabbos times', 'Google not found'])
    expect(screen.getByRole('tab', { name: 'Usual Shabbos times' })).toHaveAttribute('aria-selected', 'true')
    await user.click(within(screen.getByRole('group', { name: 'Decide' })).getByRole('button', { name: 'Update the listing' }))
    // Ticked, and what's left opens: a check that's fixed on the place's own screen.
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Google not found' })).toHaveAttribute('aria-selected', 'true'))
    expect(tabs()).toEqual(['Usual Shabbos times (done)', 'Google not found'])
    expect(screen.getByRole('link', { name: 'Open Mekor Habracha' }).getAttribute('href')).toMatch(/\/admin\/watches\/place\/shul-1\?from=todo$/)
  })

  it('opens on what the filter picked', async () => {
    const user = userEvent.setup()
    renderRouted({ submissions: [edit], google: [notOnGoogle] })
    await findRow('Mekor Habracha')
    await user.click(screen.getByRole('button', { name: /^Show/ }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Broken checks/ }))
    await user.click(row('Mekor Habracha'))
    expect(screen.getByRole('tab', { name: 'Google not found' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('change-review')).toBeNull()
  })

  it('a place that’s done goes back to the list on a phone', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderRouted({ submissions: [submission(), submission({ id: 'sub-2', payload: { category: 'grocery', name: 'Giant', address: '2 Main St', details: {} } })] })
    await user.click(await findRow('Acme Grocery'))
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(screen.queryByTestId('todo-place')).toBeNull())
    expect(row('Giant')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('a place that’s done gives way to the next on a computer, and up and down step through them', async () => {
    const user = userEvent.setup()
    wide = true
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    const three = ['Acme Grocery', 'Giant', 'Zayde’s'].map((name, i) => submission({ id: `s${i}`, payload: { category: 'grocery', name, address: '2 Main St', details: {} } }))
    renderRouted({ submissions: three })
    await user.click(await findRow('Acme Grocery'))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(window.location.search).toBe('?open=s1'))
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(within(screen.getByTestId('todo-place')).getByRole('heading', { level: 1, name: 'Giant' })).toBeInTheDocument()
  })

  it('feedback is Done, or a reply first when they left an email', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderRouted({ responses: [{ id: 'f', title: 'Feedback', line: 'Hours wrong', text: ['Hours wrong', 'at Primo'], email: 'sam@example.com', createdAt: '2026-11-01T12:00:00Z' }] })
    await user.click(await findRow('Feedback'))
    const opened = screen.getByTestId('todo-place')
    expect(within(opened).getByText('at Primo')).toBeInTheDocument()
    expect(within(opened).getByRole('link', { name: 'Reply' }).getAttribute('href')).toMatch(/^mailto:sam@example\.com\?subject=/)
    await user.click(within(opened).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(patches()).toEqual([{ status: 'handled' }]))
    expect(vi.mocked(fetchJson).mock.calls.find(([, init]) => init?.method === 'PATCH')![0]).toBe('/api/admin/responses/f?community=test-community')
    expect(await screen.findByText('Nothing to do')).toBeInTheDocument()
  })

  it('an edit is kept while another thing is open, and leaving with it open asks first', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    renderRouted({ submissions: [edit], google: [notOnGoogle] })
    await user.click(await findRow('Mekor Habracha'))
    await user.click(screen.getByRole('button', { name: 'Edit, then update' }))
    await user.click(screen.getByRole('tab', { name: 'Google not found' }))
    expect(screen.queryByRole('button', { name: 'Update the listing' })).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Usual Shabbos times' }))
    expect(screen.getByRole('button', { name: 'Update the listing' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Google not found' }))
    await user.click(screen.getByRole('button', { name: '‹ To do' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('todo-place')).toBeInTheDocument()
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '‹ To do' }))
    await waitFor(() => expect(screen.queryByTestId('todo-place')).toBeNull())
  })
})

// The user, Oct 31: "Hitting To do from a change does nothing."
describe('ModerationQueue — To do tapped in the nav', () => {
  it('closes the open card, back to the list', async () => {
    const user = userEvent.setup()
    renderQueue([submission()])
    await user.click(await findRow('Acme Grocery'))
    expect(screen.getByTestId('todo-place')).toBeInTheDocument()
    act(() => {
      window.history.pushState(null, '', window.location.pathname)
      window.dispatchEvent(new Event(ADMIN_AREA_TAPPED))
    })
    expect(screen.queryByTestId('todo-place')).toBeNull()
    expect(row('Acme Grocery')).toBeInTheDocument()
  })
})
