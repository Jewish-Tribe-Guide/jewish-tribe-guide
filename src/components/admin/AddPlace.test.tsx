// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { mockRouter } from '@/test/nextNavigationMock'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import AddPlace from './AddPlace'

vi.mock('next/navigation', () => ({ useRouter: () => mockRouter, usePathname: () => '/philly/admin/places', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(async () => ({})), parseOkJson: vi.fn() }))
// No week but where a test gives one (this week's row).
const editWeek = vi.hoisted(() => ({ now: null as null | { week: { from: string; to: string }; next: { from: string; to: string } } }))
vi.mock('@/lib/useEditWeek', () => ({ useEditWeek: () => editWeek.now }))
vi.mock('@/components/intake/AddressInput', () => ({
  default: ({ id, onChange, onPlaceSelect, suggestionNote }: { id: string; onChange: (v: string) => void; onPlaceSelect: (r: unknown) => void; suggestionNote?: (id: string) => string | null }) => (
    <div>
      <input id={id} aria-label="Find the place" />
      <span>{suggestionNote?.('in-guide')}</span>
      <button
        type="button"
        onClick={() => {
          onChange('2 Chester Rd')
          onPlaceSelect({ placeId: 'p1', name: 'Ohev Shalom', phone: '2155550142', website: 'https://ohev.org', businessStatus: 'OPERATIONAL', address: '2 Chester Rd' })
        }}
      >
        Pick it
      </button>
    </div>
  ),
}))

const shul = makeCategory({
  id: 'synagogue',
  label: 'Synagogue',
  detailFields: [
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
  ],
})

// The router writes the address, as Next's does: Add's moves wait for each
// to land (useScreenHistory.ts), on one queue for the whole file.
beforeEach(() => {
  window.history.replaceState({}, '', '/philly/admin/places?add=synagogue')
  mockRouter.push.mockImplementation((url: string) => window.history.pushState({}, '', url))
  mockRouter.replace.mockImplementation((url: string) => window.history.replaceState({}, '', url))
})

afterEach(() => {
  cleanup()
  mockRouter.push.mockClear()
  mockRouter.replace.mockClear()
  vi.mocked(fetchJson).mockReset()
  vi.mocked(fetchJson).mockImplementation(async () => ({}))
  vi.unstubAllGlobals()
})

const posts = () => vi.mocked(fetchJson).mock.calls.filter(([, init]) => init?.method === 'POST').map(([url, init]) => [String(url).split('?')[0], JSON.parse(String(init?.body))])
/** What's saved: a read (on a pick, or Read now) saves nothing. */
const saves = () => posts().filter(([u]) => u !== '/api/admin/read-now')

/** A page or an email for its usual weekday times, as an admin gives one:
 *  Change on the row's line (or Add a page, when its website had nothing),
 *  the field, Done (board N4). */
async function giveSource(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.click(screen.getByTestId('editor-add-minyans:weekday'))
  const open = within(screen.getByTestId('editor-open-minyans:weekday'))
  const change = open.queryByRole('button', { name: 'Change' }) ?? open.queryByRole('button', { name: /^Add a page/ })
  if (change) await user.click(change)
  const field = screen.getByTestId('source-field')
  expect(field.closest('[data-testid="row-source-foot"]')).not.toBeNull()
  await user.clear(field)
  await user.type(field, value)
  await user.click(screen.getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByTestId('source-field')).toBeNull())
}

function renderAdd(onClose = vi.fn(), category = shul) {
  renderWithProviders(<AddPlace category={category} listings={[{ id: 'x', category: 'synagogue', name: 'There', anchorId: 'all', distance: 0, address: '', placeId: 'in-guide' }]} token="tok" onClose={onClose} />, { community: { slug: 'philly' } })
  return onClose
}

describe('Add a place', () => {
  it('starts at Find the place, and marks what the guide has (AddFind8)', () => {
    renderAdd()
    expect(screen.getByLabelText('Find the place')).toBeInTheDocument()
    expect(screen.getByText('Already in the guide')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill it in yourself' })).toBeInTheDocument()
  })

  // Board U3 (Nov 26): Find names what's being added, when the category's
  // name is a thing (it has a plural), and Back is the step before it.
  it('Find names a synagogue, says Step 2 of 3, and Back goes to the step before', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    const onClose = vi.fn()
    renderWithProviders(<AddPlace category={{ ...shul, pluralLabel: 'Synagogues' }} listings={[]} token="tok" onClose={onClose} onBack={onBack} />, { community: { slug: 'philly' } })
    expect(screen.getByRole('heading', { name: 'Add a synagogue' })).toBeInTheDocument()
    expect(screen.getByLabelText('Find the synagogue')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /Back/ })[0])
    expect(onBack).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('picked on Google, its rows say Google and What’s not there has no word (AddRows11)', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    expect(screen.getByText('Goes live as soon as you add it, with no review.')).toBeInTheDocument()
    expect(screen.queryByText('Filled in from Google')).toBeNull()
    for (const row of ['editor-row-name', 'editor-row-contact:phone', 'editor-row-field:website']) {
      const job = within(screen.getByTestId(row)).getByTestId('row-job')
      expect(job).toHaveAttribute('data-job', 'Google')
      expect(job).toHaveTextContent('Checked nightly')
    }
    expect(within(screen.getByTestId('editor-empty')).queryByTestId('row-job')).toBeNull()
    expect(screen.getByTestId('editor-empty')).toHaveTextContent('Usual weekday times')
  })

  it('filled in by hand: Nothing, a phone isn’t needed, and Find it on Google goes back (AddSelf11, AddSelfPhone8)', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Fill it in yourself' }))
    expect(within(screen.getByTestId('editor-row-name')).getByTestId('row-job')).toHaveAttribute('data-job', 'Nothing')
    expect(within(screen.getByTestId('editor-row-name')).getByTestId('row-job')).toHaveTextContent('Not checked')
    expect(screen.getByTestId('editor-add-contact:phone')).toBeInTheDocument()
    await user.click(screen.getByTestId('editor-add-contact:phone'))
    expect(screen.getByTestId('row-source')).toHaveTextContent(/^Find it on Google$/)
    await user.click(screen.getByRole('button', { name: 'Find it on Google' }))
    expect(screen.getByLabelText('Find the place')).toBeInTheDocument()
  })

  // Board N4, Nov 25: Change opens a field in the row; its Done keeps it.
  it('a choice waits, its line says so, and it’s saved with the listing (AddChange8, GivenRead13)', async () => {
    const user = userEvent.setup()
    const onClose = renderAdd()
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    await giveSource(user, 'https://ohev.org/davening')
    expect(screen.queryByTestId('source-field')).toBeNull()
    await user.click(screen.getByTestId('editor-add-minyans:weekday'))
    expect(screen.getAllByTestId('row-source')[0]).toHaveTextContent('ohev.org/davening')
    expect(saves()).toEqual([])
    expect(onClose).not.toHaveBeenCalled()
  })

  // Nov 25: the field only once it's asked for, by Add a page.
  it('a row with no source: Add a page opens its field, and Done keeps it', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Fill it in yourself' }))
    await user.click(screen.getByTestId('editor-add-minyans:weekday'))
    const open = screen.getByTestId('editor-open-minyans:weekday')
    expect(within(open).getByTestId('row-job')).toHaveTextContent('Not checked')
    expect(within(open).queryByText('Nothing reads this')).toBeNull()
    expect(screen.queryByTestId('source-field')).toBeNull()
    expect(screen.getByTestId('row-source')).toHaveTextContent(/^Add a page$/)
    await user.click(within(open).getByRole('button', { name: 'Add a page' }))
    expect(screen.getByTestId('source-field')).toHaveAttribute('placeholder', 'A page’s link')
    expect(within(open).queryByRole('button', { name: 'Add a page' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    // Left empty, nothing changes, and the field's gone again.
    await user.click(screen.getByTestId('editor-add-minyans:weekday'))
    expect(screen.queryByTestId('source-field')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add a page' }))
    await user.type(screen.getByTestId('source-field'), 'https://ohev.org/davening')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByTestId('editor-add-minyans:weekday'))
    expect(screen.getAllByTestId('row-source').map((p) => p.textContent)).toEqual(['From ohev.org/davening · Read now · Change'])
    expect(screen.queryByTestId('source-field')).toBeNull()
    expect(posts()).toEqual([])
  })

  // Nov 25: opened, there was no way out but Done.
  it('a field opened by mistake: a click away closes it while empty, Escape always', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Fill it in yourself' }))
    await user.click(screen.getByTestId('editor-add-minyans:weekday'))
    const away = screen.getByText('Usual weekday times')
    await user.click(screen.getByRole('button', { name: 'Add a page' }))
    expect(screen.getByTestId('source-field')).toBeTruthy()
    await user.click(away)
    expect(screen.queryByTestId('source-field')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a page' })).toBeTruthy()
    // Something typed stays through a click away; Escape drops it.
    await user.click(screen.getByRole('button', { name: 'Add a page' }))
    await user.type(screen.getByTestId('source-field'), 'https://ohev.org/davening')
    await user.click(away)
    expect(screen.getByTestId('source-field')).toHaveValue('https://ohev.org/davening')
    await user.type(screen.getByTestId('source-field'), '{Escape}')
    expect(screen.queryByTestId('source-field')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(posts()).toEqual([])
  })

  it('a Google field has no Stop: typed over, Google stops keeping it', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    await user.click(screen.getByTestId('editor-row-contact:phone'))
    expect(screen.getByTestId('row-source')).toHaveTextContent(/^From Google$/)
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    const phone = within(screen.getByTestId('editor-open-contact:phone')).getAllByRole('textbox')[0]
    await user.clear(phone)
    await user.type(phone, '215-555-0199')
    expect(screen.getByTestId('row-source')).toHaveTextContent(/^Google stops keeping this$/)
    expect(saves()).toEqual([])
  })

  // Nov 25: a sentence about a source isn't its name, so no "From" before
  // it ("From Not on Keystone-K…"), and the field says which page it wants.
  // Nov 25: a sentence about a source isn't its name, so no "From" before
  // it; it says when the lists were read; and there's nothing to give.
  it('Kosher: not found on the lists is said as it is, with when they were read, and no field', async () => {
    const user = userEvent.setup()
    const readAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    vi.mocked(fetchJson).mockImplementation(async (_url, init) =>
      JSON.parse(String(init?.body ?? '{}')).slot === 'kosher' ? { kosher: { lists: [], none: 'Not found on Keystone-K or Mekor Habracha’s list', readAt } } : {},
    )
    const food = makeCategory({
      id: 'restaurant',
      label: 'Food',
      placeKind: 'food',
      detailFields: [{ key: 'kosherCert', label: 'Kosher Certification', type: 'select', options: [{ value: 'IKC', label: 'IKC' }] }],
    })
    renderAdd(vi.fn(), food)
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    const row = await waitFor(() => screen.getByTestId(/^editor-(add|row)-.*kosher/i))
    await user.click(row)
    await waitFor(() => expect(screen.getByTestId('row-source')).toHaveTextContent(/^Not found on Keystone-K or Mekor Habracha’s list · read last night$/))
    expect(screen.queryByTestId('source-field')).toBeNull()
    expect(within(screen.getByTestId('row-source')).queryByRole('button')).toBeNull()
  })

  describe('after Add listing', () => {
    const added = { id: 'new', category: 'synagogue', name: 'Ohev Shalom', phone: '2155550142', address: '', website: 'https://ohev.org' }
    /** The site, as far as this screen goes: `found` is what's waiting. */
    function site({ found = [] as unknown[], lastError = null as string | null } = {}) {
      vi.mocked(fetchJson).mockImplementation(async (url, init) => {
        const u = String(url)
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        if (u.includes('/found') && init?.method !== 'POST') return { found }
        if (u.includes('/watches/hours') && body.action === 'give') return { pages: [{ watch: { id: 'w1', url: body.url, lastError } }] }
        if (u.includes('/watches/hours') && body.action === 'check' && !body.id) return { read: ['w2'] }
        return {}
      })
    }
    async function addIt(user: ReturnType<typeof userEvent.setup>) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, listing: added }), { status: 200 })))
      await user.click(screen.getByRole('button', { name: 'Add listing' }))
    }
    const sent = () => saves().map(([u, b]) => `${String(u).replace(/\?.*/, '')} ${(b as { action?: string } | undefined)?.action ?? ''}`.trim())

    it('a food place’s website is read as any other’s, not by the hours job (FoodDone13)', async () => {
      const user = userEvent.setup()
      site()
      const food = makeCategory({ id: 'hotel', label: 'Hotel', detailFields: [{ key: 'website', label: 'Website', type: 'url' }, { key: 'hours', label: 'Hours', type: 'hours' }] })
      renderAdd(vi.fn(), food)
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await addIt(user)
      await waitFor(() => expect(sent()).toContain('/api/admin/listings/new/found site'))
      expect(sent().filter((s) => s.includes('/watches/hours'))).toEqual([])
    })

    it('a mikvah: each section is a row, and what’s written in one says the mikvah has it (AddMikvah12)', async () => {
      const user = userEvent.setup()
      const mikvah = makeCategory({
        id: 'mikvah',
        label: 'Mikvah',
        detailFields: [
          { key: 'website', label: 'Website', type: 'url' },
          { key: 'womenTevillah', label: 'Women’s Tevillah', filterLabel: 'Women’s', type: 'boolean', renderAs: 'badge' },
          { key: 'menTevillah', label: 'Men’s Tevillah', filterLabel: 'Men’s', type: 'boolean', renderAs: 'badge' },
          { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours', audienceKey: 'womenTevillah' },
          { key: 'women_s_notes', label: 'Women’s Notes', shortLabel: 'Note', type: 'textarea', audienceKey: 'womenTevillah' },
          { key: 'men_s_hours', label: 'Men’s Hours', type: 'hours', audienceKey: 'menTevillah' },
        ],
      })
      site()
      const fetched = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ok: true, listing: { ...added, category: 'mikvah' } }), { status: 200 }))
      renderAdd(vi.fn(), mikvah)
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await user.click(screen.getByTestId('editor-add-audience:womenTevillah'))
      expect(screen.getAllByTestId('row-source').at(-1)).toHaveTextContent('From its website · Read now · Change')
      await user.type(document.querySelector('textarea')!, 'By appointment')
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(screen.getByTestId('editor-add-audience:menTevillah')).toBeInTheDocument()
      vi.stubGlobal('fetch', fetched)
      await user.click(screen.getByRole('button', { name: 'Add listing' }))
      await waitFor(() => expect(fetched).toHaveBeenCalled())
      const sentBody = JSON.parse(String(fetched.mock.calls[0][1].body))
      expect(sentBody.payload.details).toMatchObject({ womenTevillah: true, women_s_notes: 'By appointment' })
      expect(sentBody.payload.details.menTevillah).toBeFalsy()
    })

    it('reads it and offers what it found: one tap adds it all (AddFound13)', async () => {
      const user = userEvent.setup()
      site({ found: [{ id: 's1', payload: { details: { minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['mon'], time: '07:00' }] } } }] })
      const onClose = renderAdd()
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await addIt(user)
      expect(await screen.findByText('Ohev Shalom is added')).toBeInTheDocument()
      expect(screen.getByText('Found on its website')).toBeInTheDocument()
      expect(screen.getByTestId('found-lines')).toHaveTextContent('Usual weekday times: 1 time')
      expect(sent()).toEqual(['/api/admin/listings/new/found google', '/api/admin/watches/hours check', '/api/admin/watches/hours check'])
      await user.click(screen.getByRole('button', { name: 'Add to the listing' }))
      expect(sent()).toContain('/api/admin/listings/new/found take')
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('Decide later leaves it all on To do', async () => {
      const user = userEvent.setup()
      site({ found: [{ id: 's1', payload: { details: { minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['mon'], time: '07:00' }] } } }] })
      const onClose = renderAdd()
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await addIt(user)
      await user.click(await screen.findByRole('button', { name: 'Decide later in To do' }))
      expect(onClose).toHaveBeenCalled()
      expect(sent()).not.toContain('/api/admin/listings/new/found take')
    })

    it('nothing found: straight back to Places', async () => {
      const user = userEvent.setup()
      site()
      const onClose = renderAdd()
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await addIt(user)
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    // Once the listing was made, every save after it was allSettled or
    // caught to null and never looked at: "is added" read as done while
    // its Stop never saved (Nov 18 review).
    it('a save after the listing that fails is said, and the screen stays', async () => {
      const user = userEvent.setup()
      site()
      vi.mocked(fetchJson).mockImplementation(async (url, init) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        if (String(url).includes('/found') && body.action === 'google') throw new Error('Could not do that.')
        return String(url).includes('/found') && init?.method !== 'POST' ? { found: [] } : {}
      })
      const onClose = renderAdd()
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await addIt(user)
      expect(await screen.findByRole('alert')).toHaveTextContent('Not saved: Google’s details')
      expect(onClose).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(onClose).toHaveBeenCalled()
    })

    it('Add to the listing that fails says so and stays', async () => {
      const user = userEvent.setup()
      site({ found: [{ id: 's1', payload: { details: { minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['mon'], time: '07:00' }] } } }] })
      const onClose = renderAdd()
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await addIt(user)
      await screen.findByText('Found on its website')
      vi.mocked(fetchJson).mockRejectedValue(new Error('Could not do that.'))
      await user.click(screen.getByRole('button', { name: 'Add to the listing' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t add it.')
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Add to the listing' })).toBeEnabled()
    })

    it('a page given is saved and read; if it can’t be, it’s said there (AddFailed8)', async () => {
      const user = userEvent.setup()
      site({ lastError: 'It wouldn’t open' })
      const onClose = renderAdd()
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await giveSource(user, 'https://ohev.org/davening')
      await addIt(user)
      expect(await screen.findByText('Ohev Shalom is added')).toBeInTheDocument()
      expect(screen.getByText('Couldn’t read that page')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Start reading' })).toBeInTheDocument()
      expect(sent()).toContain('/api/admin/watches/hours give')
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Read now', () => {
    const sourceWords = () => screen.getAllByTestId('row-source').map((p) => p.textContent).join('\n')
    function reading(reply: unknown) {
      vi.mocked(fetchJson).mockImplementation(async (url) => (String(url).includes('/read-now') ? reply : {}))
    }
    async function openTimes(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await user.click(screen.getByTestId('editor-add-minyans:weekday'))
    }

    // Board N5, Nov 25: picked on Google, its website is read straight
    // away; what it finds waits for Use these times, with no sticker.
    it('picked, its website is read at once, and what it finds waits for Use these times', async () => {
      const user = userEvent.setup()
      let answer: (v: unknown) => void = () => {}
      vi.mocked(fetchJson).mockImplementation((url) => (String(url).includes('/read-now') ? new Promise((r) => (answer = r)) : Promise.resolve({})))
      renderAdd()
      await openTimes(user)
      const [[path, body]] = posts()
      expect(path).toBe('/api/admin/read-now')
      expect(body).toMatchObject({ slot: 'page', category: 'synagogue', draft: { name: 'Ohev Shalom' } })
      expect(screen.getByTestId('row-job')).toHaveTextContent('Checking…')
      expect(sourceWords()).toBe('Reading its website… · Use a different page')
      answer({ state: 'done', details: { email: 'office@ohev.org', minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['mon'], time: '7:00am' }] } })
      await waitFor(() => expect(sourceWords()).toBe('Found on its website: 1 time · Use these times · Change'))
      expect(screen.queryByTestId('row-job')).toBeNull()
      // Nothing's put in till it's used.
      expect(screen.getByTestId('editor-open-minyans:weekday')).not.toHaveTextContent('Shacharis 7 AM')
      await user.click(screen.getByRole('button', { name: 'Use these times' }))
      expect(sourceWords()).toBe('From its website · just now · Change')
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(screen.getByTestId('editor-row-minyans:weekday')).toHaveTextContent('Shacharis 7 AM')
      expect(saves()).toEqual([])
    })

    it('a different page, given while it reads, is read instead; the first answer is dropped', async () => {
      const user = userEvent.setup()
      const answers: ((v: unknown) => void)[] = []
      vi.mocked(fetchJson).mockImplementation((url) => (String(url).includes('/read-now') ? new Promise((r) => answers.push(r)) : Promise.resolve({})))
      renderAdd()
      await openTimes(user)
      await user.click(screen.getByRole('button', { name: 'Use a different page' }))
      await user.type(screen.getByTestId('source-field'), 'https://ohev.org/davening')
      await user.click(screen.getByRole('button', { name: 'Done' }))
      await waitFor(() => expect(answers).toHaveLength(2))
      expect(posts().map(([, b]) => b.url)).toEqual([undefined, 'https://ohev.org/davening'])
      answers[0]({ state: 'done', details: { minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['mon'], time: '7:00am' }] } })
      answers[1]({ state: 'none' })
      await user.click(screen.getByTestId('editor-add-minyans:weekday'))
      await waitFor(() => expect(sourceWords()).toBe('No minyan times on ohev.org/davening · Add a page'))
    })

    // Nov 26: nothing there, so nothing to change: one link, to add a page.
    it('nothing found: Not checked, its field behind Add a page; couldn’t read: Read now (ReadNothing13, ReadFailed13)', async () => {
      const user = userEvent.setup()
      reading({ state: 'none' })
      renderAdd()
      await openTimes(user)
      await waitFor(() => expect(sourceWords()).toBe('No minyan times on its website · Add a page'))
      expect(screen.getByTestId('row-job')).toHaveTextContent('Not checked')
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
      // Nov 25: no field till it's asked for.
      expect(screen.queryByTestId('source-field')).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Add a page' }))
      expect(screen.getByTestId('source-field')).toHaveValue('')
      // The field sits under the line, which says why it's needed.
      expect(sourceWords()).toBe('No minyan times on its website')
      await user.type(screen.getByTestId('source-field'), '{Escape}')
      expect(sourceWords()).toBe('No minyan times on its website · Add a page')
      cleanup()
      reading({ state: 'failed' })
      renderAdd()
      await openTimes(user)
      await waitFor(() => expect(sourceWords()).toContain('Couldn’t read its website'))
      await user.click(screen.getByRole('button', { name: 'Read now' }))
      expect(posts().filter(([u]) => u === '/api/admin/read-now')).toHaveLength(3)
    })

    // Nov 26: one link for this week too, a page or an email; the line stays.
    it('this week’s Add a page or an email opens its field under the line, which stays', async () => {
      const user = userEvent.setup()
      reading({ state: 'none' })
      editWeek.now = { week: { from: '2026-11-22', to: '2026-11-28' }, next: { from: '2026-11-29', to: '2026-12-05' } }
      onTestFinished(() => {
        editWeek.now = null
      })
      renderAdd()
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await user.click(screen.getByTestId('editor-add-minyans:this_week'))
      await waitFor(() => expect(sourceWords()).toBe('No minyan times on its website · Add a page or an email'))
      await user.click(screen.getByRole('button', { name: 'Add a page or an email' }))
      expect(sourceWords()).toBe('No minyan times on its website')
      expect(screen.getByTestId('source-field')).toHaveAttribute('placeholder', 'A page’s link or an email')
    })

    it('filled in by hand, nothing is read till Read now', async () => {
      const user = userEvent.setup()
      reading({ state: 'none' })
      renderAdd()
      await user.click(screen.getByRole('button', { name: 'Fill it in yourself' }))
      expect(posts()).toEqual([])
    })
  })

  describe('Read now for email', () => {
    // The page's own read, on the pick, finds nothing.
    function reading(reply: unknown) {
      vi.mocked(fetchJson).mockImplementation(async (url, init) => (String(url).includes('/read-now') ? (JSON.parse(String(init?.body)).slot === 'email' ? reply : { state: 'none' }) : {}))
    }
    const sourceWords = () => screen.getAllByTestId('row-source').map((p) => p.textContent).join('\n')
    async function giveEmail(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await giveSource(user, 'office@ohev.org')
      await user.click(screen.getByTestId('editor-add-minyans:weekday'))
      await waitFor(() => expect(sourceWords()).toContain('office@ohev.org'))
    }
    const readEmail = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getAllByRole('button', { name: 'Read now' })[0])

    it('none yet: says so, with the address to sign up with (EmailNone14)', async () => {
      const user = userEvent.setup()
      reading({ state: 'no-email', account: 'guide@gmail.com' })
      renderAdd()
      await giveEmail(user)
      await readEmail(user)
      expect(await screen.findByText(/Sign up for its emails with guide@gmail.com/)).toBeInTheDocument()
      expect(sourceWords()).toContain('No emails from office@ohev.org yet')
      const body = posts().find(([u, b]) => String(u).includes('/read-now') && b.slot === 'email')![1]
      expect(body).toMatchObject({ slot: 'email', url: 'office@ohev.org' })
    })

    it('no Gmail connected: where to connect it (EmailNoGmail14)', async () => {
      const user = userEvent.setup()
      reading({ state: 'no-gmail' })
      renderAdd()
      await giveEmail(user)
      await readEmail(user)
      expect(await screen.findByRole('link', { name: 'Set it up' })).toHaveAttribute('href', expect.stringContaining('/team/email'))
    })

    it('found: fills in, and says the day it was sent (EmailFound14)', async () => {
      const user = userEvent.setup()
      reading({ state: 'found', on: 'Oct 30', account: 'guide@gmail.com', details: { minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['mon'], time: '7:00am' }] } })
      renderAdd()
      await giveEmail(user)
      await readEmail(user)
      await waitFor(() => expect(sourceWords()).toContain('office@ohev.org · Oct 30'))
    })
  })

  // Nov 18: the form after Find was only state, so the browser's Back left
  // Add altogether, and a reload on the form had no address to land on.
  describe('in the address', () => {
    it('the form is an entry: Back goes to Find, Forward to the form again', async () => {
      const user = userEvent.setup()
      renderAdd()
      await user.click(screen.getByRole('button', { name: 'Fill it in yourself' }))
      await waitFor(() => expect(window.location.search).toBe('?add=synagogue&step=finish'))

      act(() => history.back())
      expect(await screen.findByLabelText('Find the place')).toBeInTheDocument()
      act(() => history.forward())
      expect(await screen.findByTestId('editor-row-name')).toBeInTheDocument()
    })

    it('a reload on the form is Find, and the address says so in place', async () => {
      window.history.replaceState({}, '', '/philly/admin/places?add=synagogue&step=finish&row=hours')
      renderAdd()
      expect(screen.getByLabelText('Find the place')).toBeInTheDocument()
      await waitFor(() => expect(window.location.search).toBe('?add=synagogue'))
      expect(mockRouter.push).not.toHaveBeenCalled()
    })
  })
})
