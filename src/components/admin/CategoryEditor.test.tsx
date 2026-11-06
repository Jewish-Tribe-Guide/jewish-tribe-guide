// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryEditor } from './CategoryEditor'
import { forgetReadyMade } from './useReadyMade'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { CATEGORY_TEMPLATES } from '@/lib/categoryTemplates'
import { fetchJson } from '@/lib/fetchJson'
import { CATEGORY_CAPABILITY_DEFAULTS, type CategoryConfig } from '@/lib/categories'

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
  default: ({ category, inline, view }: { category: CategoryConfig; inline?: boolean; view?: string }) => (
    <p data-testid={inline ? 'preview-beside' : 'preview'} data-view={view}>
      {category.pluralLabel}
    </p>
  ),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
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

/** Opens one of Fields' boxes by its row (boards 17-19). */
async function openBox(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name, expanded: false }))
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
  // A screen's history entry left by one test isn't the next one's page.
  history.replaceState(null, '')
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
    expect(screen.getByRole('button', { name: 'Davening times' })).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Kosher food' })).toHaveAccessibleDescription('Pantry')
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
    expect(screen.queryByRole('button', { name: /^Kosher certification/ })).not.toBeInTheDocument()
    await openBox(user, 'Top')
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
    expect(screen.queryByLabelText('Words')).not.toBeInTheDocument()
    await user.click(within(link).getByRole('radio', { name: 'Yes' }))
    await user.type(screen.getByLabelText('Words'), 'Find more')
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
    expect(screen.getByLabelText('Words')).toHaveValue('Find more')
    await user.click(within(link).getByRole('radio', { name: 'No' }))
    expect(screen.queryByLabelText('Words')).not.toBeInTheDocument()
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
    await openBox(user, 'Top')
    await user.click(screen.getByRole('button', { name: '+ Add a field' }))
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
      await user.click(screen.getByRole('button', { name: /^Kosher Certification/ }))
      await user.click(screen.getByRole('button', { name: 'Remove this field' }))

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
      await openBox(user, 'Top')
      await user.click(screen.getByRole('button', { name: '+ Add a field' }))
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
          { key: 'type', label: 'Type', type: 'select', options: [{ value: 'Kosher', label: 'Kosher' }] },
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

  // Board 13: a field opened, the preview shows where it's filled in.
  it('shows Adding when a field opens, and only its own screen’s settings', async () => {
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
    await waitFor(() => expect(shown()).toBe('adding'))
    expect(screen.getByRole('button', { name: 'Adding' })).toHaveAttribute('aria-pressed', 'true')
    // The old form's settings are a superadmin's, under More.
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
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
  const boxNames = ['Top', 'Who to call', 'This Shabbos', 'Liaisons', 'Pantry', 'Food packages', 'Contact']

  it('lists the listing’s boxes in its order, each with what’s in it', () => {
    editor({ ...refuah, listingParts: { boxes: [{ title: 'Who to call', fields: ['liaisons'] }], shabbos: { fields: ['eruv'], after: 1 } } })
    const rows = screen.getAllByRole('button', { expanded: false }).map((b) => b.textContent!.trim())
    expect(boxNames.filter((n) => rows.some((r) => r.startsWith(n))).sort((a, b) => rows.findIndex((r) => r.startsWith(a)) - rows.findIndex((r) => r.startsWith(b)))).toEqual([
      'Top',
      'Who to call',
      'This Shabbos',
      'Pantry',
      'Food packages',
      'Contact',
    ])
    expect(screen.getByRole('button', { name: 'This Shabbos' })).toHaveAccessibleDescription('Eruv')
  })

  it('adds a box, named, and moves a list of contacts into it from the keyboard', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(refuah, onSaved)
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload())).not.toHaveProperty('listingParts')

    await user.click(screen.getByRole('button', { name: '+ Add a box' }))
    // Open, its name ready to type over, nothing in it yet (board 19).
    expect(screen.getByText('Nothing in it yet')).toBeInTheDocument()
    const title = screen.getByDisplayValue('New box')
    expect(title).toHaveFocus()
    await user.clear(title)
    await user.type(title, 'Kosher food')
    await user.keyboard('{Enter}')
    // Pantry, up past Liaisons (which can't take it) into Kosher food.
    await openBox(user, 'Pantry')
    screen.getByRole('button', { name: 'Move Pantry' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(screen.queryByRole('button', { name: 'Pantry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kosher food' })).toHaveAccessibleDescription('Pantry')
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
    expect(JSON.parse(payload()).listingParts).toEqual({ boxes: [{ title: 'Kosher food', fields: ['pantry'] }] })
  })

  it('puts a field made from a box in that box', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [] }))))
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor({ ...refuah, listingParts: { boxes: [{ title: 'Who to call', fields: ['liaisons'] }] } }, onSaved)
    await openBox(user, 'Who to call')
    await user.click(screen.getByRole('button', { name: '+ Add a field' }))
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

  it('takes a box off, and with nothing left sends null', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor({ ...refuah, listingParts: { shabbos: { fields: ['eruv'] } } }, onSaved)
    await openBox(user, 'This Shabbos')
    await user.click(screen.getByRole('button', { name: 'Take This Shabbos off' }))
    expect(screen.queryByRole('button', { name: 'This Shabbos' })).not.toBeInTheDocument()
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload()).listingParts).toBeNull()
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

  async function openAdd(user: ReturnType<typeof userEvent.setup>) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: everywhere }))))
    renderWithProviders(<CategoryEditor token="t" initial={groceries} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await openBox(user, 'Top')
    await user.click(screen.getByRole('button', { name: '+ Add a field' }))
    await screen.findByRole('heading', { name: 'Add a field' })
  }
  const listed = () => screen.getAllByRole('button').map((b) => b.textContent).filter((t) => t?.includes('Like '))

  it('lists every page’s fields but the ones this page has, with the basics', async () => {
    const user = userEvent.setup()
    await openAdd(user)
    expect(await screen.findByText('Denomination')).toBeInTheDocument()
    expect(screen.queryByText('Pantry')).toBeNull()
    expect(screen.getByText('Synagogues · Orthodox and Conservative')).toBeInTheDocument()
    expect(screen.queryByText('Address')).toBeNull()
    expect(screen.getByText('Hours')).toBeInTheDocument()
  })

  // Boards 7-12 have the picker to themselves: board 11 is its own preview.
  it('takes the page from beside it, and puts it back after', async () => {
    const user = userEvent.setup()
    // A computer: the page sits beside the settings.
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    await openAdd(user)
    expect(screen.queryByRole('complementary', { name: 'Preview' })).toBeNull()
    await user.click(await screen.findByRole('button', { name: /^Denomination/ }))
    expect(screen.queryByRole('complementary', { name: 'Preview' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add to Groceries' }))
    await screen.findByRole('heading', { name: 'Groceries' })
    expect(screen.getByRole('complementary', { name: 'Preview' })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Denomination' })).toBeInTheDocument()
    expect(screen.getByText('On Synagogues')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'In the filter' })).getByText('Conservative')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add to Groceries' }))
    expect(await screen.findByRole('heading', { name: 'Groceries' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Denomination/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    // On a phone, back to the Fields box still open.
    expect(screen.getByRole('button', { name: /^Fields/, expanded: true })).toBeInTheDocument()
  })

  // The user, Nov 5: an hours field said only its page, and looked like an
  // empty text box before adding it.
  it('says what kind an hours field is, and draws the week to fill in', async () => {
    const user = userEvent.setup()
    const mikvah = { community: 'other', category: baseCategory({ id: 'mikvah', pluralLabel: 'Mikvah', detailFields: [{ key: 'w_hours', label: 'Women’s Hours', type: 'hours', renderAs: 'row' }] }) }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, pages: [mikvah] }))))
    renderWithProviders(<CategoryEditor token="t" initial={groceries} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await openBox(user, 'Top')
    await user.click(screen.getByRole('button', { name: '+ Add a field' }))
    expect(await screen.findByText('Mikvah · hours')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Women’s Hours/ }))
    const adding = screen.getByRole('region', { name: 'On Add a place' })
    expect(within(adding).getByText('Sunday')).toBeInTheDocument()
    expect(within(adding).getAllByText('Opens – Closes')).toHaveLength(3)
  })

  it('adds a basic as its own setting', async () => {
    const user = userEvent.setup()
    await openAdd(user)
    await user.click(await screen.findByRole('button', { name: /^Website/ }))
    await user.click(screen.getByRole('button', { name: 'Add to Groceries' }))
    await screen.findByRole('heading', { name: 'Groceries' })
    // Its box open, to see it there.
    expect(screen.getByRole('button', { name: /^Website/ })).toBeInTheDocument()
  })

  it('offers to make what nothing matches, of a kind picked, and opens it named', async () => {
    const user = userEvent.setup()
    await openAdd(user)
    await screen.findByText('Denomination')
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
    await user.click(screen.getByRole('button', { name: to, expanded: true }))
  }

  it('renames Delivery, What isn’t kosher and Main dishes, and saves each on its field', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={food} siblings={[food]} onSaved={onSaved} onCancel={vi.fn()} />)
    await rename(user, 'Delivery', 'Get it delivered')
    await rename(user, 'What isn’t kosher', 'Not kosher here')
    await rename(user, 'Main dishes', 'Dishes')
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const by = new Map(fields().map((f) => [f.key, f]))
    expect(by.get('delivery_whatsapp_group')!.leadBox).toEqual({ title: 'Get it delivered', text: 'delivery_details' })
    expect(by.get('kosherCert')!.caveat).toEqual({ flagField: 'kosherPartial', noteField: 'kosherNote', title: 'Not kosher here' })
    expect(by.get('dishes')!.label).toBe('Dishes')
  })
})
