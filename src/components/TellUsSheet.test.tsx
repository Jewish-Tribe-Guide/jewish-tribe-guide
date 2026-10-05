// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { showsSiteAdd } from './SiteAddButton'
import TellUsSheet from './TellUsSheet'

vi.mock('@/components/resources/useListingSubmit', () => ({ TURNSTILE_ACTIVE: false }))
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
    { kind: 'new_place', category: 'grocery', categoryLabel: 'Grocery', place: { name: 'South Square Market', kind: null, address: '22nd & South', phone: null, website: null, kosherCert: null, meatDairy: null, notes: null }, items: [{ name: 'Challah', availability: 'always', doubt: null }], maybe: [], quote: 'x', checked: true, note: null },
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

  it('asks which store, sends what they picked, leaves out what they took off, and thanks them', async () => {
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'trader joes sometimes has ground turkey' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    const cards = await screen.findAllByTestId('tell-us-card')
    // Until a store is picked, only two of the three can go.
    expect(screen.getByRole('button', { name: 'Send 2 updates' })).toBeInTheDocument()
    fireEvent.click(within(cards[1]).getByRole('button', { name: 'Market St' }))
    expect(within(cards[1]).getByText('+ Ground Turkey, sometimes')).toBeInTheDocument()
    fireEvent.click(within(cards[2]).getByRole('button', { name: 'Leave this out' }))
    fireEvent.change(screen.getByLabelText(/Email, to hear when it’s live/), { target: { value: 'me@x.co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send 2 updates' }))

    await screen.findByTestId('tell-us-sent')
    const body = JSON.parse(String(calls[1].init!.body))
    expect(calls[1].url).toBe('/api/message/send?community=philly')
    expect(body).toMatchObject({
      text: 'trader joes sometimes has ground turkey',
      photoUrls: reading.photoUrls,
      stores: [{ listingId: 'arch', items: [ground] }, { listingId: 'market', items: [{ name: 'Ground Turkey', availability: 'sometimes', doubt: null }] }],
      places: [],
      email: 'me@x.co',
    })
  })

  it('sends a new place with the fixes they made to it', async () => {
    open()
    fireEvent.change(screen.getByLabelText('What did you see?'), { target: { value: 'South Square Market has challah' } })
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }))
    const cards = await screen.findAllByTestId('tell-us-card')
    fireEvent.change(within(cards[2]).getByLabelText('Address'), { target: { value: '2201 South St' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send 2 updates' }))
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(JSON.parse(String(calls[1].init!.body)).places).toEqual([
      { category: 'grocery', place: expect.objectContaining({ name: 'South Square Market', address: '2201 South St' }), items: [{ name: 'Challah', availability: 'always', doubt: null }] },
    ])
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

  it('keeps filling it in yourself one small link away', () => {
    const onAddYourself = vi.fn()
    open({ onAddYourself })
    fireEvent.click(screen.getByRole('button', { name: 'Add a place' }))
    expect(onAddYourself).toHaveBeenCalled()
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
