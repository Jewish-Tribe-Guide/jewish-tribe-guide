// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockRouter } from '@/test/nextNavigationMock'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import AddPlace from './AddPlace'

vi.mock('next/navigation', () => ({ useRouter: () => mockRouter, usePathname: () => '/philly/admin/places', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(async () => ({})), parseOkJson: vi.fn() }))
vi.mock('@/lib/useEditWeek', () => ({ useEditWeek: () => null }))
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

afterEach(() => {
  cleanup()
  vi.mocked(fetchJson).mockReset()
  vi.mocked(fetchJson).mockImplementation(async () => ({}))
  vi.unstubAllGlobals()
})

const posts = () => vi.mocked(fetchJson).mock.calls.filter(([, init]) => init?.method === 'POST').map(([url, init]) => [String(url).split('?')[0], JSON.parse(String(init?.body))])

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

  it('picked on Google, its rows say Google and What’s not there has no word (AddRows11)', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    expect(screen.getByText('Goes live as soon as you add it, with no review.')).toBeInTheDocument()
    expect(screen.queryByText('Filled in from Google')).toBeNull()
    for (const row of ['editor-row-name', 'editor-row-contact:phone', 'editor-row-field:website']) {
      expect(within(screen.getByTestId(row)).getByTestId('row-job')).toHaveTextContent('Google')
    }
    expect(within(screen.getByTestId('editor-empty')).queryByTestId('row-job')).toBeNull()
    expect(screen.getByTestId('editor-empty')).toHaveTextContent('Usual weekday times')
  })

  it('filled in by hand: Nothing, a phone isn’t needed, and Find it on Google goes back (AddSelf11, AddSelfPhone8)', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Fill it in yourself' }))
    expect(within(screen.getByTestId('editor-row-name')).getByTestId('row-job')).toHaveTextContent('Nothing')
    expect(screen.getByTestId('editor-add-contact:phone')).toBeInTheDocument()
    await user.click(screen.getByTestId('editor-add-contact:phone'))
    expect(screen.getByTestId('row-source')).toHaveTextContent('Nothing reads this · Find it on Google')
    await user.click(screen.getByRole('button', { name: 'Find it on Google' }))
    expect(screen.getByLabelText('Find the place')).toBeInTheDocument()
  })

  it('a choice waits, its line says so, and it’s saved with the listing (AddChange8, GivenRead13)', async () => {
    const user = userEvent.setup()
    const onClose = renderAdd()
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    await user.click(screen.getByTestId('editor-add-minyans:weekday'))
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByLabelText('A web page, or the email it comes from')).toHaveAttribute('placeholder', 'ohev.org/…')
    await user.type(screen.getByLabelText('A web page, or the email it comes from'), 'https://ohev.org/davening')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('ohev.org/davening')).toBeInTheDocument()
    expect(posts()).toEqual([])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Stop is kept till the listing’s saved (AddGoogle8)', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.click(screen.getByRole('button', { name: 'Pick it' }))
    await user.click(screen.getByTestId('editor-row-contact:phone'))
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(posts()).toEqual([])
    await waitFor(() => expect(screen.getByTestId('row-source')).toHaveTextContent('Nothing reads this · Use Google’s'))
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
    const sent = () => posts().map(([u, b]) => `${String(u).replace(/\?.*/, '')} ${(b as { action?: string } | undefined)?.action ?? ''}`.trim())

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
      expect(screen.getByTestId('row-source')).toHaveTextContent('Its website · Read now · Change')
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

    it('a page given is saved and read; if it can’t be, it’s said there (AddFailed8)', async () => {
      const user = userEvent.setup()
      site({ lastError: 'It wouldn’t open' })
      const onClose = renderAdd()
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await user.click(screen.getByTestId('editor-add-minyans:weekday'))
      await user.click(screen.getByRole('button', { name: 'Change' }))
      await user.type(screen.getByLabelText('A web page, or the email it comes from'), 'https://ohev.org/davening')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await screen.findByText('ohev.org/davening')
      await user.click(screen.getByRole('button', { name: 'Done' }))
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

    it('fills in the rows from its website, saving nothing (ReadDone13, ReadRows13)', async () => {
      const user = userEvent.setup()
      reading({ state: 'done', details: { email: 'office@ohev.org', minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['mon'], time: '7:00am' }] } })
      renderAdd()
      await openTimes(user)
      await user.click(screen.getByRole('button', { name: 'Read now' }))
      await waitFor(() => expect(sourceWords()).toContain('just now'))
      const [[path, body]] = posts()
      expect(path).toContain('/api/admin/read-now')
      expect(body).toMatchObject({ slot: 'page', category: 'synagogue', draft: { name: 'Ohev Shalom' } })
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(screen.getByTestId('editor-row-minyans:weekday')).toHaveTextContent('Shacharis 7 AM')
    })

    it('says when the website has none, or couldn’t be read (ReadNothing13, ReadFailed13)', async () => {
      const user = userEvent.setup()
      reading({ state: 'none' })
      renderAdd()
      await openTimes(user)
      await user.click(screen.getByRole('button', { name: 'Read now' }))
      await waitFor(() => expect(sourceWords()).toContain('No minyan times on its website'))
      cleanup()
      reading({ state: 'failed' })
      renderAdd()
      await openTimes(user)
      await user.click(screen.getByRole('button', { name: 'Read now' }))
      await waitFor(() => expect(sourceWords()).toContain('Couldn’t read its website'))
      expect(screen.getByRole('button', { name: 'Read now' })).toBeInTheDocument()
    })
  })

  describe('Read now for email', () => {
    function reading(reply: unknown) {
      vi.mocked(fetchJson).mockImplementation(async (url) => (String(url).includes('/read-now') ? reply : {}))
    }
    const sourceWords = () => screen.getAllByTestId('row-source').map((p) => p.textContent).join('\n')
    async function giveEmail(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Pick it' }))
      await user.click(screen.getByTestId('editor-add-minyans:weekday'))
      await user.click(screen.getByRole('button', { name: 'Change' }))
      await user.type(screen.getByLabelText('A web page, or the email it comes from'), 'office@ohev.org')
      await user.click(screen.getByRole('button', { name: 'Save' }))
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
      const body = posts().find(([u]) => String(u).includes('/read-now'))![1]
      expect(body).toMatchObject({ slot: 'email', url: 'office@ohev.org' })
    })

    it('no Gmail connected: where to connect it (EmailNoGmail14)', async () => {
      const user = userEvent.setup()
      reading({ state: 'no-gmail' })
      renderAdd()
      await giveEmail(user)
      await readEmail(user)
      expect(await screen.findByRole('link', { name: 'Set it up' })).toHaveAttribute('href', expect.stringContaining('/watches/newsletters'))
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
})
