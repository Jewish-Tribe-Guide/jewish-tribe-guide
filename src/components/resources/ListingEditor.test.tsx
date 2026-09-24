// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import ListingEditor from './ListingEditor'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The real AddressInput loads the Google Maps SDK — see ListingForm.test.tsx's
// identical stub.
vi.mock('@/components/intake/AddressInput', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Address" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

// Monday noon: the fixture's hours say open.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 21, 12, 0))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const open = { open: '11:30', close: '22:00' }
const week = { sun: open, mon: open, tue: open, wed: open, thu: open, fri: open, sat: null }

// Shaped like the real Food category: a multi-choice badge, a certification
// badge carrying the kosher caveat (whose yes/no and note are `hidden` and
// edit from the badge), a website and a certification link.
const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours' },
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'photo', label: 'Photo', type: 'image' },
    {
      key: 't',
      label: 'Kashrus',
      type: 'select',
      renderAs: 'badge',
      multiSelect: true,
      options: [
        { value: 'meat', label: 'Meat' },
        { value: 'dairy', label: 'Dairy' },
        { value: 'parve', label: 'Parve' },
      ],
    },
    {
      key: 'kosherCert',
      label: 'Kosher Certification',
      type: 'select',
      renderAs: 'badge',
      multiSelect: true,
      options: [
        { value: 'ikc', label: 'IKC' },
        { value: 'ou', label: 'OU' },
      ],
      caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' },
    },
    { key: 'kosherPartial', label: 'Everything here is kosher', type: 'boolean', renderAs: 'hidden', invertDisplay: true },
    { key: 'kosherNote', label: 'What isn’t kosher?', type: 'textarea', renderAs: 'hidden', showIf: { field: 'kosherPartial', equals: true } },
    { key: 'k', label: 'Certification', type: 'url' },
  ],
})

const barBombon = makeListing({
  id: 'bar-bombon',
  category: 'restaurant',
  name: 'Bar Bombón',
  phone: '(267) 606-6612',
  address: '133 S 18th St, Philadelphia, PA 19103',
  hours: week,
  website: 'https://bar.example',
  t: ['parve'],
  kosherCert: ['ikc'],
  kosherPartial: true,
  kosherNote: 'Alcoholic beverages are NOT under supervision',
  photo: 'https://img.example/bar-bombon.jpg',
})

function renderEditor(props: Partial<Parameters<typeof ListingEditor>[0]> = {}) {
  const onClose = vi.fn()
  const view = renderWithProviders(<ListingEditor item={barBombon} category={food} onClose={onClose} {...props} />)
  return { ...view, onClose }
}

const send = () => screen.getByRole('button', { name: /^(Send \d+ changes?|No changes yet)$/ })
const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })

describe('ListingEditor — the listing, editable', () => {
  // Option A's whole premise: switching to edit doesn't move anything. The
  // same pieces the listing shows, in its order, each one now editable.
  it('shows the listing\'s own pieces, not a form: photo, name, badges, buttons, hours', () => {
    renderEditor()
    expect(screen.getByRole('heading', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.getByText('Reviewed by a moderator before it goes live')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Bar Bombón')
    for (const badge of ['Open', 'Parve', 'IKC']) expect(screen.getByRole('button', { name: badge })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a badge' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Directions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Website link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Certification link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Today: 11:30 AM – 10:00 PM/ })).toBeInTheDocument()
    // No category line: it never changes, so it has no place in edit mode.
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
  })

  it('offers "Add a photo" on a listing with none', () => {
    renderEditor({ item: { ...barBombon, photo: undefined } })
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeInTheDocument()
    renderEditor({ item: { ...barBombon, photo: 'https://img.example/p.jpg' } })
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument()
  })
})

describe('ListingEditor — knowing what changed', () => {
  it('waits for a change, counts each one, and goes back to zero when undone by hand', async () => {
    const u = user()
    renderEditor()
    expect(send()).toHaveTextContent('No changes yet')
    expect(send()).toBeDisabled()

    const phone = screen.getByRole('textbox', { name: 'Phone' })
    await u.clear(phone)
    await u.type(phone, '2676066613')
    expect(send()).toHaveTextContent('Send 1 change')
    expect(send()).toBeEnabled()

    await u.clear(phone)
    await u.type(phone, '2676066612')
    expect(send()).toHaveTextContent('No changes yet')
  })

  it('marks a changed field with its old value crossed out, and Undo puts it back', async () => {
    const u = user()
    renderEditor()
    const name = screen.getByRole('textbox', { name: 'Name' })
    await u.type(name, ' & Café')

    const old = screen.getByText('Bar Bombón', { selector: '.line-through' })
    expect(old).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Undo' }))
    expect(name).toHaveValue('Bar Bombón')
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('lists the changes above Send', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Parve' }))
    await u.click(within(screen.getByRole('group', { name: 'Kashrus' })).getByRole('button', { name: 'Dairy' }))

    expect(screen.getByText(/Your suggestion · 1 change/)).toBeInTheDocument()
    expect(screen.getByText('Parve → Parve, Dairy')).toBeInTheDocument()
  })
})

describe('ListingEditor — badges, edited where they sit', () => {
  it('opens a badge\'s whole group under the row, and shows a newly picked one as new', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Parve' }))
    const group = screen.getByRole('group', { name: 'Kashrus' })
    expect(within(group).getByRole('button', { name: 'Parve' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Meat' })).toHaveAttribute('aria-pressed', 'false')

    await u.click(within(group).getByRole('button', { name: 'Dairy' }))
    // The badge row now holds Dairy too, outside the panel.
    const row = screen.getByRole('button', { name: 'Add a badge' }).parentElement!
    expect(within(row).getByRole('button', { name: 'Dairy' }).parentElement!.className).toContain('border-primary')
  })

  // Taking back your own addition is one tap on its ×, not a trip back into
  // the panel to find the pill again.
  it('takes an added badge straight back off with its ×', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Add a badge' }))
    await u.click(screen.getByRole('button', { name: '+ Meat' }))
    expect(send()).toHaveTextContent('Send 1 change')

    await u.click(screen.getByRole('button', { name: 'Remove Meat' }))
    expect(send()).toHaveTextContent('No changes yet')
  })

  // A badge that was already there comes off the same way as one you added
  // — otherwise adding one teaches "chips have an ×" and the old ones look
  // fixed. It stays, crossed out, to be brought back.
  it('takes an existing badge off with its ×, crossed out and one tap from coming back', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Remove Parve' }))
    expect(send()).toHaveTextContent('Send 1 change')
    expect(screen.getByText('Parve → None')).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Bring back Parve' }))
    expect(send()).toHaveTextContent('No changes yet')
  })

  // The listing only shows a caveat beside a certification it has, so
  // taking the last one off quiets the caveat without a second change —
  // in particular, never a "Yes, everything is kosher" nobody said.
  it('quiets the caveat when the last certification comes off, without counting it as a change', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Remove IKC' }))
    expect(screen.queryByRole('button', { name: 'Edit: What isn’t kosher?' })).not.toBeInTheDocument()
    expect(send()).toHaveTextContent('Send 1 change')

    await u.click(screen.getByRole('button', { name: 'Bring back IKC' }))
    expect(screen.getByRole('button', { name: 'Edit: What isn’t kosher?' })).toBeInTheDocument()
  })

  it('brings a removed badge back with a tap on its crossed-out chip', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Parve' }))
    await u.click(within(screen.getByRole('group', { name: 'Kashrus' })).getByRole('button', { name: 'Parve' }))
    expect(send()).toHaveTextContent('Send 1 change')

    await u.click(screen.getByRole('button', { name: 'Bring back Parve' }))
    expect(send()).toHaveTextContent('No changes yet')
  })

  // A certifier the admin hasn't listed can still be named, the way the form
  // allows it for a field with allowOther.
  it('lets you type your own choice when the field allows "Other"', async () => {
    const u = user()
    const withOther = makeCategory({
      ...food,
      detailFields: food.detailFields.map((f) => (f.key === 'kosherCert' ? { ...f, allowOther: true } : f)),
    })
    renderEditor({ category: withOther })
    await u.click(screen.getByRole('button', { name: 'IKC' }))
    await u.click(screen.getByRole('button', { name: '+ Other…' }))
    await u.type(screen.getByRole('textbox', { name: 'Other kosher certification' }), 'Badatz{Enter}')

    const group = screen.getByRole('group', { name: 'Kosher Certification' })
    expect(within(group).getByRole('button', { name: 'Badatz' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('IKC → IKC, Badatz')).toBeInTheDocument()
  })

  // Still marked new (the blue edge), but in the colour the listing will
  // show it: a certification added under the caveat is amber like the rest.
  it('colours an added certification amber when the caveat applies, keeping its "new" edge', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Add a badge' }))
    await u.click(screen.getByRole('button', { name: '+ OU' }))
    const chip = screen.getByRole('button', { name: 'Remove OU' }).parentElement!
    expect(chip.className).toContain('border-primary')
    expect(chip.className).toContain('text-caution')
  })

  // A listing with no certification has no badge to open, so the "+" is
  // the only way in — and it has to take a certifier that isn't listed.
  it('adds a certifier that isn\'t listed from the "+", on a listing with none', async () => {
    const u = user()
    const withOther = makeCategory({
      ...food,
      detailFields: food.detailFields.map((f) => (f.key === 'kosherCert' ? { ...f, allowOther: true } : f)),
    })
    renderEditor({ category: withOther, item: { ...barBombon, kosherCert: [], kosherPartial: false } })
    expect(screen.queryByRole('button', { name: 'IKC' })).not.toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Add a badge' }))
    await u.click(screen.getByRole('button', { name: '+ Other…' }))
    await u.type(screen.getByRole('textbox', { name: 'Other kosher certification' }), 'Badatz{Enter}')
    expect(screen.getByRole('button', { name: 'Remove Badatz' })).toBeInTheDocument()
    expect(send()).toHaveTextContent('Send 1 change')
  })

  it('offers no "Other…" on a field that doesn\'t allow it', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'IKC' }))
    expect(screen.queryByRole('button', { name: '+ Other…' })).not.toBeInTheDocument()
  })

  // The orange note is where your eye goes to fix it, so it's tappable too,
  // but it opens the one editor for it rather than a second box.
  it('opens the caveat\'s editor from the orange note, with the cursor in the note', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Edit: What isn’t kosher?' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'What isn’t kosher?' })).toHaveFocus())
    expect(screen.getAllByRole('textbox', { name: 'What isn’t kosher?' })).toHaveLength(1)
  })

  it('crosses out a badge that was switched off, rather than just dropping it', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Parve' }))
    await u.click(within(screen.getByRole('group', { name: 'Kashrus' })).getByRole('button', { name: 'Parve' }))

    const row = screen.getByRole('button', { name: 'Add a badge' }).parentElement!
    expect(within(row).getByText('Parve').className).toContain('line-through')
  })

  // A "no" never shows on the listing, so without the "+" there'd be no way
  // to turn one on. It lists only what isn't there yet.
  it('adds a badge that isn\'t there from the "+", which offers only what\'s missing', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Add a badge' }))
    expect(screen.getByRole('button', { name: '+ Meat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ OU' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Parve' })).not.toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: '+ OU' }))
    expect(send()).toHaveTextContent('Send 1 change')
  })

  // The caveat edits from the badge it colours amber, and nowhere else.
  // Saying "Yes, everything's kosher" hides the note, and that's one
  // decision — the hidden note isn't counted as a second change.
  it('edits the kosher caveat from the certification badge, as one change', async () => {
    const u = user()
    renderEditor()
    expect(screen.getByRole('button', { name: 'IKC' }).parentElement!.className).toContain('text-caution')
    expect(screen.getByRole('button', { name: 'Edit: What isn’t kosher?' })).toHaveTextContent('Alcoholic beverages are NOT under supervision')

    await u.click(screen.getByRole('button', { name: 'IKC' }))
    expect(screen.getByRole('textbox', { name: 'What isn’t kosher?' })).toHaveValue('Alcoholic beverages are NOT under supervision')
    await u.click(screen.getByRole('switch', { name: 'Everything here is kosher' }))

    expect(screen.queryByRole('textbox', { name: 'What isn’t kosher?' })).not.toBeInTheDocument()
    expect(send()).toHaveTextContent('Send 1 change')
    const row = screen.getByRole('button', { name: 'Add a badge' }).parentElement!
    expect(within(row).getByRole('button', { name: 'IKC' }).parentElement!.className).not.toContain('text-caution')
  })
})

describe('ListingEditor — buttons and derived pieces', () => {
  it('edits a link from its button, and adds a missing one from its dashed "+"', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Add Certification link' }))
    await u.type(screen.getByRole('textbox', { name: 'Certification link' }), 'ikc.example/bar')
    expect(send()).toHaveTextContent('Send 1 change')
  })

  // Call comes from the phone number; editing it in two places would make
  // one of them wrong. A tap goes to the real field instead.
  it('takes Call to the phone field, rather than editing a second copy', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Call' }))
    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveFocus()
  })

  // The address's id sits on the box around the address picker, not on
  // the input itself — so this checks the jump lands IN the field. It
  // didn't at first: the scroll happened, and the cursor went nowhere.
  it('takes Directions into the address field itself', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: 'Directions' }))
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveFocus()
  })

  it('reads hours as the listing does, opens the week on a tap, and names the day that changed', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: /Today: 11:30 AM – 10:00 PM/ }))
    await u.click(screen.getByRole('checkbox', { name: 'Monday closed' }))

    expect(screen.getByText('1 day changed · Monday')).toBeInTheDocument()
    expect(send()).toHaveTextContent('Send 1 change')
  })

  // A mikvah's women's section only applies once Women's Tevillah is on:
  // switching it on is what brings those fields into the listing.
  it('brings in the fields a badge unlocks, where the listing shows them', async () => {
    const u = user()
    const mikvah = makeCategory({
      id: 'mikvah',
      detailFields: [
        { key: 'womenTevillah', label: "Women's Tevillah", type: 'boolean', filterLabel: "Women's" },
        { key: 'women_s_phone', label: "Women's Phone", type: 'tel', audienceKey: 'womenTevillah' },
      ],
    })
    renderEditor({ category: mikvah, item: makeListing({ category: 'mikvah', name: 'Community Mikvah' }) })
    expect(screen.queryByRole('button', { name: /women's phone/i })).not.toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Add a badge' }))
    await u.click(screen.getByRole('button', { name: "+ Women's" }))
    expect(screen.getByRole('button', { name: "Add women's phone" })).toBeInTheDocument()
  })
})

describe('ListingEditor — sending', () => {
  it('sends an update with the change, then shows a receipt of what was sent', async () => {
    const u = user()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    renderEditor()
    const phone = screen.getByRole('textbox', { name: 'Phone' })
    await u.clear(phone)
    await u.type(phone, '2676066613')
    await u.click(send())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.operation).toBe('update')
    expect(body.targetId).toBe('bar-bombon')
    expect(body.payload.phone).toBe('(267) 606-6613')
    // Untouched values go along unchanged, the caveat's note included.
    expect(body.payload.details.kosherNote).toBe('Alcoholic beverages are NOT under supervision')

    expect(await screen.findByText('Sent for review. A moderator checks it before it goes live.')).toBeInTheDocument()
    expect(screen.getByText('(267) 606-6612 → (267) 606-6613')).toBeInTheDocument()
  })

  // Desktop floats Send below the dialog, in the spot "Suggest an edit" held.
  it('puts Send in the host\'s slot when given one, and takes it out while the removal panel is up', async () => {
    const u = user()
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    renderEditor({ sendSlot: slot })
    expect(within(slot).getByRole('button', { name: 'No changes yet' })).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: /Request removal/ }))
    expect(within(slot).queryByRole('button', { name: 'No changes yet' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Request removal' })).toBeInTheDocument()
    slot.remove()
  })

  // Send is the last thing on every screen: under the desktop dialog, and
  // the end of the content on a phone, after the removal link, not before.
  it('ends with Send, after the removal link, when Send is in the content', () => {
    renderEditor()
    const link = screen.getByRole('button', { name: 'Closed for good? Request removal' })
    expect(link.compareDocumentPosition(send()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // Removal's confirm is where Send was, and looks the same: it's a request
  // a moderator reviews, not a deletion, so it isn't the red of danger.
  it('puts the removal confirm in Send\'s slot, looking the same as Send', async () => {
    const u = user()
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    renderEditor({ sendSlot: slot })
    const sendClass = within(slot).getByRole('button', { name: 'No changes yet' }).className

    await u.click(screen.getByRole('button', { name: /Request removal/ }))
    const confirm = within(slot).getByRole('button', { name: /^(Confirm removal request|Verifying…)$/ })
    expect(confirm.className).toBe(sendClass)
    slot.remove()
  })

  // A host that owns the removal step has a Back that leaves it, so the
  // screen has no Cancel; on its own, the editor keeps one.
  it('drops the removal screen\'s Cancel when the host owns the step', async () => {
    const u = user()
    const onRemovalOpenChange = vi.fn()
    const { rerenderWithProviders } = renderEditor({ removalOpen: false, onRemovalOpenChange })
    await u.click(screen.getByRole('button', { name: /Request removal/ }))
    expect(onRemovalOpenChange).toHaveBeenLastCalledWith(true)

    rerenderWithProviders(<ListingEditor item={barBombon} category={food} onClose={() => {}} removalOpen onRemovalOpenChange={onRemovalOpenChange} />)
    expect(screen.getByRole('heading', { name: 'Request removal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('keeps a Cancel on the removal screen when it owns the step itself', async () => {
    const u = user()
    renderEditor()
    await u.click(screen.getByRole('button', { name: /Request removal/ }))
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Suggest an edit' })).toBeInTheDocument()
  })

  // The host's header row (Back … Close) would otherwise be an empty band;
  // the title goes there, and isn't repeated in the content.
  it('puts its title in the host\'s header slot when given one', async () => {
    const u = user()
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    const { container } = renderEditor({ titleSlot: slot })
    expect(within(slot).getByRole('heading', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(within(container).queryByRole('heading', { name: 'Suggest an edit' })).not.toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: /Request removal/ }))
    expect(within(slot).getByRole('heading', { name: 'Request removal' })).toBeInTheDocument()
    slot.remove()
  })
})

// Every field type has to have somewhere to be edited — a Record in the
// component makes adding one without deciding a compile error; this checks
// the decision actually renders something for each.
describe('ListingEditor — every field type has a home', () => {
  it('renders an editor, or an "Add" for it, for each field type', () => {
    const fields: CategoryField[] = [
      { key: 'a', label: 'Note', type: 'text' },
      { key: 'b', label: 'Details', type: 'textarea' },
      { key: 'c', label: 'Other phone', type: 'tel' },
      { key: 'd', label: 'Seats', type: 'number' },
      { key: 'e', label: 'Delivery', type: 'boolean' },
      { key: 'f', label: 'Style', type: 'select', renderAs: 'badge', options: [{ value: 'x', label: 'X' }] },
      { key: 'g', label: 'Items', type: 'tags' },
      { key: 'h', label: 'Menu', type: 'url' },
      { key: 'i', label: 'Hours', type: 'hours' },
      { key: 'j', label: 'Davening', type: 'minyanim' },
      { key: 'photo', label: 'Photo', type: 'image' },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, tags: [] }) }))
    renderEditor({ category: makeCategory({ detailFields: fields }), item: makeListing({ name: 'Blank' }) })
    act(() => {})
    for (const name of ['Add note', 'Add details', 'Add other phone', 'Add seats', 'Add items', 'Add Menu link', 'Add hours', 'Add davening times', 'Add a photo', 'Add a badge']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })
})
