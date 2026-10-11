// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeListing } from '@/test/providerFixtures'
import { FOOD, HOSPITAL, MIKVAH, SHUL } from '@/test/editorFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { PreviewSendProvider } from '@/lib/previewSend'
import ListingEditor, { type EditorStep } from './ListingEditor'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The real AddressInput loads the Google Maps SDK. This one types, and has
// a button standing in for picking a Google suggestion.
vi.mock('@/components/intake/AddressInput', () => ({
  default: ({ value, onChange, onPlaceSelect }: { value: string; onChange: (v: string) => void; onPlaceSelect?: (r: unknown) => void }) => (
    <>
      <input aria-label="Address" value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        onClick={() => {
          onChange('400 Arch St, Philadelphia, PA')
          onPlaceSelect?.({ placeId: 'p2', name: 'Sweet Box Bakery & Cafe', hours: { mon: { open: '08:00', close: '20:00' } }, businessStatus: 'OPERATIONAL' })
        }}
      >
        Pick from Google
      </button>
    </>
  ),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const nine = { open: '09:00', close: '19:00' }
const bakery = makeListing({
  id: 'sweet-box',
  category: 'restaurant',
  name: 'Sweet Box Bakery',
  address: '339 S 13th St, Philadelphia, PA',
  phone: '(267) 975-1711',
  website: 'https://shopsweetbox.com',
  hours: { sun: nine, mon: nine, tue: nine, wed: nine, thu: nine, fri: nine, sat: nine },
  s: 'Dessert Shop',
  foodType: 'Bakery',
  kosherCert: 'IKC',
  googleDescription: 'Quaint, cheery bakery.',
  dishes: ['Cupcakes', 'Cookies', 'Brownies'],
})

const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })

function renderEditor(props: Partial<Parameters<typeof ListingEditor>[0]> = {}) {
  const onClose = vi.fn()
  const steps: (EditorStep | null)[] = []
  const onStep = (s: EditorStep | null) => steps.push(s)
  const view = renderWithProviders(<ListingEditor item={bakery} category={FOOD} onClose={onClose} onStep={onStep} {...props} />)
  return { ...view, onClose, step: () => steps.at(-1) ?? null }
}

const row = (id: string) => screen.getByTestId(`editor-row-${id}`)
const sendButton = () => screen.getByRole('button', { name: /^(Send \d+ changes?|No changes yet|Send)$/ })
const done = () => screen.getByRole('button', { name: 'Done' })

describe('ListingEditor — the listing’s boxes, one row each', () => {
  it('lists the boxes in the listing’s order, each saying what it says now; nothing else before Send', () => {
    renderEditor()
    const list = screen.getByTestId('editor-list')
    const titles = within(list)
      .getAllByRole('button')
      .filter((b) => b.dataset.testid?.startsWith('editor-row-'))
      .map((b) => b.dataset.testid)
    expect(titles).toEqual(['editor-row-name', 'editor-row-kind', 'editor-row-facts', 'editor-row-items', 'editor-row-contact', 'editor-row-hours', 'editor-row-about'])
    expect(row('name')).toHaveTextContent('Sweet Box Bakery')
    expect(row('name')).toHaveTextContent('Dessert Shop')
    expect(row('facts')).toHaveTextContent('IKC · Everything here is kosher')
    expect(row('items')).toHaveTextContent('3 · Cupcakes, Cookies, Brownies')
    expect(row('hours')).toHaveTextContent('Sun–Sat 9 AM–7 PM')
    // One task: no email box, no removal link, no review line.
    expect(screen.queryByText(/Your email/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Request removal/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Reviewed by a moderator/)).not.toBeInTheDocument()
    expect(sendButton()).toHaveTextContent('No changes yet')
    expect(sendButton()).toBeDisabled()
  })

  it('makes each row its own white card; what isn’t there yet stays plain lines', () => {
    // Adding: some rows filled (Needed), the rest not on the listing yet.
    renderEditor({ item: undefined })
    expect(row('name')).toHaveClass('bg-white', 'border', 'rounded-2xl')
    expect(row('name').closest('ul')).not.toHaveClass('bg-white')
    const empty = screen.getByTestId('editor-empty')
    expect(within(empty).getByRole('list')).not.toHaveClass('bg-white')
    expect(within(empty).getAllByRole('button')[0]).not.toHaveClass('bg-white')
  })

  it('puts what the listing doesn’t show yet under “Not on the listing yet”, one line each', async () => {
    const u = user()
    renderWithProviders(<ListingEditor item={{ ...bakery, googleDescription: undefined }} category={FOOD} onClose={() => {}} />)
    const empty = screen.getByTestId('editor-empty')
    expect(within(empty).getByText('Not on the listing yet')).toBeInTheDocument()
    await u.click(within(empty).getByRole('button', { name: 'About' }))
    expect(screen.getByTestId('editor-open-about')).toBeInTheDocument()
  })

  // Agreed Oct 11 (canvas page "editorlook"): a few inputs open where the
  // row is; a list of its own opens on its own screen.
  it('opens a short row where it is, the rows around it staying; Done, its heading or Back closes it', async () => {
    const u = user()
    const { step } = renderEditor()
    await u.click(row('facts'))
    const facts = screen.getByTestId('editor-open-facts')
    expect(within(facts).getByRole('button', { name: 'Dairy' })).toBeInTheDocument()
    expect(screen.getByTestId('editor-list')).toContainElement(facts)
    expect(row('name')).toBeInTheDocument()
    expect(row('about')).toBeInTheDocument()
    // The host's header keeps its title; its Back closes the row.
    expect(step()).not.toBeNull()
    expect(step()?.title).toBeUndefined()
    await u.click(done())
    expect(screen.queryByTestId('editor-open-facts')).not.toBeInTheDocument()
    expect(step()).toBeNull()

    // One at a time.
    await u.click(row('facts'))
    await u.click(row('about'))
    expect(screen.getByTestId('editor-open-about')).toBeInTheDocument()
    expect(screen.queryByTestId('editor-open-facts')).not.toBeInTheDocument()
    await u.click(within(screen.getByTestId('editor-open-about')).getByRole('button', { name: /About/, expanded: true }))
    expect(screen.queryByTestId('editor-open-about')).not.toBeInTheDocument()

    await u.click(row('name'))
    step()!.back()
    await waitFor(() => expect(screen.queryByTestId('editor-open-name')).not.toBeInTheDocument())
  })

  it('opens a week of hours where it is too', async () => {
    const u = user()
    const { step } = renderEditor()
    await u.click(row('hours'))
    expect(screen.getByTestId('editor-list')).toContainElement(screen.getByTestId('editor-open-hours'))
    expect(step()?.title).toBeUndefined()
  })

  // The user, Oct 11: "Hours" said twice, the card's title and the field's
  // label under it. A row of one field says it once; screen readers still
  // get the field's name.
  it('says a one-field row’s name once, in its title', async () => {
    const u = user()
    renderEditor()
    const shown = (card: HTMLElement, text: string) => within(card).getAllByText(text).filter((el) => !el.closest('.sr-only'))
    await u.click(row('hours'))
    expect(shown(screen.getByTestId('editor-open-hours'), 'Hours')).toHaveLength(1)
    expect(within(screen.getByTestId('editor-open-hours')).getByText('Hours', { selector: '.sr-only' })).toBeInTheDocument()
    await u.click(row('kind'))
    const kind = screen.getByTestId('editor-open-kind')
    expect(shown(kind, 'Store Type')).toHaveLength(1)
    expect(within(kind).getByRole('group', { name: 'Store Type' })).toBeInTheDocument()
    // Several fields: each keeps its label.
    await u.click(row('facts'))
    expect(shown(screen.getByTestId('editor-open-facts'), 'Food Type')).toHaveLength(1)
  })

  it('opens a row holding a list on its own screen, its title for the host’s header, and nothing else above it', async () => {
    const u = user()
    const { step } = renderEditor()
    await u.click(row('items'))
    expect(screen.queryByTestId('editor-list')).not.toBeInTheDocument()
    expect(step()?.title).toBe('Main dishes')
    // The header says which box; the listing's own name isn't repeated.
    expect(within(screen.getByTestId('editor-open-items')).queryByText('Sweet Box Bakery')).not.toBeInTheDocument()
    step()!.back()
    expect(await screen.findByTestId('editor-list')).toBeInTheDocument()

    await u.click(row('items'))
    await u.click(done())
    expect(screen.getByTestId('editor-list')).toBeInTheDocument()
  })
})

describe('ListingEditor — what’s changed', () => {
  it('marks the row Changed and counts it on Send; putting it back by hand unmarks it', async () => {
    const u = user()
    renderEditor()
    await u.click(row('facts'))
    const facts = screen.getByTestId('editor-open-facts')
    await u.click(within(facts).getByRole('button', { name: 'Dairy' }))
    expect(within(facts).getByRole('button', { name: 'Dairy' })).toHaveAttribute('aria-pressed', 'true')
    await u.click(done())
    expect(row('facts')).toHaveTextContent('Changed')
    expect(row('facts')).toHaveTextContent('Dairy · IKC')
    expect(sendButton()).toHaveTextContent(/^(Send 1 change|Verifying…)$/)

    await u.click(row('facts'))
    await u.click(within(screen.getByTestId('editor-open-facts')).getByRole('button', { name: 'Dairy' }))
    await u.click(done())
    expect(row('facts')).not.toHaveTextContent('Changed')
    expect(sendButton()).toHaveTextContent('No changes yet')
  })

  it('a hechsher’s caveat: No asks what isn’t kosher, and the row says so', async () => {
    const u = user()
    renderEditor()
    await u.click(row('facts'))
    expect(screen.queryByLabelText('What isn’t kosher?')).not.toBeInTheDocument()
    const question = screen.getByRole('group', { name: 'Everything here is kosher' })
    await u.click(within(question).getByRole('button', { name: 'No' }))
    await u.type(screen.getByLabelText('What isn’t kosher?'), 'The meat counter')
    await u.click(done())
    expect(row('facts')).toHaveTextContent('Everything here is kosher: No · The meat counter')
  })

  // The user, Oct 11: an address picked from Google fills in the name and
  // hours too. Every row it changed comes back marked, not only the one
  // that was opened.
  it('an address picked from Google marks the name and hours rows as well', async () => {
    const u = user()
    renderEditor()
    await u.click(row('contact'))
    await u.click(screen.getByRole('button', { name: 'Pick from Google' }))
    await u.click(done())
    expect(row('name')).toHaveTextContent('Changed')
    expect(row('contact')).toHaveTextContent('Changed')
    expect(row('hours')).toHaveTextContent('Changed')
    expect(row('facts')).not.toHaveTextContent('Changed')
    expect(sendButton()).toHaveTextContent(/^(Send 3 changes|Verifying…)$/)
  })
})

describe('ListingEditor — dishes and items', () => {
  it('this place’s dishes only; tap one for Always, Not always or Remove; a removed one keeps Keep', async () => {
    const u = user()
    renderEditor()
    await u.click(row('items'))
    const editor = screen.getByTestId('items-editor')
    expect(within(editor).queryByText(/always in stock/i)).not.toBeInTheDocument()
    await u.click(within(editor).getByRole('button', { name: 'Cookies' }))
    await u.click(within(screen.getByRole('group', { name: 'Cookies' })).getByRole('button', { name: 'Remove' }))
    expect(within(editor).getByText('Cookies')).toHaveClass('line-through')
    await u.click(within(editor).getByRole('button', { name: 'Brownies' }))
    await u.click(within(screen.getByRole('group', { name: 'Brownies' })).getByRole('button', { name: 'Not always' }))
    expect(within(editor).getByText('Not always on the menu')).toBeInTheDocument()
    await u.type(within(editor).getByLabelText('Add a dish'), 'Babka{Enter}')
    await u.click(done())
    expect(row('items')).toHaveTextContent('Changed')
    expect(row('items')).toHaveTextContent('3 · Cupcakes, Babka, Brownies')
  })
})

describe('ListingEditor — sending', () => {
  it('sends the edit, then says it’s sent; Done leaves', async () => {
    const u = user()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const { onClose } = renderEditor()
    await u.click(row('contact'))
    const phone = screen.getByLabelText('Phone')
    await u.clear(phone)
    await u.type(phone, '2676066613')
    await u.click(done())
    await u.click(sendButton())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.operation).toBe('update')
    expect(body.targetId).toBe('sweet-box')
    expect(body.payload.phone).toBe('(267) 606-6613')
    expect(body.payload.details.dishes).toEqual(['Cupcakes', 'Cookies', 'Brownies'])

    expect(await screen.findByTestId('editor-sent')).toHaveTextContent('An admin checks it, usually within a day.')
    await u.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('puts the foot’s button in the host’s slot: Send on the list, Done on a row’s own screen', async () => {
    const u = user()
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    renderEditor({ sendSlot: slot })
    expect(within(slot).getByRole('button', { name: 'No changes yet' })).toBeInTheDocument()
    // A row open in place keeps its Done in its card; Send stays below.
    await u.click(row('about'))
    expect(within(screen.getByTestId('editor-open-about')).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(within(slot).getByRole('button', { name: 'No changes yet' })).toBeInTheDocument()
    await u.click(row('items'))
    expect(within(slot).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    slot.remove()
  })

  it('Request removal, opened by the host, is its own screen with nothing of the edit beside it', () => {
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    renderEditor({ removalOpen: true, onRemovalOpenChange: () => {}, sendSlot: slot })
    expect(screen.getByTestId('editor-list').parentElement).toHaveClass('hidden')
    expect(within(slot).queryByRole('button', { name: 'No changes yet' })).not.toBeInTheDocument()
    expect(within(slot).getByRole('button', { name: /^(Confirm removal request|Verifying…)$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    slot.remove()
  })
})

describe('ListingEditor — boxes with their own editors', () => {
  it('a shul’s usual times open the same list as the box’s own Edit', async () => {
    const u = user()
    const shul = makeListing({ id: 'mi', category: 'synagogue', name: 'Mikveh Israel', minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }] })
    renderWithProviders(<ListingEditor item={shul} category={SHUL} onClose={() => {}} />)
    expect(row('minyans:shabbos')).toHaveTextContent('Shacharis 9 AM')
    expect(within(screen.getByTestId('editor-empty')).getByRole('button', { name: 'Usual weekday times' })).toBeInTheDocument()
    await u.click(row('minyans:shabbos'))
    expect(screen.getByTestId('minyan-box-list')).toBeInTheDocument()
  })

  it('a mikvah’s section: its hours and note, and a phone only once someone adds one', async () => {
    const u = user()
    const mikvah = makeListing({ id: 'lm', category: 'mikvah', name: 'Lower Merion Mikvah', womenTevillah: true, women_s_notes: 'By appointment' })
    renderWithProviders(<ListingEditor item={mikvah} category={MIKVAH} onClose={() => {}} />)
    await u.click(row('audience:womenTevillah'))
    expect(screen.getByDisplayValue('By appointment')).toBeInTheDocument()
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Add a phone' }))
    expect(screen.getByLabelText('Phone')).toBeInTheDocument()
  })

  it('a hospital’s people: one row each, a person on their own screen, Remove as words', async () => {
    const u = user()
    const hospital = makeListing({
      id: 'chop',
      category: 'hospital',
      name: 'CHOP',
      liaisons: [
        { name: 'Naomi Gorelick', phones: ['9087705145'] },
        { name: 'Heshy Horovitz', phones: ['7328107700'] },
      ],
    })
    const steps: (EditorStep | null)[] = []
    renderWithProviders(<ListingEditor item={hospital} category={HOSPITAL} onClose={() => {}} onStep={(s) => steps.push(s)} />)
    expect(row('box:Who to call')).toHaveTextContent('Naomi Gorelick, Heshy Horovitz')
    await u.click(row('box:Who to call'))
    await u.click(screen.getByRole('button', { name: /Naomi Gorelick/ }))
    expect(steps.at(-1)?.title).toBe('Naomi Gorelick')
    expect(screen.queryByLabelText('Who')).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Remove this person' }))
    expect(steps.at(-1)?.title).toBe('Who to call')
    await u.click(done())
    expect(row('box:Who to call')).toHaveTextContent('Heshy Horovitz')
    expect(row('box:Who to call')).toHaveTextContent('Changed')
  })
})

describe('ListingEditor — the admin console', () => {
  it('“+ Add listing” puts it live: Add listing, no challenge, and closes once it’s in', async () => {
    const u = user()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const { onClose, container } = renderEditor({ item: undefined, category: { ...FOOD, hasAddress: false }, adminSubmit: { token: 'admin-token' } })
    expect(screen.getByText('Goes live as soon as you add it, with no review.')).toBeInTheDocument()
    expect(container.querySelector('input[name="company"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Still needed: Name' })).toBeDisabled()

    await u.click(row('name'))
    await u.type(screen.getByRole('textbox', { name: 'Name' }), 'Kosher Corner')
    await u.click(done())
    await u.click(screen.getByRole('button', { name: 'Add listing' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/admin/listings')
    expect(init.headers.Authorization).toBe('Bearer admin-token')
    expect(JSON.parse(init.body).payload).toMatchObject({ category: 'restaurant', name: 'Kosher Corner' })
    expect(screen.queryByTestId('editor-sent')).not.toBeInTheDocument()
  })

  it('the category preview’s edit hands the listing back instead of sending it', async () => {
    const u = user()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onPreviewSend = vi.fn()
    const { container } = renderWithProviders(
      <PreviewSendProvider listing={onPreviewSend}>
        <ListingEditor item={bakery} category={FOOD} onClose={() => {}} />
      </PreviewSendProvider>,
    )
    expect(container.querySelector('input[name="company"]')).toBeNull()

    await u.click(row('contact'))
    const phone = screen.getByLabelText('Phone')
    await u.clear(phone)
    await u.type(phone, '2676066613')
    await u.click(done())
    await u.click(sendButton())

    expect(onPreviewSend).toHaveBeenCalledTimes(1)
    expect(onPreviewSend.mock.calls[0][0]).toMatchObject({
      id: 'sweet-box',
      category: 'restaurant',
      name: 'Sweet Box Bakery',
      phone: '(267) 606-6613',
      dishes: ['Cupcakes', 'Cookies', 'Brownies'],
    })
    expect(fetchMock).not.toHaveBeenCalled()
    // Then the visitor's own end: Sent, with nothing sent.
    expect(await screen.findByTestId('editor-sent')).toBeInTheDocument()
  })
})
