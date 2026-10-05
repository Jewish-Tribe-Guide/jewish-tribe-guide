// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { showsSiteAdd } from './SiteAddButton'
import TellUsSheet from './TellUsSheet'

vi.mock('@/components/resources/useListingSubmit', async (original) => ({ ...(await original<object>()), TURNSTILE_ACTIVE: false }))
vi.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => true }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly',
  useSearchParams: () => new URLSearchParams(),
}))
afterEach(() => cleanup())

const ARCH = { id: 'arch', name: 'Trader Joe’s', address: '1324 Arch St, Philadelphia, PA', category: 'grocery', categoryLabel: 'Grocery' }
const MARKET = { id: 'market', name: 'Trader Joe’s', address: '2121 Market St, Philadelphia, PA', category: 'grocery', categoryLabel: 'Grocery' }
const ground = { name: 'Hamburger Meat', availability: 'always', doubt: null }

// What /api/message/read returned for message #7 and #11 of the Oct 4 test.
const reading = {
  ok: true,
  photoUrls: ['https://x.supabase.co/storage/v1/object/public/site-assets/message-source/1-a.webp'],
  proposals: [
    { kind: 'items', listingId: 'arch', listing: ARCH, asWritten: 'Trader Joe’s on Arch', chain: false, ask: null, items: [ground], lines: ['+ Hamburger Meat'], held: ['Chicken: already listed'], quote: 'x', checked: true },
    {
      kind: 'items',
      listingId: null,
      listing: null,
      asWritten: 'trader joes',
      chain: false,
      ask: { question: 'Which Trader Joe’s?', choices: [{ label: 'Arch St', listingId: 'arch', listing: ARCH, lines: ['+ Ground Turkey, sometimes'], held: [] }, { label: 'Market St', listingId: 'market', listing: MARKET, lines: ['+ Ground Turkey, sometimes'], held: [] }] },
      items: [{ name: 'Ground Turkey', availability: 'sometimes', doubt: null }],
      lines: [],
      held: [],
      quote: 'x',
      checked: true,
    },
    {
      kind: 'new_place',
      category: 'grocery',
      categoryLabel: 'Grocery',
      place: { name: 'South Square Market', kind: null, address: '22nd & South', phone: null, website: null, kosherCert: null, meatDairy: null, notes: null },
      items: [{ name: 'Challah', availability: 'always', doubt: null }],
      maybe: [],
      seed: { name: 'South Square Market', address: '22nd & South', phone: '', m: ['Challah'], m_sometimes: [] },
      quote: 'x',
      checked: true,
      note: null,
    },
  ],
}

describe('Saw something? Tell us', () => {
  let calls: { url: string; init?: RequestInit }[]
  let respond: (url: string) => unknown
  beforeEach(() => {
    calls = []
    respond = (url) => (url.includes('/read') ? reading : { ok: true, filed: 3 })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify(respond(String(url))))
    })
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${Math.random()}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  const open = (props: Partial<Parameters<typeof TellUsSheet>[0]> = {}) =>
    renderWithProviders(<TellUsSheet isOpen onClose={() => {}} {...props} />, {
      community: { slug: 'philly' },
      content: { categories: [makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })] },
    })

  it('reads what they wrote with their photos, and shows each store as it will be', async () => {
    open()
    expect(screen.getByRole('button', { name: 'See what changes' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'TJ on Arch always has ground beef' } })
    fireEvent.change(screen.getByLabelText('Add a photo'), { target: { files: [new File(['x'], 'a.webp', { type: 'image/webp' })] } })
    expect(screen.getByAltText('Photo 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))

    const cards = await screen.findAllByTestId('tell-us-card')
    expect(calls[0].url).toBe('/api/message/read?community=philly')
    const sent = calls[0].init!.body as FormData
    expect(sent.get('text')).toBe('TJ on Arch always has ground beef')
    expect((sent.get('file') as File).name).toBe('a.webp')
    expect(within(cards[0]).getByText('+ Hamburger Meat')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Not changed: Chicken: already listed')).toBeInTheDocument()
    expect(screen.getByText(/Read by AI from what you sent/)).toBeInTheDocument()
  })

  // Oct 5: on desktop a photo could only be added with the button.
  it('takes a pasted screenshot and dropped photos, up to three, ignoring anything that isn’t one', async () => {
    open()
    const box = screen.getByTestId('tell-us')
    const png = (n: string) => new File(['x'], n, { type: 'image/png' })
    fireEvent.paste(box, { clipboardData: { files: [png('shot.png')] } })
    expect(screen.getByAltText('Photo 1')).toBeInTheDocument()
    fireEvent.dragEnter(box, { dataTransfer: { types: ['Files'] } })
    expect(screen.getByTestId('tell-us-drop')).toHaveTextContent('Drop to add the photo')
    fireEvent.drop(box, { dataTransfer: { types: ['Files'], files: [png('a.png'), new File(['x'], 'notes.pdf', { type: 'application/pdf' }), png('b.png'), png('c.png')] } })
    expect(screen.queryByTestId('tell-us-drop')).not.toBeInTheDocument()
    expect(screen.getAllByAltText(/^Photo \d$/)).toHaveLength(3)
    // Pasting text is still just typing.
    fireEvent.paste(box, { clipboardData: { files: [] } })
    expect(screen.getAllByAltText(/^Photo \d$/)).toHaveLength(3)
  })

  // Agreed Oct 5: several places in one message, one at a time: "1 of 3",
  // ‹ ›, Next and Send. A sent place leaves the count; sending the last
  // shows the one before it.
  it('shows several places one at a time, each sent on its own, asking “which one?” where it must', async () => {
    respond = (url) => (url.includes('/read') ? reading : { ok: true, filed: 1, ids: [`id-${calls.length}`] })
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'trader joes sometimes has ground turkey' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    await screen.findByTestId('tell-us-card')
    expect(screen.getAllByTestId('tell-us-card')).toHaveLength(1)
    expect(screen.getByTestId('tell-us-count')).toHaveTextContent('Trader Joe’s · 1 of 3')

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Sent: Trader Joe’s')).toBeInTheDocument()
    expect(JSON.parse(String(calls[1].init!.body))).toMatchObject({ text: 'trader joes sometimes has ground turkey', photoUrls: reading.photoUrls, stores: [{ listingId: 'arch', items: [ground] }] })
    // The next one slides in: the chain, which waits for its branch.
    expect(screen.getByTestId('tell-us-count')).toHaveTextContent('1 of 2')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Market St' }))
    expect(screen.getByText('+ Ground Turkey, sometimes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(calls).toHaveLength(3))
    expect(JSON.parse(String(calls[2].init!.body)).stores).toEqual([{ listingId: 'market', items: [{ name: 'Ground Turkey', availability: 'sometimes', doubt: null }] }])
    // One left, the new place: no count, no Next, its own form to send it.
    expect(await screen.findByRole('button', { name: 'Find it and fill it in' })).toBeInTheDocument()
    expect(screen.queryByTestId('tell-us-count')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('goes back and forth with ‹ › and Next, and sending the last shows the one before', async () => {
    respond = (url) => (url.includes('/read') ? reading : { ok: true, filed: 1, ids: ['x'] })
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'trader joes sometimes has ground turkey' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    const count = await screen.findByTestId('tell-us-count')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(count).toHaveTextContent('2 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Previous place' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous place' }))
    expect(count).toHaveTextContent('South Square Market · 3 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Previous place' }))
    expect(count).toHaveTextContent('2 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Market St' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    // 2 of 3 sent: the one after it is 2 of 2.
    expect(await screen.findByText('Sent: Trader Joe’s')).toBeInTheDocument()
    expect(screen.getByTestId('tell-us-count')).toHaveTextContent('South Square Market · 2 of 2')
  })

  it('thanks them with what went in, and asks for an email once, for all of it', async () => {
    const two = { ...reading, proposals: [reading.proposals[0], { ...reading.proposals[0], listingId: 'market', listing: MARKET }] }
    let n = 0
    respond = (url) => (url.includes('/read') ? two : url.includes('/email') ? { ok: true, updated: 2 } : { ok: true, filed: 1, ids: [`s${++n}`] })
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'both TJs have ground beef' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    await screen.findByTestId('tell-us-card')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Sent: Trader Joe’s')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const thanks = await screen.findByTestId('tell-us-sent')
    expect(thanks).toHaveTextContent('Your 2 updates are with an admin.')
    expect(within(thanks).getAllByText('Trader Joe’s')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText(/Email me when they’re on the guide/), { target: { value: 'me@x.co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const email = calls.find((c) => c.url === '/api/message/email?community=philly')!
    expect(JSON.parse(String(email.init!.body))).toEqual({ ids: ['s1', 's2'], email: 'me@x.co' })
  })

  // Agreed Oct 5: a new place is added with the form of questions, found on
  // Google first, filled in from what was read, and labelled with it.
  it('sends a new place with the add form, from what was read, then goes back to the rest', async () => {
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'South Square Market on 22nd has challah' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    await screen.findByTestId('tell-us-count')
    fireEvent.click(screen.getByRole('button', { name: 'Previous place' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find it and fill it in' }))
    // Searched for already, and added as the grocery it was read as.
    expect(screen.getByPlaceholderText('Search by name or address…')).toHaveValue('South Square Market, 22nd & South')
    fireEvent.click(screen.getByRole('button', { name: 'Not on Google? Fill it in yourself' }))
    expect(screen.getByRole('dialog', { name: 'Add a Grocery' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name *')).toHaveValue('South Square Market')
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'South Square Market & Deli' } })
    fireEvent.submit(screen.getByLabelText('Name *').closest('form')!)

    // Back to the rest, that one out of the count.
    expect(await screen.findByText('Sent: South Square Market')).toBeInTheDocument()
    expect(screen.getByTestId('tell-us-count')).toHaveTextContent('of 2')
    const sent = calls.find((c) => c.url === '/api/message/send?community=philly')!
    const body = JSON.parse(String(sent.init!.body))
    expect(body).toMatchObject({ text: 'South Square Market on 22nd has challah', photoUrls: reading.photoUrls })
    expect(body.forms[0].submission).toMatchObject({ category: 'grocery', name: 'South Square Market & Deli', address: '22nd & South', details: { m: ['Challah'] } })
  })

  // Oct 5: the hechsher and the hours came back "not a change" before the
  // box read any field.
  it('shows a change to other fields with what it was, and asks “every Wednesday?” before sending hours', async () => {
    const SAY = { id: 'say', name: 'Say She Ate', address: '1408 South St, Philadelphia', category: 'restaurant', categoryLabel: 'Food' }
    const week = { wed: { open: '11:00', close: '21:00' } }
    respond = (url) =>
      url.includes('/read')
        ? {
            ok: true,
            photoUrls: [],
            proposals: [
              {
                kind: 'fields',
                listingId: 'say',
                listing: SAY,
                asWritten: 'say she ate',
                ask: null,
                values: { kosherCert: 'Keystone-K', hours: { wed: { open: '11:00', close: '15:00' } } },
                before: { kosherCert: 'IKC', hours: week },
                lines: [],
                held: [],
                notes: [],
                askWhen: { key: 'hours', question: 'Every Wednesday, or just this one?', oneDay: 'Hours, Wednesday, one day only: closes 3:00 PM.' },
              },
            ],
          }
        : { ok: true, filed: 1 }
    renderWithProviders(<TellUsSheet isOpen onClose={() => {}} />, {
      community: { slug: 'philly' },
      content: {
        categories: [
          makeCategory({
            id: 'restaurant',
            label: 'Food',
            detailFields: [
              { key: 'hours', label: 'Hours', type: 'hours' },
              { key: 'kosherCert', label: 'Kosher Certification', type: 'select', options: [{ value: 'IKC', label: 'IKC' }, { value: 'Keystone-K', label: 'Keystone-K' }] },
            ],
          }),
        ],
      },
    })
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'Say She Ate is Keystone K now and closes at 3 on Wednesday' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    const card = await screen.findByTestId('tell-us-card')
    expect(within(card).getByText('Kosher Certification: IKC → Keystone-K')).toBeInTheDocument()
    expect(within(card).getByText('Hours, Wednesday: 11:00 AM–9:00 PM → 11:00 AM–3:00 PM')).toBeInTheDocument()
    expect(within(card).getByText('Was: IKC')).toBeInTheDocument()
    // Not until it's answered.
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    fireEvent.click(within(card).getByRole('button', { name: 'Just this once' }))
    expect(within(card).queryByText(/Hours, Wednesday: 11:00/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByTestId('tell-us-sent')
    expect(JSON.parse(String(calls[1].init!.body)).edits).toEqual([{ listingId: 'say', values: { kosherCert: 'Keystone-K' }, notes: ['Hours, Wednesday, one day only: closes 3:00 PM.'] }])
  })

  it('says when it isn’t a change to the guide, pointing to Feedback, with nothing to send', async () => {
    respond = (url) => (url.includes('/read') ? { ok: true, photoUrls: [], proposals: [{ kind: 'not_update', note: 'A question' }] } : {})
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'Where can I get marshmallows?' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    expect(await screen.findByText('This doesn’t look like a change to the guide.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send it as feedback' })).toHaveAttribute('href', '/philly/feedback')
    expect(screen.queryByRole('button', { name: /^Send/ })).not.toBeInTheDocument()
  })

  // Agreed Oct 5: one search for adding and editing, inside the box, with
  // Back at every step.
  describe('Find the place', () => {
    const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
    const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue' })
    const tj = makeListing({ id: 'tj', name: 'Trader Joe’s', category: 'grocery', address: '1324 Arch St, Philadelphia' })
    const find = (props: Partial<Parameters<typeof TellUsSheet>[0]> = {}) => {
      respond = (url) => (url.includes('/api/resources') ? { ok: true, resources: [tj] } : {})
      renderWithProviders(<TellUsSheet isOpen onClose={() => {}} {...props} />, { community: { slug: 'philly' }, content: { categories: [grocery, shuls] } })
      fireEvent.click(screen.getByRole('button', { name: 'Find the place' }))
    }

    it('finds a place the guide has and opens its edit, with Back to the search and back to the box', async () => {
      find()
      expect(screen.getByRole('dialog', { name: 'Find the place' })).toBeInTheDocument()
      fireEvent.change(screen.getByPlaceholderText('Search by name or address…'), { target: { value: 'trader j' } })
      fireEvent.click(await screen.findByRole('button', { name: /Trader Joe’s/ }))
      expect(screen.getByRole('dialog', { name: 'Trader Joe’s' })).toBeInTheDocument()
      expect(screen.getByText('Suggest an edit')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '‹ Back' }))
      expect(screen.getByTestId('find-place')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '‹ Back' }))
      expect(screen.getByLabelText('What did you see?')).toBeInTheDocument()
      expect(calls.filter((c) => c.url.includes('/api/resources'))).toHaveLength(1)
    })

    it('adds a place as the form of questions, every section open, asking the kind only when it isn’t known', () => {
      find()
      fireEvent.click(screen.getByRole('button', { name: 'Not on Google? Fill it in yourself' }))
      expect(screen.getByTestId('pick-kind')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Synagogue' }))
      expect(screen.getByRole('dialog', { name: 'Add a Synagogue' })).toBeInTheDocument()
      expect(screen.getByLabelText('Name *')).toBeInTheDocument()
      cleanup()
      find({ category: grocery })
      fireEvent.click(screen.getByRole('button', { name: 'Not on Google? Fill it in yourself' }))
      expect(screen.getByRole('dialog', { name: 'Add a Grocery' })).toBeInTheDocument()
    })

    it('isn’t offered over a listing, where it’s that listing’s edit', () => {
      open({ about: { id: 'tj', name: 'Trader Joe’s' }, onEditYourself: () => {} })
      expect(screen.queryByRole('button', { name: 'Find the place' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit the details myself' })).toBeInTheDocument()
    })
  })

  it('shows the reader’s refusal, and stays on what they wrote', async () => {
    respond = () => ({ ok: false, error: 'Write or paste what you saw, or add a photo.' })
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'hey' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Write or paste what you saw')
    expect(screen.getByLabelText('What did you see?')).toHaveValue('hey')
  })
})

describe('showsSiteAdd', () => {
  it('shows on every screen but the Map, a category or listing, and the site’s own pages', () => {
    const cats = ['grocery', 'synagogue']
    expect(['/philly', '/philly/browse', '/philly/pinned', '/philly/changes', '/philly/ask'].map((p) => showsSiteAdd(p, 'philly', cats))).toEqual([true, true, true, true, true])
    expect(['/philly/map', '/philly/grocery', '/philly/grocery/abc', '/philly/feedback', '/philly/about', '/philly/privacy', '/ues', '/admin'].map((p) => showsSiteAdd(p, 'philly', cats))).toEqual(
      Array(8).fill(false),
    )
  })
})
