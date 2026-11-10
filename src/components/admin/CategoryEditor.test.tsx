// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryEditor } from './CategoryEditor'
import { forgetReadyMade } from './useReadyMade'
import { renderWithProviders } from '@/test/renderWithProviders'
import { historyRouter, mockRouter } from '@/test/nextNavigationMock'
import { CATEGORY_TEMPLATES } from '@/lib/categoryTemplates'
import { fetchJson } from '@/lib/fetchJson'
import { CATEGORY_CAPABILITY_DEFAULTS, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { kosherQuestions } from '@/lib/kosherQuestions'
import { withEruvFields } from '@/lib/eruvFields'

// This component is ~1000 lines doing template application, field-schema
// editing, and two separate destructive-change confirmation workflows
// (option-rename migration, field-removal cleanup) — real behavior worth
// locking in before any structural split, not just a lint-motivated
// extraction like the rest of this session's refactors. Deliberately does
// NOT cover the Preview button: CategoryPreview needs the same heavy
// provider stack (ContentProvider/CommunityProvider) that GenericListingCard
// does, out of scope here — see the memory note on the provider-harness gap.

vi.mock('@/lib/fetchJson', async (original) => ({ ...(await original<typeof import('@/lib/fetchJson')>()), fetchJson: vi.fn() }))
// The page beside the settings: the draft it's given, not the page itself
// (that needs the whole site's providers).
vi.mock('./CategoryPreview', () => ({
  default: ({ category, inline, view, focusField }: { category: CategoryConfig; inline?: boolean; view?: string; focusField?: string }) => (
    <p data-testid={inline ? 'preview-beside' : 'preview'} data-view={view} data-focus={focusField} data-fields={category.detailFields.map((f) => f.key).join(' ')}>
      {category.pluralLabel}
    </p>
  ),
}))
// A superadmin's screens are the same as anyone's (no More; the user, Nov 10).
vi.mock('./AdminAuthGate', async (original) => ({ ...(await original<typeof import('./AdminAuthGate')>()), useIsSuperAdmin: () => true }))
vi.mock('next/navigation', () => ({
  useRouter: () => historyRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

function baseCategory(overrides: Partial<CategoryConfig> = {}): CategoryConfig {
  return {
    id: 'grocery',
    label: 'Grocery',
    pluralLabel: 'Groceries',
    icon: '🛒',
    description: '',
    detailFields: [],
    kind: 'listing',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(fetchJson).mockResolvedValue({ ok: true })
})

/** Saves through the Save bar, which shows once something changed: when
 *  nothing has, flipping the upvotes question is the change. */
async function saveNow(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.queryByRole('button', { name: 'Save' })) {
    const upvotes = screen.getByRole('radiogroup', { name: 'Can visitors upvote places?' })
    await user.click(within(upvotes).getAllByRole('radio').find((r) => r.getAttribute('aria-checked') === 'false')!)
  }
  await user.click(screen.getByRole('button', { name: 'Save' }))
}

/** Every box in Fields is open (board E1b, Nov 10): checks it's there, and
 *  is the box addField() adds to. */
let inBox = 'Contact'
async function openBox(_user: ReturnType<typeof userEvent.setup>, name: string) {
  inBox = name
  expect(within(screen.getByRole('region', { name: 'Fields' })).getAllByText(name, { selector: 'h3, button' }).length).toBeGreaterThan(0)
}

/** Fields as drawn (E1b): each box's name, and the names of the rows in
 *  it, in order. */
function boxesShown(): [string, string[]][] {
  const out: [string, string[]][] = []
  for (const el of within(screen.getByRole('region', { name: 'Fields' })).queryAllByText((_, e) => !!e?.matches('[data-drag-row]'))) {
    const key = el.getAttribute('data-drag-row')!
    if (key.startsWith('box:')) out.push([el.textContent!.trim(), []])
    else if (!key.startsWith('end:')) out.at(-1)?.[1].push(el.querySelector('button > span > span')?.textContent?.trim() ?? '')
  }
  return out
}
const shownIn = (box: string) => boxesShown().find(([name]) => name === box)?.[1]

/** The + Add a field of the box last named by openBox. */
const addField = () => screen.getByRole('button', { name: `Add a field to ${inBox}` })

/** + Add a box, named, and its + Add a field the next one clicked. */
async function addBoxNamed(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Add a box' }))
  await user.type(await screen.findByPlaceholderText('New box'), `${name}{Enter}`)
  await openBox(user, name)
}

/** Contact → Address → Remove this field, and back to the page. */
async function removeAddress(user: ReturnType<typeof userEvent.setup>) {
  await openBox(user, 'Contact')
  await user.click(screen.getByRole('button', { name: /^Address/ }))
  await user.click(screen.getByRole('button', { name: 'Remove this field' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove this field' })).not.toBeInTheDocument())
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  forgetReadyMade()
  // A screen's history entry, and its address, left by one test isn't the
  // next one's page.
  history.replaceState(null, '', '/')
})

describe('CategoryEditor — new category', () => {
  // Board 3: a page made from nothing. Its kind comes from the page it's
  // copied from, so there's no kind to pick here.
  it('shows "New category page" and asks no kind', () => {
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} backLabel="What kind of places?" />)
    expect(screen.getByRole('heading', { name: 'New category page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /What kind of places\?/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Shuls/ })).toBeNull()
  })

  it('blocks save without a name', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /create category/i }))

    expect(screen.getByText('Category name is required.')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('creates the category via POST once a name is given', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="tok" initial={null} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Name'), 'Pharmacies')
    await user.click(screen.getByRole('button', { name: /create category/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('pharmacies'))
    // Plain is what the slug gives, so no kind is sent.
    expect(JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)).not.toHaveProperty('placeKind')
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories?community=test-community',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
      'Save failed.',
    )
  })

  // Board 2: a ready-made page, copied.
  it('starts from a ready-made page and makes it with its fields', async () => {
    const user = userEvent.setup()
    const shul = CATEGORY_TEMPLATES.find((t) => t.id === 'synagogue')!
    const seed = baseCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: shul.pluralLabel, detailFields: shul.fields })
    const onSaved = vi.fn()
    renderWithProviders(<CategoryEditor token="t" initial={null} seed={seed} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)

    expect(screen.getByRole('heading', { name: shul.pluralLabel })).toBeInTheDocument()
    expect(boxesShown().map(([name]) => name)).toContain('Davening times')
    await user.click(screen.getByRole('button', { name: /create category/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('synagogue'))
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.fields.map((f: { key: string }) => f.key)).toEqual(expect.arrayContaining(shul.fields.map((f) => f.key)))
  })

  // A copied page keeps its listing's boxes (before, the create sent none).
  it('makes a copy with its boxes', async () => {
    const user = userEvent.setup()
    const seed = baseCategory({
      id: 'hospital',
      pluralLabel: 'Hospitals',
      detailFields: [{ key: 'pantry', label: 'Pantry', type: 'contacts' }],
      listingParts: { boxes: [{ title: 'Kosher food', fields: ['pantry'] }] },
    })
    renderWithProviders(<CategoryEditor token="t" initial={null} seed={seed} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(shownIn('Kosher food')).toEqual(['Pantry'])
    await user.click(screen.getByRole('button', { name: /create category/i }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    expect(JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string).listingParts).toEqual({ boxes: [{ title: 'Kosher food', fields: ['pantry'] }] })
  })

  it('sends a copied kind its web address doesn’t already give', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} seed={baseCategory({ id: 'restaurant', pluralLabel: 'Food' })} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Eat')
    await user.click(screen.getByRole('button', { name: /create category/i }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    expect(JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)).toMatchObject({ id: 'eat', placeKind: 'food' })
  })

  it('shows a save-failure error and does not call onSaved', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Name already in use.'))
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Name'), 'Pharmacies')
    await user.click(screen.getByRole('button', { name: /create category/i }))

    expect(await screen.findByText('Name already in use.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('CategoryEditor — editing an existing category', () => {
  it('shows the category name in the heading', () => {
    renderWithProviders(
      <CategoryEditor
        token="t"
        initial={baseCategory()}
        siblings={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument()
  })

  it('has nothing to save until something changes, then counts it, and Undo puts it back', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('region', { name: 'Save' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), ' and more')
    // A press while typing only puts the keyboard away (listenForPresses).
    await user.tab()
    await removeAddress(user)
    expect(within(screen.getByRole('region', { name: 'Save' })).getByText('2 changes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Groceries')
    expect(screen.queryByRole('region', { name: 'Save' })).not.toBeInTheDocument()
  })

  // The Home page's photo picker (the user, Nov 5), not a banner upload
  // with a preview beside it and a second pasted address under it.
  it('has one banner photo, the older pasted one standing in until it is removed', async () => {
    const user = userEvent.setup()
    const photo = 'https://example.com/old.jpg'
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory({ cardImageUrl: photo })} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /^Banner photo/ }))
    expect(screen.queryByText('Desktop directory banner (optional)')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('https://…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste URL' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await saveNow(user)
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toMatchObject({ cardImageUrl: null, cardBandImageUrl: null })
  })

  it('takes it off the site with the switch', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
    const onSite = screen.getByRole('switch', { name: 'On the site' })
    expect(onSite).toHaveAttribute('aria-checked', 'true')
    await user.click(onSite)
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('grocery'))
    expect(JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string).active).toBe(false)
  })

  it('opens each field to its own screen, and back', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <CategoryEditor
        token="t"
        initial={baseCategory({ detailFields: [{ key: 'kosher', label: 'Kosher certification', type: 'select', renderAs: 'badge', filterable: true, options: [{ value: 'OU', label: 'OU' }] }] })}
        siblings={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    // In the box it shows in on the listing (board 17).
    expect(shownIn('Contact')).toContain('Kosher certification')
    await openBox(user, 'Contact')
    const row = screen.getByRole('button', { name: /^Kosher certification/ })
    expect(row).toHaveTextContent('Filter')
    await user.click(row)
    // Its name, and its kind beside it (board 13).
    expect(screen.getByRole('heading', { name: /^Kosher certification\s*Choices$/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Fields' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '‹ Groceries' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Fields' })).toBeInTheDocument())
  })

  it('shows the page beside the settings, as they are being typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    const preview = screen.getByRole('complementary', { name: 'Preview' })
    expect(within(preview).getByRole('button', { name: 'Page' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('Name'), ' and more')
    // Drawn into the preview's own frame.
    const frame = preview.querySelector('iframe')!
    await waitFor(() => expect(frame.contentDocument!.body).toHaveTextContent('Groceries and more'))
    // The page opens full size; the Page · A listing · Adding buttons stay
    // their own, never inside it (a button in a button doesn't hydrate).
    const open = within(preview).getByRole('button', { name: 'Open the preview' })
    expect(within(open).queryAllByRole('button')).toEqual([])
    await user.click(open)
    expect(screen.getByTestId('preview')).toHaveTextContent('Groceries and more')
  })

  it('saves via PATCH with no confirmation step when nothing destructive changed', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />,
    )

    await saveNow(user)

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories/grocery?community=test-community',
      expect.objectContaining({ method: 'PATCH' }),
      'Save failed.',
    )
  })

  // Board 4's Questions: each a No/Yes, not a switch.
  it('asks about upvotes and the not-listed link with No and Yes, and sends the answers', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
    const upvotes = screen.getByRole('radiogroup', { name: 'Can visitors upvote places?' })
    expect(within(upvotes).getByRole('radio', { name: 'No' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(upvotes).getByRole('radio', { name: 'Yes' }))
    const link = screen.getByRole('radiogroup', { name: 'A link for places not listed here?' })
    expect(screen.queryByLabelText('What the link says')).not.toBeInTheDocument()
    await user.click(within(link).getByRole('radio', { name: 'Yes' }))
    await user.type(screen.getByLabelText('What the link says'), 'Find more')
    await user.type(screen.getByLabelText('Link'), 'https://example.org')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.upvotesEnabled).toBe(true)
    expect(body.externalLink).toEqual({ label: 'Find more', url: 'https://example.org' })
  })

  it('takes the not-listed link off with No, keeping what was typed', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <CategoryEditor token="t" initial={baseCategory({ externalLink: { label: 'Find more', url: 'https://example.org' } })} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />,
    )
    const link = screen.getByRole('radiogroup', { name: 'A link for places not listed here?' })
    expect(screen.getByLabelText('What the link says')).toHaveValue('Find more')
    await user.click(within(link).getByRole('radio', { name: 'No' }))
    expect(screen.queryByLabelText('What the link says')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string).externalLink ?? null).toBeNull()
  })

  // No map switch: a page is on the map when its places have an address,
  // added like any field (boards 7-11).
  it('puts the page on the map with its address, as one change', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [] }))))
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory({ hasAddress: false, capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, map: false } })} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
    await openBox(user, 'Contact')
    await user.click(addField())
    await user.click(await screen.findByRole('button', { name: /^Address/ }))
    await user.click(screen.getByRole('button', { name: 'Add to Groceries' }))
    await screen.findByRole('heading', { name: 'Groceries' })
    // Back in Contact, open.
    expect(screen.getByRole('button', { name: /^Address/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Save' })).getByText('1 change')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string).capabilities.map).toBe(true)
  })

  it('deletes the page from its foot, once asked', async () => {
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} onDeleted={onDeleted} />)
    await user.click(screen.getByRole('button', { name: 'Delete this page' }))
    expect(screen.getByText('Delete Groceries and every place on it?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(fetchJson).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete this page' }))
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(fetchJson).toHaveBeenCalledWith('/api/admin/categories/grocery?community=test-community', expect.objectContaining({ method: 'DELETE' }), 'Delete failed.')
  })

  // "Remove this field" on one places have answered (board 16): its own
  // step says what goes, and once it's answered there Save doesn't ask
  // again. Save's own gate is left for when the count couldn't be had.
  describe('removing a field places have filled in', () => {
    const usage = (u: { address?: number; phone?: number; fields?: Record<string, number> }) => ({ usage: { address: 0, phone: 0, fields: {}, ...u } })
    const call = (n: number) => vi.mocked(fetchJson).mock.calls[n]!
    const body = (n: number) => JSON.parse((call(n)[1] as RequestInit).body as string)

    it('asks first, saying what goes, and Keep it changes nothing', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce(usage({ address: 3 }))
      const user = userEvent.setup()
      renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
      await openBox(user, 'Contact')
      await user.click(screen.getByRole('button', { name: /^Address/ }))
      await user.click(screen.getByRole('button', { name: 'Remove this field' }))

      expect(await screen.findByRole('heading', { name: 'Remove Address from Groceries?' })).toBeInTheDocument()
      expect(screen.getByText('3 places').parentElement).toHaveTextContent('3 places lose their answer')
      expect(screen.getByText('Groceries comes off the map')).toBeInTheDocument()
      expect(call(0)[0]).toBe('/api/admin/categories/grocery/field-usage?community=test-community')
      expect(body(0)).toEqual({ address: true, phone: false, fieldKeys: [] })

      await user.click(screen.getByRole('button', { name: 'Keep it' }))
      expect(await screen.findByRole('button', { name: 'Remove this field' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    })

    it('Remove it goes back to the page, and Save clears the answers without asking again', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce(usage({ address: 3 }))
      const onSaved = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
      await openBox(user, 'Contact')
      await user.click(screen.getByRole('button', { name: /^Address/ }))
      await user.click(screen.getByRole('button', { name: 'Remove this field' }))
      await user.click(await screen.findByRole('button', { name: 'Remove it' }))

      expect(await screen.findByRole('heading', { name: 'Groceries' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Address/ })).not.toBeInTheDocument()
      await saveNow(user)
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(screen.queryByText('This will permanently clear data from existing listings')).not.toBeInTheDocument()
      expect(fetchJson).toHaveBeenCalledTimes(2)
      expect(body(1)).toMatchObject({ hasAddress: false, capabilities: { map: false }, clearFields: { address: true, phone: false, keys: [] } })
    })

    it('a field that is a filter says the filter loses it too', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce(usage({ fields: { hechsher: 71 } }))
      const onSaved = vi.fn()
      const user = userEvent.setup()
      const initial = baseCategory({
        pluralLabel: 'Food',
        detailFields: [{ key: 'hechsher', label: 'Kosher Certification', type: 'select', filterable: true, options: [{ value: 'IKC', label: 'IKC' }] }],
      })
      renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
      await openBox(user, 'Contact')
      await user.click(screen.getByRole('button', { name: /^Kosher Certification(?! URL)/ }))
      await user.click(screen.getByRole('button', { name: 'Remove from Food' }))

      expect(await screen.findByRole('heading', { name: 'Remove Kosher Certification from Food?' })).toBeInTheDocument()
      expect(screen.getByText('71 places').parentElement).toHaveTextContent('71 places lose their answer')
      expect(screen.getByText('Food’s filter loses Kosher Certification')).toBeInTheDocument()
      expect(body(0)).toEqual({ address: false, phone: false, fieldKeys: ['hechsher'] })
      await user.click(screen.getByRole('button', { name: 'Remove it' }))
      await screen.findByRole('heading', { name: 'Food' })
      await saveNow(user)
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(fetchJson).toHaveBeenCalledTimes(2)
      expect(body(1).clearFields).toEqual({ address: false, phone: false, keys: ['hechsher'] })
      expect(body(1).fields.map((f: { key: string }) => f.key)).not.toContain('hechsher')
    })

    it('with no answers it just goes', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce(usage({}))
      const onSaved = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
      await removeAddress(user)
      expect(screen.queryByRole('button', { name: 'Remove it' })).not.toBeInTheDocument()
      await saveNow(user)
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(fetchJson).toHaveBeenCalledTimes(2)
      expect(body(1)).toMatchObject({ hasAddress: false, capabilities: { map: false } })
    })

    it('a field this draft added just goes, without counting', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [] }))))
      const user = userEvent.setup()
      renderWithProviders(<CategoryEditor token="t" initial={baseCategory({ hasAddress: false, capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, map: false } })} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
      await openBox(user, 'Contact')
      await user.click(addField())
      await user.click(await screen.findByRole('button', { name: /^Address/ }))
      await user.click(screen.getByRole('button', { name: 'Add to Groceries' }))
      await screen.findByRole('heading', { name: 'Groceries' })
      vi.mocked(fetchJson).mockClear()
      await user.click(screen.getByRole('button', { name: /^Address/ }))
      await user.click(screen.getByRole('button', { name: 'Remove this field' }))
      await screen.findByRole('heading', { name: 'Groceries' })
      expect(fetchJson).not.toHaveBeenCalled()
    })

    describe('when the count could not be had, Save asks as it always has', () => {
      beforeEach(() => {
        vi.mocked(fetchJson)
          .mockRejectedValueOnce(new Error('offline'))
          .mockResolvedValueOnce(usage({ address: 3 }))
      })

      it('"Clear and save" confirms the cleanup and completes the save', async () => {
        const onSaved = vi.fn()
        const user = userEvent.setup()
        renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
        await removeAddress(user)
        await saveNow(user)
        expect(await screen.findByText(/Address — 3 listings/)).toBeInTheDocument()
        expect(onSaved).not.toHaveBeenCalled()
        await user.click(screen.getByRole('button', { name: /clear and save/i }))
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
        expect(body(2).clearFields).toEqual({ address: true, phone: false, keys: [] })
      })

      it('Cancel backs out of the cleanup confirmation without saving', async () => {
        const onSaved = vi.fn()
        const user = userEvent.setup()
        renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
        await removeAddress(user)
        await saveNow(user)
        await screen.findByText('This will permanently clear data from existing listings')
        await user.click(screen.getByRole('button', { name: /^cancel$/i }))
        expect(screen.queryByText('This will permanently clear data from existing listings')).not.toBeInTheDocument()
        expect(onSaved).not.toHaveBeenCalled()
        expect(fetchJson).toHaveBeenCalledTimes(2)
      })
    })
  })

  // The option-rename migration workflow: editing a select option's text in
  // place looks the same on the wire as removing one value and adding an
  // unrelated one — detectOptionRenames narrows that to the unambiguous case
  // (exactly one removed, one added) and offers to migrate existing data.
  describe('the option-rename confirmation', () => {
    function categoryWithSelectField(): CategoryConfig {
      return baseCategory({
        detailFields: [
          // Made here: a ready-made field's choices aren't the page's to rename.
          { key: 'type', label: 'Type', type: 'select', madeHere: true, options: [{ value: 'Kosher', label: 'Kosher' }] },
        ],
      })
    }

    it('detects a single removed+added option as a rename and checks usage', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce({
        usage: [{ fieldKey: 'type', oldValue: 'Kosher', newValue: 'Glatt Kosher', count: 2 }],
      })
      const user = userEvent.setup()
      renderWithProviders(
        <CategoryEditor
          token="t"
          initial={categoryWithSelectField()}
          siblings={null}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      await openBox(user, 'Contact')
      await user.click(screen.getByRole('button', { name: /^Type/ }))
      await user.click(screen.getByRole('button', { name: 'Remove Kosher' }))
      await user.click(screen.getByRole('button', { name: '+ Add a choice' }))
      await user.type(screen.getByRole('textbox', { name: 'New choice' }), 'Glatt Kosher{Enter}')
      await saveNow(user)

      expect(await screen.findByText('Update existing listings to match this rename?')).toBeInTheDocument()
      expect(fetchJson).toHaveBeenCalledWith(
        '/api/admin/categories/grocery/option-usage?community=test-community',
        expect.objectContaining({ method: 'POST' }),
        'Could not check existing listings.',
      )
    })

    it('"Save without updating" skips the migration and saves as-is', async () => {
      vi.mocked(fetchJson)
        .mockResolvedValueOnce({ usage: [{ fieldKey: 'type', oldValue: 'Kosher', newValue: 'Glatt Kosher', count: 2 }] })
        .mockResolvedValueOnce({ ok: true })
      const onSaved = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(
        <CategoryEditor
          token="t"
          initial={categoryWithSelectField()}
          siblings={null}
          onSaved={onSaved}
          onCancel={vi.fn()}
        />,
      )

      await openBox(user, 'Contact')
      await user.click(screen.getByRole('button', { name: /^Type/ }))
      await user.click(screen.getByRole('button', { name: 'Remove Kosher' }))
      await user.click(screen.getByRole('button', { name: '+ Add a choice' }))
      await user.type(screen.getByRole('textbox', { name: 'New choice' }), 'Glatt Kosher{Enter}')
      await saveNow(user)
      await screen.findByText('Update existing listings to match this rename?')

      await user.click(screen.getByRole('button', { name: /save without updating/i }))

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      const secondCall = vi.mocked(fetchJson).mock.calls[1]!
      const body = JSON.parse((secondCall[1] as RequestInit).body as string)
      expect(body.applyOptionRenames).toBeUndefined()
    })
  })
})

// Boards 4 and 5: beside the settings, the page, one of its places
// opened, or the form for adding one.
describe('CategoryEditor — Page · A listing · Adding', () => {
  const computer = () => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
  const tabs = () => within(screen.getByRole('group', { name: 'Preview of' })).getAllByRole('button').map((b) => b.textContent)
  // Drawn into the preview's own frame.
  const shown = () => screen.getByRole('complementary', { name: 'Preview' }).querySelector('iframe')!.contentDocument!.querySelector('[data-testid="preview-beside"]')?.getAttribute('data-view')

  it('switches what the preview shows, and opens that one full size', async () => {
    computer()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory({ capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, add: true } })} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(tabs()).toEqual(['Page', 'A listing', 'Adding'])
    await waitFor(() => expect(shown()).toBe('page'))
    await user.click(screen.getByRole('button', { name: 'A listing' }))
    expect(screen.getByRole('button', { name: 'A listing' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(shown()).toBe('listing'))
    await user.click(screen.getByRole('button', { name: 'Adding' }))
    await waitFor(() => expect(shown()).toBe('adding'))
    await user.click(screen.getByRole('button', { name: 'Open the preview' }))
    expect(screen.getByTestId('preview')).toHaveAttribute('data-view', 'adding')
  })

  // Boards 33d-34c (Nov 9): beside a field, the field where a visitor
  // meets it, a tab for each place, in place of the page's switch.
  it('shows how the field looks beside it, not the page, and only its own screen’s settings', async () => {
    computer()
    const user = userEvent.setup()
    const initial = baseCategory({
      capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, add: true },
      detailFields: [{ key: 'type', label: 'Type', type: 'select', options: [{ value: 'Kosher', label: 'Kosher' }] }],
    })
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(shown()).toBe('page'))
    await openBox(user, 'Contact')
    await user.click(screen.getByRole('button', { name: /^Type/ }))
    const looks = screen.getByRole('complementary', { name: 'How it looks' })
    expect(within(looks).getAllByRole('tab').map((t) => t.textContent)).toEqual(['List', 'Filters', 'A listing', 'Adding'])
    expect(screen.queryByRole('complementary', { name: 'Preview' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Preview of' })).toBeNull()
    // No More, though a superadmin is signed in (the mock above).
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('combobox').filter((c) => !looks.contains(c))).toEqual([])
  })

  // The user, Nov 9: Denomination kept its Filters with the filter off,
  // and saving put the filter back.
  it('takes a field out of Filters when In the filter is turned off, and saves it off', async () => {
    computer()
    const onSaved = vi.fn()
    const user = userEvent.setup()
    const initial = baseCategory({
      detailFields: [{ key: 'denom', label: 'Denomination', type: 'select', renderAs: 'badge', filterable: true, options: [{ value: 'Orthodox', label: 'Orthodox' }] }],
    })
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
    await openBox(user, 'Contact')
    await user.click(screen.getByRole('button', { name: /^Denomination/ }))
    const looks = screen.getByRole('complementary', { name: 'How it looks' })
    expect(within(looks).getByRole('tab', { name: 'Filters' })).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'In the filter' }))
    expect(within(looks).queryByRole('tab', { name: 'Filters' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.fields.find((f: { key: string }) => f.key === 'denom').filterable).toBe(false)
  })

  // The user, Nov 7: opened full size, the field went away.
  it('opens the whole page full size from beside a field, the field on it', async () => {
    computer()
    const user = userEvent.setup()
    const initial = baseCategory({
      capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, add: true },
      detailFields: [{ key: 'type', label: 'Type', type: 'select', options: [{ value: 'Kosher', label: 'Kosher' }] }],
    })
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await openBox(user, 'Contact')
    await user.click(screen.getByRole('button', { name: /^Type/ }))
    await user.click(screen.getByRole('button', { name: 'See the whole page' }))
    expect(screen.getByTestId('preview')).toHaveAttribute('data-view', 'page')
    expect(screen.getByTestId('preview')).toHaveAttribute('data-focus', 'type')
  })

  // Board 34b: a field not on the row says so on the List tab, and goes to
  // the card's picker for its line; Back comes back to the field.
  it('sends a field not on the row to the card’s line, and back', async () => {
    computer()
    const user = userEvent.setup()
    const initial = baseCategory({ detailFields: [{ key: 'delivery', label: 'Delivery Details', type: 'textarea' }] })
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await openBox(user, 'About')
    await user.click(screen.getByRole('button', { name: /^Delivery Details/ }))
    const looks = screen.getByRole('complementary', { name: 'How it looks' })
    // Off the row, it opens where it is: its listing.
    expect(within(looks).getByRole('tabpanel')).toHaveAccessibleName('A listing')
    await user.click(within(looks).getByRole('tab', { name: 'List' }))
    const list = within(looks).getByRole('tabpanel', { name: 'List' })
    expect(list).toHaveTextContent('Not shown in the list.')
    await user.click(within(list).getByRole('button', { name: 'Show it on a row' }))
    expect(await screen.findByRole('heading', { name: 'Show on the third line' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Delivery Details/ }))
    // Back on the field, on the row now.
    const after = await screen.findByRole('tabpanel', { name: 'List' })
    expect(after).not.toHaveTextContent('Not shown in the list.')
    expect(after.querySelector('mark')).toHaveTextContent('Orders by Wednesday noon')
  })

  it('has no Adding where visitors can’t add', () => {
    computer()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory({ capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, add: false } })} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(tabs()).toEqual(['Page', 'A listing'])
  })
})

describe('CategoryEditor — places within a walk', () => {
  const hotels = baseCategory({ id: 'hotel', label: 'Hotel', pluralLabel: 'Hotels', detailFields: [] })
  const shuls = baseCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [] })
  const food = baseCategory({
    id: 'restaurant',
    label: 'Food',
    pluralLabel: 'Food',
    detailFields: [
      { key: 'foodType', label: 'Store Type', type: 'select', renderAs: 'badge', filterable: true, options: [{ value: 'Restaurant', label: 'Restaurant' }] },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  })
  const groups = baseCategory({ id: 'whatsapp', pluralLabel: 'WhatsApp Groups', hasAddress: false, detailFields: [] })
  const siblings = [hotels, shuls, food, groups]
  const payload = () => (vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body
  const editor = (initial: typeof hotels | null, onSaved = vi.fn()) =>
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={siblings} onSaved={onSaved} onCancel={vi.fn()} />)
  const save = async (user: ReturnType<typeof userEvent.setup>, onSaved: ReturnType<typeof vi.fn>, times: number) => {
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(times))
    return JSON.parse(payload())
  }

  const walk = () => within(screen.getByRole('region', { name: 'Within a walk' }))

  it('adds lists of the other categories whose places have an address, and only on an existing category', async () => {
    const user = userEvent.setup()
    editor(hotels)
    expect(walk().getByText('None yet')).toBeInTheDocument()
    await user.click(walk().getByRole('button', { name: '+ Add a page' }))
    // Opened in place, to which page, how far and how grouped (board 17).
    const which = walk().getByRole('combobox', { name: 'Which page' }) as HTMLSelectElement
    expect([...which.options].map((o) => o.textContent)).toEqual(['Synagogues', 'Food'])
    cleanup()
    editor(null)
    expect(screen.queryByRole('region', { name: 'Within a walk' })).not.toBeInTheDocument()
  })

  it('sends the lists when they changed, 30 minutes and by distance unless chosen, and leaves them out when they didn’t', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(hotels, onSaved)
    expect(await save(user, onSaved, 1)).not.toHaveProperty('walkList')

    await user.click(walk().getByRole('button', { name: '+ Add a page' }))
    expect((await save(user, onSaved, 2)).walkList).toEqual([{ categoryId: 'synagogue', maxMinutes: 30 }])

    // A second list, of food, grouped by its Store Type; the first can't be
    // chosen again.
    await user.click(walk().getByRole('button', { name: '+ Add a page' }))
    const second = walk().getByRole('combobox', { name: 'Which page' }) as HTMLSelectElement
    expect([...second.options].map((o) => o.value)).toEqual(['restaurant'])
    const by = walk().getByRole('combobox', { name: 'Grouped by' }) as HTMLSelectElement
    expect([...by.options].map((o) => o.textContent)).toEqual(['Distance', 'Store Type'])
    await user.selectOptions(by, 'foodType')
    await user.click(walk().getByRole('button', { name: /^Synagogues/ }))
    expect(walk().getByRole('button', { name: /^Food/ })).toHaveTextContent('Up to 30 min · by Store Type')
    await user.selectOptions(walk().getByRole('combobox', { name: 'How far' }), '15')
    expect((await save(user, onSaved, 3)).walkList).toEqual([
      { categoryId: 'synagogue', maxMinutes: 15 },
      { categoryId: 'restaurant', maxMinutes: 30, groupBy: 'foodType' },
    ])
    // Every category listed: nothing left to add.
    expect(walk().queryByRole('button', { name: '+ Add a page' })).not.toBeInTheDocument()
  })

  it('shows the list saved before there could be several, and removing the last sends null', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor({ ...hotels, walkList: { categoryId: 'synagogue', maxMinutes: 45 } }, onSaved)
    await user.click(walk().getByRole('button', { name: /^Synagogues/ }))
    expect(walk().getByRole('combobox', { name: 'Which page' })).toHaveValue('synagogue')
    expect(walk().getByRole('combobox', { name: 'How far' })).toHaveValue('45')
    await user.click(walk().getByRole('button', { name: 'Take Synagogues off' }))
    expect((await save(user, onSaved, 1)).walkList).toBeNull()
  })
})

// Fields as the listing's boxes (boards 17-19): the admin's own boxes, the
// main card and the Shabbos card (listingParts.ts). Sent only when changed.
describe('CategoryEditor — Fields, in boxes', () => {
  const refuah = baseCategory({
    id: 'hospital',
    label: 'Hospital',
    pluralLabel: 'Hospitals',
    detailFields: [
      { key: 'liaisons', label: 'Liaisons', type: 'contacts' },
      { key: 'pantry', label: 'Pantry', type: 'contacts' },
      { key: 'packages', label: 'Food packages', type: 'contacts' },
      { key: 'eruv', label: 'Eruv', type: 'select', renderAs: 'row', options: [{ value: 'uc', label: 'University City Eruv' }] },
    ],
  })
  const payload = () => (vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body
  const editor = (initial = refuah, onSaved = vi.fn()) =>
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={[initial]} onSaved={onSaved} onCancel={vi.fn()} />)
  const boxNames = ['Who to call', 'This Shabbos', 'Liaisons', 'Pantry', 'Food packages', 'Contact']

  it('lists the listing’s boxes in its order, each with what’s in it', () => {
    editor({ ...refuah, listingParts: { boxes: [{ title: 'Who to call', fields: ['liaisons'] }], shabbos: { fields: ['eruv'], after: 1 } } })
    const rows = boxesShown().map(([name]) => name)
    expect(boxNames.filter((n) => rows.some((r) => r.startsWith(n))).sort((a, b) => rows.findIndex((r) => r.startsWith(a)) - rows.findIndex((r) => r.startsWith(b)))).toEqual([
      'Who to call',
      'This Shabbos',
      'Pantry',
      'Food packages',
      'Contact',
    ])
    expect(shownIn('This Shabbos')).toEqual(['Eruv'])
  })

  it('adds a box, named, and moves a list of contacts into it from the keyboard', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(refuah, onSaved)
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload())).not.toHaveProperty('listingParts')

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [] }))))
    // In place, at the end, no screen to name it on (board B).
    await user.click(screen.getByRole('button', { name: 'Add a box' }))
    expect(screen.queryByRole('heading', { name: 'Add a box' })).toBeNull()
    // Open, its name ready to type, nothing in it yet.
    expect(await screen.findByText('Nothing in it yet')).toBeInTheDocument()
    const title = screen.getByPlaceholderText('New box')
    expect(title).toHaveFocus()
    expect(title).toHaveValue('')
    await user.type(title, 'Kosher food')
    await user.keyboard('{Enter}')
    // Pantry, down through every box after it (each takes it too, the
    // user, Nov 10) into Kosher food.
    await openBox(user, 'Pantry')
    // The field's handle, under the box's own.
    screen.getAllByRole('button', { name: 'Move Pantry' }).at(-1)!.focus()
    for (let i = 0; i < 40 && !shownIn('Kosher food')?.includes('Pantry'); i++) await user.keyboard('{ArrowDown}')
    expect(boxesShown().map(([name]) => name)).not.toContain('Pantry')
    expect(shownIn('Kosher food')).toEqual(['Pantry'])
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
    const saved = JSON.parse(payload()).listingParts
    expect(saved.boxes.at(-1)).toEqual({ title: 'Kosher food', fields: ['pantry'] })
    expect(saved.order.at(-1)).toBe('box')
  })

  // The user, Nov 10: any box comes off, its fields with it.
  it('takes any box off, Contact included, its fields off the page with it', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [] }))))
    const page = baseCategory({ detailFields: [{ key: 'night', label: 'Night line', type: 'tel' }, { key: 'about', label: 'About us', type: 'textarea' }] })
    renderWithProviders(<CategoryEditor token="t" initial={page} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
    await openBox(user, 'Contact')
    await user.click(screen.getByRole('button', { name: 'Take Contact off' }))
    expect(screen.queryByRole('button', { name: 'Contact' })).toBeNull()
    // Save says what answers go with it, as for any field taken off.
    vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 4, phone: 2, fields: { night: 1 } } })
    await saveNow(user)
    expect(await screen.findByText(/Address — 4 listings/)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /clear and save/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body)
    const keys = body.fields.map((f: { key: string }) => f.key)
    expect(keys).not.toContain('night')
    expect(keys).toContain('about')
    expect(body.hasAddress).toBe(false)
    expect(body.hasPhone).toBe(false)
  })

  it('puts a field made from a box in that box', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [] }))))
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor({ ...refuah, listingParts: { boxes: [{ title: 'Who to call', fields: ['liaisons'] }] } }, onSaved)
    await openBox(user, 'Who to call')
    await user.click(addField())
    await user.type(await screen.findByRole('searchbox', { name: 'Search fields' }), 'Night line')
    await user.click(screen.getByRole('button', { name: 'Make your own: Night line' }))
    await user.click(screen.getByRole('button', { name: /^Text/ }))
    await screen.findByRole('heading', { name: /^Night line/ })
    history.back()
    await screen.findByRole('heading', { name: 'Hospitals' })
    expect(screen.getByRole('button', { name: /^Night line/ })).toBeInTheDocument()
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(JSON.parse(payload()).listingParts).toEqual({ boxes: [{ title: 'Who to call', fields: ['liaisons', 'night_line'] }] })
  })

  it('takes a box off, its fields with it, and with nothing left sends null', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor({ ...refuah, listingParts: { shabbos: { fields: ['eruv'] } } }, onSaved)
    await openBox(user, 'This Shabbos')
    await user.click(screen.getByRole('button', { name: 'Take This Shabbos off' }))
    expect(screen.queryByRole('button', { name: 'This Shabbos' })).not.toBeInTheDocument()
    vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 0, phone: 0, fields: {} } })
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload()).listingParts).toBeNull()
    expect(JSON.parse(payload()).fields.map((f: { key: string }) => f.key)).not.toContain('eruv')
  })
})

// Boards 20-23: the card a place is listed on, a row for each of its lines.
describe('CategoryEditor — Before it’s opened', () => {
  const opt = (...labels: string[]) => labels.map((l) => ({ value: l.toLowerCase(), label: l }))
  const food = baseCategory({
    id: 'restaurant',
    label: 'Restaurant',
    pluralLabel: 'Restaurants',
    upvotesEnabled: true,
    detailFields: [
      { key: 'photo', label: 'Photo', type: 'image', renderAs: 'row' },
      { key: 'short', label: 'Short Description', type: 'text', renderAs: 'row', showInHeader: true, headerMaxLength: 27 },
      { key: 'food', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true, options: opt('Meat', 'Dairy', 'Parve') },
      { key: 'store', label: 'Store Type', type: 'select', renderAs: 'badge', filterable: true, options: opt('Restaurant', 'Bakery') },
      { key: 'delivery', label: 'Delivery Details', type: 'text', renderAs: 'row' },
      { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row', filterable: true },
    ],
  })
  const fields = () => JSON.parse((vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body).fields as CategoryConfig['detailFields']
  const editor = (onSaved = vi.fn()) =>
    renderWithProviders(<CategoryEditor token="t" initial={food} siblings={[food]} onSaved={onSaved} onCancel={vi.fn()} />)
  const card = () => within(screen.getByRole('region', { name: 'Before it’s opened' }))

  it('sums up each line, and opens one to what the card works out and what was chosen', async () => {
    const user = userEvent.setup()
    editor()
    expect(card().getByRole('button', { name: 'First line' })).toHaveAccessibleDescription('Photo, Name · where it is, upvotes')
    expect(card().getByRole('button', { name: 'Second line' })).toHaveAccessibleDescription('Open or opens at, Distance, Food Type, Store Type')
    expect(card().getByRole('button', { name: 'Third line' })).toHaveAccessibleDescription('Not confirmed by anyone yet, Short Description')
    await user.click(card().getByRole('button', { name: 'Second line' }))
    expect(card().getAllByText('Automatic')).toHaveLength(2)
    expect(card().getByText('Meat, Dairy, Parve')).toBeInTheDocument()
    expect(card().queryByRole('button', { name: 'Move Distance' })).not.toBeInTheDocument()
  })

  it('takes a field off the card and leaves it a filter', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(onSaved)
    await user.click(card().getByRole('button', { name: 'Second line' }))
    await user.click(card().getByRole('button', { name: 'Take Food Type off' }))
    expect(card().queryByText('Meat, Dairy, Parve')).not.toBeInTheDocument()
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(fields().find((f) => f.key === 'food')).toMatchObject({ onCard: false, filterable: true })
  })

  it('moves a field up the line, never above what the card works out', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(onSaved)
    await user.click(card().getByRole('button', { name: 'Second line' }))
    card().getByRole('button', { name: 'Move Store Type' }).focus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    const rows = card()
      .getAllByText(/^(Distance|Store Type|Food Type)$/)
      .map((el) => el.textContent)
    expect(rows).toEqual(['Distance', 'Store Type', 'Food Type'])
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(fields().map((f) => f.key).filter((k) => k !== 'photo')).toEqual(['short', 'store', 'food', 'delivery', 'hours'])
  })

  it('shows another short line on the third line, from the page’s own (board 23)', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(onSaved)
    await user.click(card().getByRole('button', { name: 'Third line' }))
    await user.click(card().getByRole('button', { name: '+ Show a field' }))
    await screen.findByRole('heading', { name: 'Show on the third line' })
    expect(screen.getByText('On the card')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Short Description/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Delivery Details/ }))
    await screen.findByRole('heading', { name: 'Restaurants' })
    expect(card().getByRole('button', { name: 'Take Delivery Details off' })).toBeInTheDocument()
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(fields().find((f) => f.key === 'delivery')).toMatchObject({ showInHeader: true })
  })

  it('takes the photo off for initials, and puts it back', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(onSaved)
    await user.click(card().getByRole('button', { name: 'First line' }))
    await user.click(card().getByRole('button', { name: 'Take Photo off' }))
    expect(card().getByRole('button', { name: 'First line' })).toBeInTheDocument()
    expect(card().getByRole('button', { name: '+ Show the photo' })).toBeInTheDocument()
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(fields().find((f) => f.key === 'photo')).toMatchObject({ onCard: false })
    await user.click(card().getByRole('button', { name: '+ Show the photo' }))
    expect(card().getByRole('button', { name: 'Take Photo off' })).toBeInTheDocument()
  })
})

// Boards 7-12: + Add a field lists every page's fields to look at and add,
// or a kind to make one of.
describe('CategoryEditor — + Add a field', () => {
  const everywhere = [
    {
      community: 'other',
      category: baseCategory({
        id: 'synagogue',
        pluralLabel: 'Synagogues',
        detailFields: [{ key: 'denomination', label: 'Denomination', type: 'select', renderAs: 'badge', options: ['Orthodox', 'Conservative'].map((o) => ({ value: o, label: o })) }],
      }),
    },
    {
      community: 'other',
      category: baseCategory({ id: 'hospital', pluralLabel: 'Hospitals', detailFields: [{ key: 'pantry', label: 'Pantry', type: 'contacts', renderAs: 'row' }] }),
    },
  ]
  const groceries = baseCategory({ detailFields: [{ key: 'pantry', label: 'Pantry', type: 'contacts', renderAs: 'row' }] })

  // Contact offers any field, the basics too.
  async function openAdd(user: ReturnType<typeof userEvent.setup>, box = 'Contact') {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: everywhere }))))
    renderWithProviders(<CategoryEditor token="t" initial={groceries} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await openBox(user, box)
    await user.click(addField())
    await screen.findByRole('heading', { name: `Add a field to ${box}` })
  }
  const listed = () => screen.getAllByRole('button').map((b) => b.textContent).filter((t) => t?.includes('Like '))

  it('lists every page’s fields but the ones this page has, with the basics', async () => {
    const user = userEvent.setup()
    await openAdd(user)
    expect(await screen.findByText('Denomination')).toBeInTheDocument()
    expect(screen.queryByText('Pantry')).toBeNull()
    expect(screen.getByText('Synagogues · Orthodox and Conservative')).toBeInTheDocument()
    cleanup()
    history.replaceState(null, '', '/')
    await openAdd(user, 'Contact')
    expect(await screen.findByText('Hours')).toBeInTheDocument()
    expect(screen.queryByText('Address')).toBeNull()
  })

  // The list has the screen to itself (board 7); a field before adding has
  // the page beside it, with the field on it (canvas, Nov 7).
  it('takes the page from beside the list, and shows how a field looks before adding', async () => {
    const user = userEvent.setup()
    // A computer: the page sits beside the settings.
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    await openAdd(user)
    expect(screen.queryByRole('complementary', { name: 'Preview' })).toBeNull()
    await user.click(await screen.findByRole('button', { name: /^Denomination/ }))
    // How it looks (boards 33d-34c), the field on a made-up place.
    const looks = screen.getByRole('complementary', { name: 'How it looks' })
    expect(within(looks).getByRole('tabpanel', { name: 'List' }).querySelector('mark')).toHaveTextContent('Orthodox')
    // Places named for what they are, never for an answer about them.
    expect(looks).not.toHaveTextContent('An orthodox')
    expect(screen.queryByRole('complementary', { name: 'Preview' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add to Groceries' }))
    await screen.findByRole('heading', { name: 'Groceries' })
    expect(screen.getByRole('complementary', { name: 'Preview' })).toBeInTheDocument()
  })

  // Before adding, the field is only in the preview's copy: full size keeps it.
  it('keeps a field not added yet when its preview opens full size', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    await openAdd(user)
    await user.click(await screen.findByRole('button', { name: /^Denomination/ }))
    await user.click(screen.getByRole('button', { name: 'See the whole page' }))
    expect(screen.getByTestId('preview')).toHaveAttribute('data-focus', 'denomination')
    expect(screen.getByTestId('preview').dataset.fields!.split(' ')).toContain('denomination')
  })

  it('narrows to one page’s fields from the page menu', async () => {
    const user = userEvent.setup()
    await openAdd(user)
    await screen.findByText('Denomination')
    await user.click(screen.getByRole('button', { name: 'Which page: All pages' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Hospitals' }))
    expect(screen.queryByText('Denomination')).toBeNull()
  })

  it('shows a field before adding it, then adds it to the page', async () => {
    const user = userEvent.setup()
    await openAdd(user)
    await user.click(await screen.findByRole('button', { name: /^Denomination/ }))
    expect(screen.getByRole('heading', { name: /^Denomination\s*Choices$/ })).toBeInTheDocument()
    // What it is first, then what a page can change (canvas, Nov 7).
    const what = screen.getByRole('region', { name: 'What this is' })
    expect(what).toHaveTextContent('Which movement a place belongs to.')
    expect(within(what).getByRole('list', { name: 'Choices' })).toHaveTextContent('OrthodoxConservative')
    const change = screen.getByRole('region', { name: 'What you can change' })
    expect(within(change).getByRole('switch', { name: 'In the filter' })).toHaveAttribute('aria-checked', 'false')
    // What's changed before adding comes with it.
    await user.click(within(change).getByRole('switch', { name: 'In the filter' }))
    await user.click(screen.getByRole('button', { name: 'Add to Groceries' }))
    expect(await screen.findByRole('heading', { name: 'Groceries' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Denomination/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    // On a phone, back to the Fields box still open.
    expect(screen.getByRole('button', { name: /^Fields/, expanded: true })).toBeInTheDocument()
    // It came with the filter switched on before adding.
    await user.click(screen.getByRole('button', { name: /^Denomination/ }))
    expect(screen.getByRole('switch', { name: 'In the filter' })).toHaveAttribute('aria-checked', 'true')
  })

  // The user, Nov 5: an hours field said only its page, and looked like an
  // empty text box before adding it. Without room for the page beside (a
  // phone), board 11's drawn samples stay.
  it('says what kind an hours field is, and draws the week to fill in', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const mikvah = { community: 'other', category: baseCategory({ id: 'mikvah', pluralLabel: 'Mikvah', detailFields: [{ key: 'w_hours', label: 'Women’s Hours', type: 'hours', renderAs: 'row' }] }) }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [mikvah] }))))
    renderWithProviders(<CategoryEditor token="t" initial={groceries} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await openBox(user, 'Contact')
    await user.click(addField())
    expect(await screen.findByText('Mikvah · hours')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Women’s Hours/ }))
    const adding = screen.getByRole('region', { name: 'On Add a place' })
    expect(within(adding).getByText('Sunday')).toBeInTheDocument()
    expect(within(adding).getAllByText('Opens – Closes')).toHaveLength(3)
  })

  it('adds a basic as its own setting', async () => {
    const user = userEvent.setup()
    await openAdd(user, 'Contact')
    await user.click(await screen.findByRole('button', { name: /^Website/ }))
    await user.click(screen.getByRole('button', { name: 'Add to Groceries' }))
    await screen.findByRole('heading', { name: 'Groceries' })
    // Its box open, to see it there.
    expect(screen.getByRole('button', { name: /^Website/ })).toBeInTheDocument()
  })

  it('offers to make what nothing matches, of a kind picked, and opens it named', async () => {
    const user = userEvent.setup()
    await openAdd(user, 'Contact')
    await screen.findByText('Hours')
    await user.type(screen.getByRole('searchbox', { name: 'Search fields' }), 'parking')
    expect(screen.getByText('No ready-made field called “parking”')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Make your own: Parking' }))
    expect(screen.getByRole('region', { name: 'Make your own' })).toBeInTheDocument()
    expect(listed()).toEqual([
      'ChoicesLike Food Type: Meat, Dairy, Parve',
      'Yes or noLike Shabbat friendly',
      'A list of itemsLike Main dishes',
      'TextLike Delivery Details',
      'LinkLike Join group',
    ])
    await user.click(screen.getByRole('button', { name: /^Yes or no/ }))
    expect(await screen.findByRole('heading', { name: /^Parking\s*Yes or no$/ })).toBeInTheDocument()
  })

  // The user, Nov 9: "I'll click add a field under a specific box and it gets
  // added under a different box." Each box offers only what lands in it.
  it('offers from About any field, a filter, and one that is a box of its own', async () => {
    const user = userEvent.setup()
    const hospital = { community: 'other', category: baseCategory({ id: 'hospital', pluralLabel: 'Hospitals', detailFields: [{ key: 'notes', label: 'Visiting notes', type: 'textarea' }, { key: 'liaisons', label: 'Liaisons', type: 'contacts', renderAs: 'row' }, { key: 'night', label: 'Night line', type: 'tel' }] }) }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [...everywhere, hospital] }))))
    const page = baseCategory({ detailFields: [{ key: 'about', label: 'About us', type: 'textarea' }] })
    renderWithProviders(<CategoryEditor token="t" initial={page} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await openBox(user, 'About')
    await user.click(addField())
    await screen.findByRole('heading', { name: 'Add a field to About' })
    expect(await screen.findByText('Visiting notes')).toBeInTheDocument()
    // Any field (the user, Nov 10), one that would be Contact's too.
    expect(screen.getByText('Night line')).toBeInTheDocument()
    // A filter too, now there's no Top (Nov 10), and one that is a box
    // itself (the user, Nov 10: "anything takes anything").
    expect(screen.getByText('Denomination')).toBeInTheDocument()
    expect(screen.getByText('Liaisons')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'In a box of their own' })).toBeNull()
    // A reload comes back to the same box's list.
    expect(new URLSearchParams(window.location.search).get('in')).toBe('about')
    await user.type(screen.getByRole('searchbox', { name: 'Search fields' }), 'parking')
    await user.click(screen.getByRole('button', { name: 'Make your own: Parking' }))
    expect(listed()).toEqual([
      'ChoicesLike Food Type: Meat, Dairy, Parve',
      'Yes or noLike Shabbat friendly',
      'A list of itemsLike Main dishes',
      'TextLike Delivery Details',
      'LinkLike Join group',
    ])
  })

  it('puts a short field added from About in About', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [] }))))
    const page = baseCategory({ detailFields: [{ key: 'about', label: 'About us', type: 'textarea' }] })
    renderWithProviders(<CategoryEditor token="t" initial={page} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
    await openBox(user, 'About')
    await user.click(addField())
    await user.type(await screen.findByRole('searchbox', { name: 'Search fields' }), 'Parking')
    await user.click(screen.getByRole('button', { name: 'Make your own: Parking' }))
    await user.click(screen.getByRole('button', { name: /^Link/ }))
    await screen.findByRole('heading', { name: /^Parking/ })
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(JSON.parse((vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body).listingParts).toEqual({ about: ['parking'] })
  })

  // The user, Nov 10: a list of contacts, the davening times, a list of
  // items can go in any of the admin's boxes.
  it('adds a field that is a box itself into one of the admin’s boxes', async () => {
    const user = userEvent.setup()
    const hospital = { community: 'other', category: baseCategory({ id: 'hospital', pluralLabel: 'Hospitals', detailFields: [{ key: 'notes', label: 'Visiting notes', type: 'textarea' }, { key: 'liaisons', label: 'Liaisons', type: 'contacts', renderAs: 'row' }, { key: 'w_hours', label: 'Women’s Hours', type: 'hours', audienceKey: 'women' }] }) }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [...everywhere, hospital] }))))
    const page = baseCategory({ detailFields: [{ key: 'about', label: 'About us', type: 'textarea' }] })
    renderWithProviders(<CategoryEditor token="t" initial={page} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await addBoxNamed(user, 'Visiting')
    await user.click(addField())
    expect(await screen.findByText('Liaisons')).toBeInTheDocument()
    // A mikvah section's own field comes with its section, not alone.
    expect(screen.queryByText('Women’s Hours')).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Liaisons/ }))
    await user.click(await screen.findByRole('button', { name: /^Add to / }))
    await screen.findByRole('heading', { name: 'Groceries' })
    expect(boxesShown().at(-1)?.[1]).toEqual(['Liaisons'])
    await saveNow(user)
    await waitFor(() => expect(vi.mocked(fetchJson)).toHaveBeenCalled())
    expect(JSON.parse((vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body).listingParts.boxes).toEqual([{ title: 'Visiting', fields: ['liaisons'] }])
  })

  // The user, Nov 10: "we should also be able to move all fields. Including
  // address and phone."
  it('adds the phone from one of the admin’s boxes into that box', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: everywhere }))))
    const page = baseCategory({ hasPhone: false, detailFields: [{ key: 'about', label: 'About us', type: 'textarea' }] })
    renderWithProviders(<CategoryEditor token="t" initial={page} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await addBoxNamed(user, 'Call us')
    await user.click(addField())
    await user.click(await screen.findByRole('button', { name: /^Phone/ }))
    await user.click(await screen.findByRole('button', { name: /^Add to / }))
    // The new box, its name still in the box it's typed in.
    await waitFor(() => expect(boxesShown().at(-1)?.[1]).toEqual(['Phone']))
    expect(shownIn('Contact')).toEqual(['Address'])
    await saveNow(user)
    await waitFor(() => expect(vi.mocked(fetchJson)).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body)
    expect(body.hasPhone).toBe(true)
    expect(body.listingParts.boxes).toEqual([{ title: 'Call us', fields: ['@phone'] }])
  })
})

// The user, Nov 5: the boxes that move are renamed in place too, the new
// name saved on the field it comes from.
describe('CategoryEditor — renaming the listing’s own boxes', () => {
  const food = baseCategory({
    id: 'restaurant',
    label: 'Food',
    pluralLabel: 'Food',
    detailFields: [
      { key: 'kosherCert', label: 'Kosher Certification', type: 'select', renderAs: 'badge', filterable: true, caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' }, options: [{ value: 'IKC', label: 'IKC' }] },
      { key: 'kosherPartial', label: 'Everything here is kosher', type: 'boolean', renderAs: 'hidden' },
      { key: 'kosherNote', label: 'What isn’t kosher?', type: 'textarea', renderAs: 'hidden' },
      { key: 'delivery_whatsapp_group', label: 'Delivery WhatsApp Group', type: 'url', leadBox: { title: 'Delivery', text: 'delivery_details' } },
      { key: 'delivery_details', label: 'Delivery Details', type: 'textarea' },
      { key: 'dishes', label: 'Main dishes', type: 'tags', renderAs: 'badge', showCountInHeader: true },
    ],
  })
  const fields = () => JSON.parse((vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body).fields as CategoryConfig['detailFields']
  const rename = async (user: ReturnType<typeof userEvent.setup>, from: string, to: string) => {
    await openBox(user, from)
    await user.click(screen.getByRole('button', { name: `Rename ${from}` }))
    const name = within(screen.getByRole('region', { name: 'Fields' })).getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, `${to}{Enter}`)
  }

  // The user, Nov 10, changing Nov 7's "lock the name": "existing boxes not
  // being editable". A ready-made field's box is renamed too, and becomes
  // one of the admin's, in its place; the field keeps its own name.
  it('renames a ready-made field’s box, which becomes one of the admin’s in its place', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={food} siblings={[food]} onSaved={onSaved} onCancel={vi.fn()} />)
    expect(boxesShown().slice(0, 3)).toEqual([['Delivery', ['Delivery Details']], ['What isn’t kosher', ['Kosher Certification']], ['Main dishes', ['Main dishes']]])
    for (const name of ['Delivery', 'What isn’t kosher', 'Main dishes']) expect(screen.getByRole('button', { name: `Rename ${name}` })).toBeInTheDocument()
    await rename(user, 'Main dishes', 'Today’s food')
    expect(boxesShown().slice(0, 3)).toEqual([['Delivery', ['Delivery Details']], ['What isn’t kosher', ['Kosher Certification']], ['Today’s food', ['Main dishes']]])
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body)
    expect(body.listingParts.boxes).toEqual([{ title: 'Today’s food', fields: ['dishes'] }])
    expect(body.listingParts.order.slice(0, 3)).toEqual(['lead:delivery_whatsapp_group', 'caveat', 'box'])
    expect(fields().find((f) => f.key === 'dishes')!.label).toBe('Main dishes')
  })

  it('offers every field from a ready-made field’s box’s + Add a field, and puts it there', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={food} siblings={[food]} onSaved={onSaved} onCancel={vi.fn()} />)
    const hospital = { community: 'other', category: baseCategory({ id: 'hospital', pluralLabel: 'Hospitals', detailFields: [{ key: 'liaisons', label: 'Liaisons', type: 'contacts', renderAs: 'row' }, { key: 'night', label: 'Night line', type: 'tel' }] }) }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [hospital] }))))
    await user.click(screen.getByRole('button', { name: 'Add a field to Main dishes' }))
    await screen.findByRole('heading', { name: 'Add a field to Main dishes' })
    expect(await screen.findByText('Liaisons')).toBeInTheDocument()
    expect(screen.getByText('Night line')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search fields' }), 'Parking')
    await user.click(screen.getByRole('button', { name: 'Make your own: Parking' }))
    await user.click(screen.getByRole('button', { name: /^Link/ }))
    await screen.findByRole('heading', { name: /^Parking/ })
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body)
    expect(body.listingParts.boxes).toEqual([{ title: 'Main dishes', fields: ['dishes', 'parking'] }])
  })

  it('renames the boxes of fields made here, and saves each on its field', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    const madeHere = { ...food, detailFields: food.detailFields.map((f) => ({ ...f, madeHere: true })) }
    renderWithProviders(<CategoryEditor token="t" initial={madeHere} siblings={[madeHere]} onSaved={onSaved} onCancel={vi.fn()} />)
    await rename(user, 'Main dishes', 'Dishes')
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const by = new Map(fields().map((f) => [f.key, f]))
    expect(by.get('dishes')!.label).toBe('Dishes')
  })
})

// The user, Nov 8: some communities never have a place that's only partly
// kosher, so a hechsher's "Everything here is kosher?" can be turned off.
describe('CategoryEditor — a hechsher’s kosher questions', () => {
  const cert: CategoryField = { key: 'kosherCert', label: 'Kosher Certification', type: 'select', renderAs: 'badge', multiSelect: true, caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' }, options: [{ value: 'OU', label: 'OU' }] }
  const [flag, note] = kosherQuestions()
  const food = baseCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', detailFields: [cert, flag, note] })
  // Without the photo every page is saved with.
  const saved = () => (JSON.parse((vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body).fields as CategoryField[]).filter((f) => f.type !== 'image')
  const openCert = async (user: ReturnType<typeof userEvent.setup>) => {
    // In its kosher box, or in Contact once its questions are off.
    await openBox(user, screen.queryByRole('button', { name: 'What isn’t kosher', expanded: false }) ? 'What isn’t kosher' : 'Contact')
    await user.click(screen.getByRole('button', { name: /^Kosher Certification(?! URL)/ }))
  }

  it('turned off, the page stops asking both; turned on, asks them as Food does', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={food} siblings={[food]} onSaved={onSaved} onCancel={vi.fn()} />)
    await openCert(user)
    await user.click(screen.getByRole('switch', { name: 'Everything here is kosher?' }))
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(saved().map((f) => f.key)).toEqual(['kosherCert'])
    expect(saved()[0].caveat).toBeUndefined()
  })

  it('turned on where it was off, adds both questions', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    const without = { ...food, detailFields: [{ ...cert, caveat: undefined }] }
    renderWithProviders(<CategoryEditor token="t" initial={without} siblings={[without]} onSaved={onSaved} onCancel={vi.fn()} />)
    await openCert(user)
    await user.click(screen.getByRole('switch', { name: 'Everything here is kosher?' }))
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(saved()).toEqual([{ ...cert, caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' } }, flag, note].map((f) => expect.objectContaining(f)))
  })

  it('turned off before adding, comes without them', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    const groceries = baseCategory({ detailFields: [] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [{ community: 'philly', category: food }] }))))
    renderWithProviders(<CategoryEditor token="t" initial={groceries} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
    await addBoxNamed(user, 'Kosher')
    await user.click(addField())
    await user.click(await screen.findByRole('button', { name: /^Kosher Certification(?! URL)/ }))
    await user.click(screen.getByRole('switch', { name: 'Everything here is kosher?' }))
    await user.click(screen.getByRole('button', { name: /^Add to / }))
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(saved().map((f) => f.label)).toEqual(['Kosher Certification'])
  })

  // The certificate link comes with its field, with a switch (the user, Nov 9).
  const link: CategoryField = { key: 'k', label: 'Kosher Certification URL', type: 'url', renderAs: 'row', linkLabel: 'Certification', filterable: false }

  it('the certificate link’s switch takes it off, and puts it back next to its field', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    const short: CategoryField = { key: 'short', label: 'Short Description', type: 'text', renderAs: 'row' }
    const withLink = { ...food, detailFields: [cert, short, flag, note, link] }
    renderWithProviders(<CategoryEditor token="t" initial={withLink} siblings={[withLink]} onSaved={onSaved} onCancel={vi.fn()} />)
    await openCert(user)
    const linkSwitch = () => screen.getByRole('switch', { name: 'Link to the certificate' })
    expect(linkSwitch()).toHaveAttribute('aria-checked', 'true')
    await user.click(linkSwitch())
    expect(linkSwitch()).toHaveAttribute('aria-checked', 'false')
    await user.click(linkSwitch())
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    // The link goes back right after its field (and its kosher questions).
    expect(saved().map((f) => f.key)).toEqual(['kosherCert', 'kosherPartial', 'kosherNote', 'k', 'short'])
  })

  it('switched off, the page stops asking for the link', async () => {
    // Save checks first whether places lose a link; none have one here.
    vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 0, phone: 0, fields: { k: 0 } } })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    const withLink = { ...food, detailFields: [cert, flag, note, link] }
    renderWithProviders(<CategoryEditor token="t" initial={withLink} siblings={[withLink]} onSaved={onSaved} onCancel={vi.fn()} />)
    await openCert(user)
    await user.click(screen.getByRole('switch', { name: 'Link to the certificate' }))
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(saved().map((f) => f.key)).toEqual(['kosherCert', 'kosherPartial', 'kosherNote'])
  })

  it('added from another page, brings its link unless switched off', async () => {
    for (const keep of [true, false]) {
      const onSaved = vi.fn()
      const user = userEvent.setup()
      const groceries = baseCategory({ detailFields: [] })
      const withLink = { ...food, detailFields: [cert, flag, note, link] }
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [{ community: 'philly', category: withLink }] }))))
      renderWithProviders(<CategoryEditor token="t" initial={groceries} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
      await addBoxNamed(user, 'Kosher')
      await user.click(addField())
      expect(screen.queryByRole('button', { name: /^Kosher Certification URL/ })).not.toBeInTheDocument()
      await user.click(await screen.findByRole('button', { name: /^Kosher Certification(?! URL)/ }))
      if (!keep) await user.click(screen.getByRole('switch', { name: 'Link to the certificate' }))
      await user.click(screen.getByRole('button', { name: /^Add to / }))
      await saveNow(user)
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(saved().map((f) => f.label)).toEqual(keep
        ? ['Kosher Certification', flag.label, note.label, 'Kosher Certification URL']
        : ['Kosher Certification', flag.label, note.label])
      cleanup()
      forgetReadyMade()
      vi.mocked(fetchJson).mockClear()
    }
  })
})

// Each screen has its own address, so a reload or a Back from another tab
// lands on it (the user, Nov 9: "these add a field pages seem to not
// register as a new page"). The browser's own ordering is proved in
// e2e-admin-write/editor-screens.spec.ts; this is what the editor reads.
describe('CategoryEditor — the screen is in the address', () => {
  const kosher = baseCategory({ detailFields: [{ key: 'kosher', label: 'Kosher certification', type: 'select', renderAs: 'badge', filterable: true, options: [{ value: 'OU', label: 'OU' }] }] })
  const open = (search: string) => {
    history.replaceState(null, '', `/philly/admin/categories/cat:grocery${search}`)
    renderWithProviders(<CategoryEditor token="t" initial={kosher} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
  }

  it('opens on the field, Add a field or the preview its address names', async () => {
    open('?field=kosher')
    expect(screen.getByRole('heading', { name: /^Kosher certification/ })).toBeInTheDocument()
    cleanup()
    open('?add=list')
    expect(await screen.findByRole('searchbox', { name: 'Search fields' })).toBeInTheDocument()
    cleanup()
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    open('?field=kosher&preview=1')
    expect(screen.getByTestId('preview')).toHaveAttribute('data-focus', 'kosher')
  })

  it('writes each screen it opens into the address, and Back goes by it', async () => {
    const user = userEvent.setup()
    open('')
    await openBox(user, 'Contact')
    await user.click(screen.getByRole('button', { name: /^Kosher certification/ }))
    await waitFor(() => expect(location.search).toBe('?field=kosher'))
    history.back()
    expect(await screen.findByRole('heading', { name: 'Groceries' })).toBeInTheDocument()
    expect(location.search).toBe('')
    history.forward()
    expect(await screen.findByRole('heading', { name: /^Kosher certification/ })).toBeInTheDocument()
  })

  it('reloaded on a Remove step, counts again and shows it', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 0, phone: 0, fields: { kosher: 12 } } })
    open('?field=kosher&remove=1')
    expect(await screen.findByRole('heading', { name: 'Remove Kosher certification from Groceries?' })).toBeInTheDocument()
    expect(screen.getByText('12 places').parentElement).toHaveTextContent('12 places lose their answer')
  })
})

// Nov 9, the user: "keep what we have but just have it on that category
// page that way someone can change it if they want." The Eruv page has
// Fields like every page (eruvFields.ts), and nothing it doesn't have:
// no Questions, no card, no audiences. Its places are eruvim, counted as
// Places counts them. (Until Nov 9 these were SingletonEditor's tests.)
describe('CategoryEditor — the Eruv page', () => {
  const page = withEruvFields({ id: 'eruv-information', label: 'Eruv', pluralLabel: 'Eruv', icon: '', description: '', detailFields: [], kind: 'eruv' })
  const payload = () =>
    vi.mocked(fetchJson)
      .mock.calls.map(([, init]) => JSON.parse(String((init as { body?: string } | undefined)?.body ?? '{}')))
      .filter((b) => 'fields' in b && Array.isArray(b.fields))
      .at(-1)
  const editor = (initial: CategoryConfig = page, onSaved = vi.fn()) =>
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={[initial]} onSaved={onSaved} onCancel={vi.fn()} />)

  beforeEach(() => {
    forgetReadyMade()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new Response(JSON.stringify(String(url).includes('/api/admin/eruvim') ? { ok: true, eruvim: [{ id: 'a', active: true }, { id: 'b', active: false }] } : { ok: true, pages: [] })),
      ),
    )
  })

  it('has the rows an eruv always had, in their boxes, and nothing a page of places has', () => {
    editor()
    // No Top (Nov 10): the name and whether it's up are the eruv's own.
    expect(screen.queryByRole('button', { name: 'Top' })).not.toBeInTheDocument()
    expect(shownIn('Where it goes')).toEqual(['Where it goes'])
    expect(shownIn('Contact')).toEqual(['Website', 'Hotline', 'Email alerts'])
    expect(screen.queryByText(/Photo/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Questions|Before it’s opened|Within a walk/ })).not.toBeInTheDocument()
  })

  it('counts the eruvim on the site, opening them in Places', async () => {
    editor()
    const link = await screen.findByRole('link', { name: '1 place' })
    expect(link.getAttribute('href')).toMatch(/\/admin\/places\?category=eruv-information$/)
  })

  it('on a phone, its preview is an address written through the router', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const user = userEvent.setup()
    editor()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(expect.stringMatching(/[?&]preview=1/), expect.anything()))
  })

  // A page never saved shows the defaults: its first save, of anything,
  // keeps them, Where it goes in its own box included.
  it('its first save keeps the four rows and their boxes', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(page, onSaved)
    await user.type(screen.getByLabelText('Name'), ' guide')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const sent = payload()
    expect(sent.fields.map((f: CategoryField) => f.key)).toEqual(['covers', 'website', 'hotline', 'alertsUrl'])
    expect(sent.listingParts).toEqual({ boxes: [{ title: 'Where it goes', fields: ['covers'] }] })
  })

  it('makes a field of its own, of a kind an eruv takes', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(page, onSaved)
    await openBox(user, 'Where it goes')
    await user.click(addField())
    await user.type(await screen.findByRole('searchbox', { name: 'Search fields' }), 'Certified by')
    await user.click(screen.getByRole('button', { name: 'Make your own: Certified by' }))
    expect(screen.getByRole('button', { name: /^Choices/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^A list of items/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Text/ }))
    await screen.findByRole('heading', { name: /^Certified by/ })
    history.back()
    await screen.findByRole('heading', { name: 'Eruv' })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(payload().fields.map((f: CategoryField) => f.key)).toEqual(['covers', 'website', 'hotline', 'alertsUrl', 'certified_by'])
  })

  // The user, Nov 9: "I'm not seeing the different views. Page, listing,
  // adding." An eruv is opened and edited, not added: Editing is its Edit
  // listing.
  const computer = () => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
  const tabs = () => within(screen.getByRole('group', { name: 'Preview of' })).getAllByRole('button').map((b) => b.textContent)
  const shown = () => screen.getByRole('complementary', { name: 'Preview' }).querySelector('iframe')!.contentDocument!.querySelector('[data-testid="preview-beside"]')?.getAttribute('data-view')

  it('previews the page, an opened eruv and its Edit listing', async () => {
    computer()
    const user = userEvent.setup()
    editor()
    expect(tabs()).toEqual(['Page', 'A listing', 'Editing'])
    await user.click(screen.getByRole('button', { name: 'A listing' }))
    await waitFor(() => expect(shown()).toBe('listing'))
    await user.click(screen.getByRole('button', { name: 'Editing' }))
    await waitFor(() => expect(shown()).toBe('adding'))
  })

  it('beside a field, shows where it is: an opened eruv and its Edit listing, not the list', async () => {
    computer()
    const user = userEvent.setup()
    editor()
    await openBox(user, 'Contact')
    await user.click(screen.getByRole('button', { name: /^Hotline/ }))
    expect(tabs()).toEqual(['A listing', 'Editing'])
    await waitFor(() => expect(shown()).toBe('listing'))
  })

  // The user, Nov 9: "when I add more fields I don't see the fields
  // existing showing up as options."
  it('offers the fields other pages have that an eruv can hold', async () => {
    const shuls: CategoryConfig = {
      id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', icon: '', description: '', kind: 'listing',
      detailFields: [
        { key: 'denomination', label: 'Denomination', type: 'select', options: [{ value: 'Orthodox', label: 'Orthodox' }] },
        { key: 'minyanim', label: 'Davening Times', type: 'minyanim' },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [{ community: 'philly', category: shuls }], eruvim: [] }))))
    const user = userEvent.setup()
    editor()
    await openBox(user, 'Contact')
    await user.click(addField())
    expect(await screen.findByRole('button', { name: /^Denomination/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Davening Times/ })).not.toBeInTheDocument()
  })
})
