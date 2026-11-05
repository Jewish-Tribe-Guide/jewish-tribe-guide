// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { useLayoutEffect } from 'react'
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
  // A place's editor reads what its save answered.
  vi.mocked(fetch).mockImplementation(async (_url, init) => (init?.method === 'PATCH' ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : fakeResponse(200)))
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
  // The user, Nov 4: "start page with newest to oldest". A place read
  // again is dated today, so it comes up top rather than at the foot.
  it('opens newest first', async () => {
    renderQueue([
      submission({ id: 'old', created_at: '2026-10-01T12:00:00Z', payload: { category: 'grocery', name: 'Old Grocer', address: '1 Main St', details: {} } }),
      submission({ id: 'new', created_at: '2026-11-03T12:00:00Z', payload: { category: 'grocery', name: 'New Grocer', address: '2 Main St', details: {} } }),
    ])
    await findRow('New Grocer')
    expect(screen.getByRole('button', { name: /^Sort/ })).toHaveTextContent('Newest first')
    expect(screen.getAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Open New Grocer', 'Open Old Grocer'])
  })

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

// A new place (board L3NewPlace): the listing it would be, in the site's
// own editor, a row for each thing it has and the rest "Not on the listing
// yet"; "Add to the guide" or "Leave it".
describe('ModerationQueue — a new place', () => {
  const decide = () => within(screen.getByRole('group', { name: 'Decide' }))

  /** What the editor sent, and where. */
  async function added() {
    return waitFor(() => {
      const sent = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(sent).toBeTruthy()
      return { url: String(sent![0]), init: sent![1]!, body: JSON.parse(String(sent![1]!.body)) as { status: string; payload?: Record<string, unknown> & { details: Record<string, unknown> } } }
    })
  }

  it('opens as its listing, a row for each thing it has', async () => {
    const user = userEvent.setup()
    renderQueue([submission()])
    await user.click(await findRow('Acme Grocery'))
    expect(screen.getAllByText('New place · Grocery Stores').length).toBeGreaterThan(0)
    expect(screen.getByTestId('editor-row-name')).toHaveTextContent('Acme Grocery')
    expect(screen.getByTestId('editor-row-contact:address')).toHaveTextContent('1 Main St')
    expect(screen.getByTestId('editor-row-contact:phone')).toHaveTextContent('555-1234')
    expect(decide().getAllByRole('button').map((b) => b.textContent)).toEqual(['Add to the guide', 'Leave it'])
    // The host's buttons send it, not the editor's own.
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('Add to the guide takes it as it was sent, and the list no longer has it', async () => {
    const user = userEvent.setup()
    renderQueue([submission()])
    await user.click(await findRow('Acme Grocery'))
    await user.click(decide().getByRole('button', { name: 'Add to the guide' }))

    const { url, init, body } = await added()
    expect(url).toBe('/api/admin/submissions/sub-1?community=test-community')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(body).toEqual({ status: 'approved' })
    expect(await screen.findByText('Nothing to do')).toBeInTheDocument()
    expect(queryRow('Acme Grocery')).toBeNull()
  })

  it('an edit in it goes in with it, over what was sent', async () => {
    const user = userEvent.setup()
    const sent = { category: 'grocery', name: 'Acme Grocery', address: '1 Main St', phone: '555-1234', details: { placeId: 'ChIJacme', googleAutofill: { name: 'Acme Grocery' } } }
    renderQueue([submission({ payload: sent })])
    await user.click(await findRow('Acme Grocery'))
    await user.click(screen.getByTestId('editor-row-name'))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'ACME Markets')
    await user.click(decide().getByRole('button', { name: 'Add to the guide' }))

    const { body } = await added()
    expect(body.status).toBe('approved')
    expect(body.payload).toMatchObject({ name: 'ACME Markets', address: '1 Main St', phone: '555-1234' })
    // What the editor doesn't hold is kept as it was sent.
    expect(body.payload!.details).toMatchObject({ placeId: 'ChIJacme', googleAutofill: { name: 'Acme Grocery' } })
  })

  it('Leave it leaves it out, without asking why', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderQueue([submission()])
    await user.click(await findRow('Acme Grocery'))
    await user.click(decide().getByRole('button', { name: 'Leave it' }))
    await waitFor(() => expect(patches()).toEqual([{ status: 'rejected' }]))
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  // Regression: the opened card offered Approve on a new place with no
  // address, and approving failed "Address is required."
  it('won’t add one with no address until one is typed', async () => {
    const user = userEvent.setup()
    renderQueue([submission({ payload: { category: 'grocery', name: 'Giant', address: '', phone: '', details: {} } })])
    await user.click(await findRow('Giant'))
    expect(decide().getByRole('button', { name: 'Add to the guide' })).toBeDisabled()
    const address = screen.getByTestId('editor-row-contact:address')
    expect(address).toHaveTextContent('Needed')
    await user.click(address)
    await user.type(screen.getByLabelText('Address'), '1 Main St')
    expect(decide().getByRole('button', { name: 'Add to the guide' })).toBeEnabled()
  })

  it('stays open, with the edit and the reason, when adding fails', async () => {
    const user = userEvent.setup()
    renderQueue([submission()])
    vi.mocked(fetch).mockImplementation(async (_url, init) =>
      init?.method === 'PATCH' ? new Response(JSON.stringify({ ok: false, errors: ['Address is required.'] }), { status: 400 }) : fakeResponse(200),
    )
    await user.click(await findRow('Acme Grocery'))
    await user.click(screen.getByTestId('editor-row-name'))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'ACME Markets')
    await user.click(decide().getByRole('button', { name: 'Add to the guide' }))

    expect(await screen.findByText('Address is required.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('ACME Markets')
    expect(row('Acme Grocery')).toBeInTheDocument()
  })

  it('says which one of how many is open, and the next place opens the next', async () => {
    const user = userEvent.setup()
    renderQueue([submission(), submission({ id: 'sub-2', payload: { category: 'grocery', name: 'Giant', address: '2 Main St', details: {} } })])
    await user.click(await findRow('Acme Grocery'))
    expect(screen.getAllByText('1 of 2').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'The next place' }))
    expect(screen.getAllByText('2 of 2').length).toBeGreaterThan(0)
    expect(window.location.search).toBe('?open=sub-2')
    expect(screen.getByRole('button', { name: 'The next place' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Back to To do' }))
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
    // The card's editor reads what its save answered.
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.mocked(parseOkJson).mockResolvedValue({ submissions: items })
    return renderWithProviders(<ModerationQueue session={session()} />, {
      content: { categories: [shulCategory, makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })] },
    })
  }

  afterEach(() => window.history.replaceState(null, '', '/'))

  /** Where it came from, opened (folded under the card). */
  async function openSource(user: ReturnType<typeof userEvent.setup>) {
    const source = screen.getByRole('region', { name: 'Where it’s read from' })
    await user.click(within(source).getByRole('button'))
    return source
  }

  it('labels an AI-read card and says when a time in the original wasn’t used', async () => {
    const user = userEvent.setup()
    renderShulQueue([aiEdit])
    await user.click(await findRow('Mekor Habracha'))
    const from = await openSource(user)
    expect(within(from).getByText('Read by AI')).toBeInTheDocument()
    expect(within(from).getByText(/1 time in the original isn’t used/)).toBeInTheDocument()
    expect(within(from).getByText(/from the shul’s card/)).toBeInTheDocument()
  })

  // A change opens in the listing's own editor, only the rows it changes,
  // the changed minyan marked with what it was (E1Times; the user, Nov 2).
  it('clicking a change opens it in its rows, marked, and Back returns to the list', async () => {
    const user = userEvent.setup()
    renderShulQueue([aiEdit])
    await user.click(await findRow('Mekor Habracha'))

    expect(screen.getByRole('heading', { level: 1, name: 'Mekor Habracha' })).toBeInTheDocument()
    expect(window.location.search).toBe('?open=shul-1')
    // Friday's mincha is with Shabbos; the rabbi didn't change.
    expect(screen.getByRole('heading', { name: 'Usual Shabbos times' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Usual weekday times' })).not.toBeInTheDocument()
    expect(screen.queryByText('Rabbi')).not.toBeInTheDocument()
    expect(screen.getByText('Changed')).toBeInTheDocument()
    expect(screen.getByText(/was 6:23 PM/)).toBeInTheDocument()
    const decide = screen.getByRole('group', { name: 'Decide' })
    expect(within(decide).getAllByRole('button').map((b) => b.textContent)).toEqual(['Change to 6:20 PM', 'Keep 6:23 PM'])
    // Where it came from, folded: who and when.
    const original = within(await openSource(user)).getByRole('region', { name: 'The original' })
    expect(original.querySelector('[data-mark="used"]')?.textContent).toBe('6:20pm')
    expect(original.querySelector('[data-mark="unused"]')?.textContent).toBe('6:23pm')

    await user.click(screen.getByRole('button', { name: 'Back to To do' }))
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
      expect(screen.getByTestId('place-frame')).toBeInTheDocument()
      await waitFor(() => expect(window.location.search).toBe('?open=shul-1'))
      expect(screen.getByTestId('place-frame')).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  // A link from before places named the suggestion: it opens its place.
  it('opens the card a shared link names, and Back from it returns to the list', async () => {
    window.history.replaceState(null, '', '/?open=sub-ai')
    renderShulQueue([aiEdit])
    expect(await screen.findByTestId('place-frame')).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe('?open=shul-1'))
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await waitFor(() => expect(screen.queryByTestId('todo-place')).toBeNull())
  })

  /** The decision the card's editor sent. */
  async function approved() {
    return waitFor(() => {
      const sent = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(sent).toBeTruthy()
      return JSON.parse(String(sent![1]!.body)) as { status: string; payload: { details: { rabbi: string; minyanim: { time: string }[] } } }
    })
  }

  it('the first answer takes the change as it came, and the list no longer has it', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderShulQueue([aiEdit, submission()])
    await user.click(await findRow('Mekor Habracha'))
    await user.click(within(screen.getByRole('group', { name: 'Decide' })).getByRole('button', { name: 'Change to 6:20 PM' }))
    const body = await approved()
    expect(body.status).toBe('approved')
    expect(body.payload.details.minyanim[0].time).toBe('6:20 PM')
    expect(body.payload.details.rabbi).toBe('Rabbi Ex')
    expect(await findRow('Acme Grocery')).toBeInTheDocument()
    expect(queryRow('Mekor Habracha')).not.toBeInTheDocument()
  })

  it('the second leaves the listing as it was', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderShulQueue([aiEdit])
    await user.click(await findRow('Mekor Habracha'))
    await user.click(within(screen.getByRole('group', { name: 'Decide' })).getByRole('button', { name: 'Keep 6:23 PM' }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]).toMatchObject({ status: 'rejected' })
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('shows a person’s note where the original would be', async () => {
    const user = userEvent.setup()
    renderShulQueue([submission({ note: 'Saw the sign on the door.', payload: { ...aiEdit.payload }, operation: 'update', target_id: 'shul-1', current: current as never, categoryLabel: 'Synagogues' })])
    await user.click(await findRow('Mekor Habracha'))
    const source = await openSource(user)
    expect(within(source).queryByRole('region', { name: 'The original' })).not.toBeInTheDocument()
    expect(source).toHaveTextContent('Jane Doe')
    expect(source).toHaveTextContent('Saw the sign on the door.')
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

  /** What the card's editor sent. */
  async function updated() {
    return waitFor(() => {
      const sent = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(sent).toBeTruthy()
      return JSON.parse(String(sent![1]!.body)) as { payload: { details: Record<string, unknown> } & Record<string, unknown> }
    })
  }

  // A change's card is the site's own editor, so the pick fills what it
  // fills there; edited, the answer is no longer the change as it came.
  it('fills the name, phone, hours and website, and updates with them', async () => {
    const user = userEvent.setup()
    renderBakeryQueue()
    await user.click(await findRow('Bakery'))
    const decide = screen.getByRole('group', { name: 'Decide' })
    expect(within(decide).getByRole('button', { name: 'Add 1 Bakery Way' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pick the Google place' }))
    expect(screen.getByLabelText('Phone')).toHaveValue('(215) 555-0100')
    await user.click(within(decide).getByRole('button', { name: 'Update the listing' }))

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
      await user.click(screen.getByRole('button', { name: 'Pick the Google place' }))
      await user.click(within(screen.getByRole('group', { name: 'Decide' })).getByRole('button', { name: 'Update the listing' }))
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
    vi.mocked(fetch).mockImplementation(async (url, init) => (init?.method === 'PATCH' ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : ({ ...fakeResponse(200), url: String(url) } as Response)))
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
    expect(rows.map((r) => r.getAttribute('href')!.replace(/^.*\/admin/, ''))).toEqual(['/home', '/team', '/categories/cat:new', '/home'])
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

  function renderRouted(
    { submissions = [], responses = [], google = [] }: { submissions?: EnrichedSubmission[]; responses?: unknown[]; google?: unknown[] },
    wrap: (ui: React.ReactElement) => React.ReactElement = (ui) => ui,
  ) {
    vi.mocked(fetch).mockImplementation(async (url, init) => (init?.method === 'PATCH' ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : ({ ...fakeResponse(200), url: String(url) } as Response)))
    vi.mocked(parseOkJson).mockImplementation(async (res) => {
      const url = String((res as Response).url)
      if (url.includes('/api/admin/responses')) return { responses }
      if (url.includes('/api/admin/watches/google')) return { places: google }
      if (url.includes('/api/admin/setup')) return { setup: null }
      return { submissions }
    })
    return renderWithProviders(wrap(<ModerationQueue session={session()} />), { content: { categories: [shul, makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })] } })
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
    await user.click(within(screen.getByRole('group', { name: 'Decide' })).getByRole('button', { name: 'Change to 6:20 PM' }))
    // Ticked, and what's left opens: a check that's fixed on the place's own screen.
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Google not found' })).toHaveAttribute('aria-selected', 'true'))
    expect(tabs()).toEqual(['Usual Shabbos times (done)', 'Google not found'])
    // Fixed right here (R2Google), not sent to the place's Watches page.
    expect(screen.getByRole('button', { name: 'Find it on Google' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not on Google' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Mekor Habracha' })).toBeNull()
  })

  // The user, Nov 4: Watches' "N things need fixing" opens To do on its
  // broken checks.
  it('opens on Broken checks from Watches’ link', async () => {
    window.history.replaceState(null, '', '/?show=broken')
    renderRouted({ submissions: [submission()], google: [notOnGoogle] })
    await findRow('Mekor Habracha')
    expect(screen.getByRole('button', { name: /^Show/ })).toHaveTextContent('Broken checks')
    expect(screen.queryByRole('button', { name: 'Open Acme Grocery' })).toBeNull()
    expect(window.location.search).toBe('')
  })

  // A link from inside the admin (Watches is a page of it): the router
  // puts the new address in only after To do's first render, so the filter
  // has to be read after it (the user, Nov 4: "it doesn't apply the filter").
  it('opens on Broken checks when the link came from another admin page', async () => {
    window.history.replaceState(null, '', '/watches')
    function AddressAfterRender({ children }: { children: React.ReactNode }) {
      useLayoutEffect(() => window.history.pushState(null, '', '/?show=broken'), [])
      return <>{children}</>
    }
    renderRouted({ submissions: [submission()], google: [notOnGoogle] }, (ui) => <AddressAfterRender>{ui}</AddressAfterRender>)
    await findRow('Mekor Habracha')
    expect(screen.getByRole('button', { name: /^Show/ })).toHaveTextContent('Broken checks')
    expect(screen.queryByRole('button', { name: 'Open Acme Grocery' })).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('opens on what the filter picked', async () => {
    const user = userEvent.setup()
    renderRouted({ submissions: [edit], google: [notOnGoogle] })
    await findRow('Mekor Habracha')
    await user.click(screen.getByRole('button', { name: /^Show/ }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Broken checks/ }))
    // A tap away only closes the menu (AdminMenu, Nov 4), so it's closed first.
    await user.keyboard('{Escape}')
    await user.click(row('Mekor Habracha'))
    expect(screen.getByRole('tab', { name: 'Google not found' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('button', { name: 'Change to 6:20 PM' })).toBeNull()
  })

  it('a place that’s done goes back to the list on a phone', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderRouted({ submissions: [submission(), submission({ id: 'sub-2', payload: { category: 'grocery', name: 'Giant', address: '2 Main St', details: {} } })] })
    await user.click(await findRow('Acme Grocery'))
    await user.click(screen.getByRole('button', { name: 'Add to the guide' }))
    await waitFor(() => expect(screen.queryByTestId('todo-place')).toBeNull())
    expect(row('Giant')).toBeInTheDocument()
    expect(window.location.search).toBe('')
    // Where it went, said (the user, Nov 4: a menu read again "disappeared.
    // Where'd they go").
    expect(screen.getByRole('status')).toHaveTextContent('Acme Grocery: nothing left to do')
    await user.click(row('Giant'))
    expect(screen.queryByText(/nothing left to do/)).toBeNull()
  })

  it('a place that’s done gives way to the next on a computer, and up and down step through them', async () => {
    const user = userEvent.setup()
    wide = true
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    const three = ['Acme Grocery', 'Giant', 'Zayde’s'].map((name, i) => submission({ id: `s${i}`, payload: { category: 'grocery', name, address: '2 Main St', details: {} } }))
    renderRouted({ submissions: three })
    await user.click(await findRow('Acme Grocery'))
    expect(screen.getAllByText('1 of 3').length).toBeGreaterThan(0)
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByText('2 of 3').length).toBeGreaterThan(0)
    await user.keyboard('{ArrowUp}')
    expect(screen.getAllByText('1 of 3').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Add to the guide' }))
    await waitFor(() => expect(window.location.search).toBe('?open=s1'))
    expect(screen.getAllByText('1 of 2').length).toBeGreaterThan(0)
    expect(within(screen.getByTestId('todo-place')).getByRole('heading', { level: 1, name: 'Giant' })).toBeInTheDocument()
  })

  it('feedback is Done, or a reply first when they left an email', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    renderRouted({ responses: [{ id: 'f', title: 'Feedback', line: 'Hours wrong', text: ['Hours wrong', 'at Primo'], email: 'sam@example.com', createdAt: '2026-11-01T12:00:00Z' }] })
    await user.click(await findRow('Feedback'))
    const opened = screen.getByTestId('todo-place')
    // L5Feedback: what they wrote, the first line quoted, who and when under it.
    expect(within(opened).getByText('“Hours wrong”')).toBeInTheDocument()
    expect(within(opened).getByText('at Primo')).toBeInTheDocument()
    expect(within(opened).getByText(/^No name given · sam@example\.com · Nov 1, /)).toBeInTheDocument()
    // Its answers in the place's own foot, like every other screen's.
    const decide = within(opened).getByRole('group', { name: 'Decide' })
    expect(within(decide).getByRole('link', { name: 'Reply' }).getAttribute('href')).toMatch(/^mailto:sam@example\.com\?subject=/)
    await user.click(within(decide).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(patches()).toEqual([{ status: 'handled' }]))
    expect(vi.mocked(fetchJson).mock.calls.find(([, init]) => init?.method === 'PATCH')![0]).toBe('/api/admin/responses/f?community=test-community')
    expect(await screen.findByText('Nothing to do')).toBeInTheDocument()
  })

  it('feedback with no email has only Done, and names who sent it', async () => {
    const user = userEvent.setup()
    renderRouted({ responses: [{ id: 'f', title: 'Feedback', line: 'Lovely site', text: ['Lovely site'], name: 'Sam Cohen', createdAt: '2026-11-01T12:00:00Z' }] })
    await user.click(await findRow('Feedback'))
    const decide = within(screen.getByTestId('todo-place')).getByRole('group', { name: 'Decide' })
    expect(within(decide).getAllByRole('button').map((b) => b.textContent)).toEqual(['Done'])
    expect(within(decide).queryByRole('link')).toBeNull()
    expect(screen.getByText(/^Sam Cohen · Nov 1, /)).toBeInTheDocument()
  })

  it('an edit is kept while another thing is open, and leaving with it open asks first', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    renderRouted({ submissions: [edit], google: [notOnGoogle] })
    await user.click(await findRow('Mekor Habracha'))
    // An edit in the card: the minyan's time typed over.
    await user.click(screen.getByRole('button', { name: /6:20 PM.*Changed/ }))
    const time = screen.getByLabelText('Time')
    await user.clear(time)
    await user.type(time, '6:15pm')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Update the listing' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Google not found' }))
    expect(screen.queryByRole('button', { name: 'Update the listing' })).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Usual Shabbos times' }))
    expect(screen.getByRole('button', { name: 'Update the listing' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Google not found' }))
    await user.click(screen.getByRole('button', { name: 'Back to To do' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('todo-place')).toBeInTheDocument()
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Back to To do' }))
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

  // The user, Nov 4: "should hitting to do again remove the filters?" With
  // a place open it closes the place, the list as it was; on the list, it
  // starts the list over.
  it('on the list, starts it over: filters, search and sort', async () => {
    const user = userEvent.setup()
    renderQueue([submission(), submission({ id: 'sub-2', payload: { category: 'grocery', name: 'Giant', address: '2 Main St', details: {} } })])
    await user.click(await findRow('Acme Grocery'))
    await user.click(screen.getByRole('button', { name: /^Show/ }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /New places/ }))
    await user.keyboard('{Escape}')
    const tap = () =>
      act(() => {
        window.history.pushState(null, '', window.location.pathname)
        window.dispatchEvent(new Event(ADMIN_AREA_TAPPED))
      })
    tap()
    expect(screen.queryByTestId('todo-place')).toBeNull()
    expect(screen.getByRole('button', { name: /^Show/ })).toHaveTextContent('New places')
    await user.type(screen.getByLabelText('Find a place by name'), 'gia')
    tap()
    expect(screen.getByRole('button', { name: /^Show/ })).toHaveTextContent('All')
    expect(screen.getByLabelText('Find a place by name')).toHaveValue('')
    expect(row('Acme Grocery')).toBeInTheDocument()
  })
})
