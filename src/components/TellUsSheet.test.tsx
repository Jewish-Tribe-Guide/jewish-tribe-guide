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
    { kind: 'items', listingId: 'arch', listing: ARCH, asWritten: 'Trader Joe’s on Arch', chain: false, ask: null, items: [ground], lines: ['+ Hamburger Meat'], held: ['Chicken: already listed'], current: { always: ['Chicken', 'Challah'], sometimes: [] }, quote: 'x', checked: true },
    {
      kind: 'items',
      listingId: null,
      listing: null,
      asWritten: 'trader joes',
      chain: false,
      ask: {
        question: 'Which Trader Joe’s?',
        choices: [
          { label: 'Arch St', listingId: 'arch', listing: ARCH, lines: ['+ Ground Turkey, sometimes'], held: [], current: { always: ['Chicken'], sometimes: [] } },
          { label: 'Market St', listingId: 'market', listing: MARKET, lines: ['+ Ground Turkey, sometimes'], held: [], current: { always: ['Chicken'], sometimes: [] } },
        ],
      },
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
      content: { categories: [makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Groceries', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })] },
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
    // As the listing shows it: the new item marked, what's there folded.
    const items = within(cards[0]).getByTestId('tell-us-items')
    expect(within(items).getByText('Hamburger Meat')).toBeInTheDocument()
    expect(within(items).getByText('New · seen today')).toBeInTheDocument()
    expect(within(items).getByText('Not changed: Chicken: already listed')).toBeInTheDocument()
    expect(items).toHaveTextContent('Already listed · 2 Chicken, Challah')
    expect(screen.getByText(/Read by AI from what you sent/)).toBeInTheDocument()
  })

  // Oct 5: Back was text at the bottom ("‹ Change what I wrote", "‹ Back"),
  // under whatever the step showed. Now it's the header's chevron, before
  // the title, the same as a listing's own edit.
  it('goes back from what it read to what was written with the header’s chevron', async () => {
    open()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'TJ on Arch always has ground beef' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    await screen.findAllByTestId('tell-us-card')
    expect(screen.queryByRole('button', { name: /Change what I wrote/ })).not.toBeInTheDocument()
    const back = screen.getByRole('button', { name: 'Back' })
    expect(screen.getByRole('heading', { name: 'Saw something? Tell us' }).parentElement).toContainElement(back)
    fireEvent.click(back)
    expect(screen.getByLabelText('What did you see?')).toHaveValue('TJ on Arch always has ground beef')
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
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
    fireEvent.drop(box, { dataTransfer: { types: ['Files'], files: [png('a.png'), new File(['x'], 'notes.txt', { type: 'text/plain' }), png('b.png'), png('c.png')] } })
    expect(screen.queryByTestId('tell-us-drop')).not.toBeInTheDocument()
    expect(screen.getAllByAltText(/^Photo \d$/)).toHaveLength(3)
    // Pasting text is still just typing.
    fireEvent.paste(box, { clipboardData: { files: [] } })
    expect(screen.getAllByAltText(/^Photo \d$/)).toHaveLength(3)
  })

  // Oct 6: opened from a shul's “Update their times”, it's named for that.
  it('takes its first step’s title from what opened it', () => {
    open({ about: { id: 'mekor', name: 'Mekor Habracha' }, heading: 'Update Mekor Habracha’s times' })
    expect(screen.getByRole('heading', { name: 'Update Mekor Habracha’s times' })).toBeInTheDocument()
  })

  // Oct 6: a PDF too (a shul's flyer), shown as a file, not a picture.
  it('takes a PDF, shown by its name', () => {
    open()
    fireEvent.change(screen.getByLabelText('Add a photo'), { target: { files: [new File(['x'], 'mekor-shabbos.pdf', { type: 'application/pdf' })] } })
    expect(screen.getByTitle('mekor-shabbos.pdf')).toHaveTextContent('PDF')
    expect(screen.queryByAltText('Photo 1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See what changes' })).toBeEnabled()
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
    expect(screen.getByText('Ground Turkey')).toBeInTheDocument()
    expect(screen.getByText(/Not always in stock/)).toBeInTheDocument()
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

  // Agreed Oct 5: once in, one tap to add more by hand. The items are the
  // listing's own section: Remove, "Not always in stock", "+ Add another
  // item" with the guide's names; the rest of the listing one tap away.
  it('lets them fix the items, add another, and open the rest of the listing, sending what they left', async () => {
    const one = { ...reading, proposals: [reading.proposals[0]] }
    respond = (url) => (url.includes('/read') ? one : url.includes('/api/resources') ? { ok: true, resources: [makeListing({ id: 'arch', name: 'Trader Joe’s', category: 'grocery' })] } : { ok: true, filed: 1, ids: ['s1'] })
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'TJ on Arch has ground beef' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    const items = await screen.findByTestId('tell-us-items')
    fireEvent.click(within(items).getByRole('button', { name: 'Change how often Hamburger Meat is in stock' }))
    expect(items).toHaveTextContent('Not always in stock')
    fireEvent.click(within(items).getByRole('button', { name: 'Add another item' }))
    fireEvent.change(screen.getByLabelText('What else did you see?'), { target: { value: 'croutons' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add “croutons” as typed' }))
    expect(within(items).getByText('Croutons')).toBeInTheDocument()
    // Something it already lists is marked, not added again.
    fireEvent.click(within(items).getByRole('button', { name: 'Add another item' }))
    fireEvent.change(screen.getByLabelText('What else did you see?'), { target: { value: 'chall' } })
    expect(screen.getByRole('button', { name: /Challah\s*Already listed here/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Change something else about Trader Joe’s ›' }))
    expect(await screen.findByText('Suggest an edit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByTestId('tell-us-items')).toHaveTextContent('Croutons')

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByTestId('tell-us-sent')
    const sent = calls.find((c) => c.url === '/api/message/send?community=philly')!
    expect(JSON.parse(String(sent.init!.body)).stores).toEqual([
      { listingId: 'arch', items: [{ name: 'Hamburger Meat', availability: 'sometimes', doubt: null }, { name: 'Croutons', availability: 'always', doubt: null }] },
    ])
  })

  // Said Oct 5: several changes to one place stay in one card. "Croutons,
  // and they close at 3 on Wednesdays now" is read as two proposals for the
  // same Trader Joe's; it's one place to check, and one Send.
  it('keeps a store’s items and its hours in one card, sent together', async () => {
    const hours = {
      kind: 'fields',
      listingId: 'arch',
      listing: ARCH,
      asWritten: 'Trader Joe’s on arch',
      ask: null,
      values: { hours: { wed: { open: '09:00', close: '15:00' } } },
      before: { hours: { wed: { open: '09:00', close: '21:00' } } },
      lines: [],
      held: [],
      notes: [],
      askWhen: null,
    }
    respond = (url) => (url.includes('/read') ? { ...reading, proposals: [reading.proposals[0], hours] } : { ok: true, filed: 2, ids: ['a', 'b'] })
    renderWithProviders(<TellUsSheet isOpen onClose={() => {}} />, {
      community: { slug: 'philly' },
      content: { categories: [makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Groceries', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }, { key: 'hours', label: 'Hours', type: 'hours' }] })] },
    })
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'TJ on Arch has croutons, and closes at 3 on Wednesdays now' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    await screen.findByTestId('tell-us-items')
    expect(screen.queryByTestId('tell-us-count')).not.toBeInTheDocument()
    expect(screen.getByTestId('tell-us-week')).toBeInTheDocument()
    expect(screen.getAllByText('Trader Joe’s')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Change something else/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByTestId('tell-us-sent')
    const body = JSON.parse(String(calls.find((c) => c.url.includes('/send'))!.init!.body))
    expect(body.stores).toEqual([{ listingId: 'arch', items: [ground] }])
    expect(body.edits).toEqual([{ listingId: 'arch', values: { hours: { wed: { open: '09:00', close: '15:00' } } }, notes: [] }])
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
    expect(screen.getByRole('dialog', { name: 'Add to Groceries' })).toBeInTheDocument()
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
    // The week as the listing shows it, Wednesday marked, what it was struck.
    const shownWeek = within(card).getByTestId('tell-us-week')
    expect(within(shownWeek).getByText('Wednesday').parentElement).toHaveTextContent('Wednesday11:00 AM–9:00 PM11:00 AM–3:00 PM')
    expect(within(shownWeek).getByText('11:00 AM–9:00 PM')).toHaveClass('line-through')
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

  // Oct 6: a Food place's menu, as a link or photos, comes back as its main
  // dishes, said as dishes, with where they were read; Send says so.
  it('shows dishes read off a menu as the place’s main dishes, with the menu, and sends where they came from', async () => {
    const SAY = { id: 'say', name: 'Say She Ate', address: '1408 South St, Philadelphia', category: 'restaurant', categoryLabel: 'Food' }
    const dishes = [{ name: 'Dosas', availability: 'always', doubt: null }, { name: 'Kofta Bowl', availability: 'always', doubt: null }]
    respond = (url) =>
      url.includes('/read')
        ? {
            ok: true,
            photoUrls: [],
            proposals: [
              { kind: 'items', listingId: 'say', listing: SAY, asWritten: 'say she ate', chain: false, ask: null, items: dishes, lines: ['+ Dosas', '+ Kofta Bowl'], held: [], current: { always: ['Salads'], sometimes: [] }, dishes: true, quote: 'x', checked: true, menu: { url: 'https://saysheate.co/menu/', dishes: [] } },
              { kind: 'menu', listing: { ...SAY, id: 'tj', name: 'Taffets' }, asWritten: 'taffets', failed: 'Menus on delivery apps can’t be read from a link. Send a screenshot of the menu instead.' },
            ],
          }
        : { ok: true, filed: 1, ids: ['s1'] }
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'here’s say she ate’s main dishes https://saysheate.co/menu/' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    const items = await screen.findByTestId('tell-us-items')
    expect(items).toHaveTextContent('Main dishes here · 3')
    expect(within(items).getAllByText('New · on its menu')).toHaveLength(2)
    expect(items).toHaveTextContent('Always on the menu')
    expect(within(items).getByRole('button', { name: 'Add another dish' })).toBeInTheDocument()
    expect(screen.getByTestId('tell-us-menu')).toHaveTextContent('Read from its menu ↗. Main dishes only, not the whole menu.')
    expect(within(screen.getByTestId('tell-us-menu')).getByRole('link')).toHaveAttribute('href', 'https://saysheate.co/menu/')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    // Then the next place: the menu it couldn't read, and why.
    expect(await screen.findByText('Couldn’t read the menu.')).toBeInTheDocument()
    expect(screen.getByText(/Send a screenshot of the menu instead/)).toBeInTheDocument()
    const sent = calls.find((c) => c.url === '/api/message/send?community=philly')!
    expect(JSON.parse(String(sent.init!.body)).stores).toEqual([{ listingId: 'say', items: dishes, menu: { url: 'https://saysheate.co/menu/' } }])
  })

  // Oct 5: a guess about other stores read as "ask others", which showed
  // nothing at all.
  it('says nothing changes when it only read a guess about another store, with nothing to send', async () => {
    respond = (url) =>
      url.includes('/read') ? { ok: true, photoUrls: [], proposals: [{ kind: 'ask_others', listingId: 'arch', listing: ARCH, question: 'Has anyone seen it at Trader Joe’s on Arch?', quote: 'x', checked: true }] } : {}
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'I’d be surprised if the TJ on Arch has it' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    const card = await screen.findByTestId('tell-us-card')
    expect(card).toHaveTextContent('Nothing in the guide changes from this.')
    expect(card).toHaveTextContent('It sounds like a guess about Trader Joe’s, not something seen there. If you’ve seen it yourself, go back and say where.')
    expect(screen.queryByRole('button', { name: /^Send/ })).not.toBeInTheDocument()
  })

  // Agreed Oct 5: one search for adding and editing, inside the box, with
  // Back at every step.
  describe('Find the place', () => {
    const grocery = makeCategory({ id: 'grocery', label: 'Grocery', pluralLabel: 'Groceries', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
    const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues' })
    const tj = makeListing({ id: 'tj', name: 'Trader Joe’s', category: 'grocery', address: '1324 Arch St, Philadelphia' })
    const find = (props: Partial<Parameters<typeof TellUsSheet>[0]> = {}) => {
      respond = (url) => (url.includes('/api/resources') ? { ok: true, resources: [tj] } : {})
      renderWithProviders(<TellUsSheet isOpen onClose={() => {}} {...props} />, { community: { slug: 'philly' }, content: { categories: [grocery, shuls] } })
      fireEvent.click(screen.getByRole('button', { name: 'Find the place' }))
    }

    it('finds a place the guide has and opens its edit, with Back to the search and back to the box', async () => {
      find()
      expect(screen.getByRole('dialog', { name: 'Find the place' })).toBeInTheDocument()
      // The title says it once; the field says what to type (Oct 5).
      expect(screen.getByLabelText('Name or address')).toBeInTheDocument()
      expect(screen.getAllByText('Find the place')).toHaveLength(1)
      fireEvent.change(screen.getByPlaceholderText('Search by name or address…'), { target: { value: 'trader j' } })
      fireEvent.click(await screen.findByRole('button', { name: /Trader Joe’s/ }))
      expect(screen.getByRole('dialog', { name: 'Trader Joe’s' })).toBeInTheDocument()
      expect(screen.getByText('Suggest an edit')).toBeInTheDocument()
      // The chevron before the title, in the header.
      expect(screen.getByRole('heading', { name: 'Trader Joe’s' }).parentElement).toContainElement(screen.getByRole('button', { name: 'Back' }))
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(screen.getByTestId('find-place')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(screen.getByLabelText('What did you see?')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
      expect(calls.filter((c) => c.url.includes('/api/resources'))).toHaveLength(1)
    })

    it('adds a place as the form of questions, every section open, asking the kind only when it isn’t known', () => {
      find()
      fireEvent.click(screen.getByRole('button', { name: 'Not on Google? Fill it in yourself' }))
      expect(screen.getByTestId('pick-kind')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Synagogue' }))
      expect(screen.getByRole('dialog', { name: 'Add to Synagogues' })).toBeInTheDocument()
      expect(screen.getByLabelText('Name *')).toBeInTheDocument()
      cleanup()
      find({ category: grocery })
      fireEvent.click(screen.getByRole('button', { name: 'Not on Google? Fill it in yourself' }))
      expect(screen.getByRole('dialog', { name: 'Add to Groceries' })).toBeInTheDocument()
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
