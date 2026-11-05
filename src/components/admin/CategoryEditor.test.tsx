// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryEditor } from './CategoryEditor'
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

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn() }))
// The page beside the settings: the draft it's given, not the page itself
// (that needs the whole site's providers).
vi.mock('./CategoryPreview', () => ({
  default: ({ category, inline }: { category: CategoryConfig; inline?: boolean }) => (
    <p data-testid={inline ? 'preview-beside' : 'preview'}>{category.pluralLabel}</p>
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CategoryEditor — new category', () => {
  it('shows "New category" and asks what kind of places it holds', () => {
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'New category' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'What kind of places?' })).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'ShulsDavening times, every weekday and Shabbos',
      'FoodMenus, kosher lists and main dishes',
      'GroceriesKosher items and hours',
      'MikvahsHours, appointments and keilim',
      'HotelsShabbos-friendly stays and shuttles',
      'HospitalsChaplains, Shabbos rooms and kosher food',
      'PlainA list of places, with the fields you choose',
    ])
  })

  it('won’t create one until a kind is picked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Name'), 'Pharmacies')
    await user.click(screen.getByRole('button', { name: /create category/i }))
    expect(screen.getByText('Pick what kind of places it holds.')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
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

    await user.click(screen.getByRole('radio', { name: /^Plain/ }))
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

  it('brings a kind’s fields and name, and Plain puts them back', async () => {
    const user = userEvent.setup()
    const shul = CATEGORY_TEMPLATES.find((t) => t.id === 'synagogue')!
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /^Shuls/ }))

    expect(screen.getByRole('radio', { name: /^Shuls/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Name')).toHaveValue(shul.pluralLabel)
    expect(screen.getByRole('button', { name: /^Davening Times/ })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /^Plain/ }))
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.queryByRole('button', { name: /^Davening Times/ })).not.toBeInTheDocument()
  })

  it('sends a kind its web address doesn’t already give', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('radio', { name: /^Food/ }))
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

    await user.click(screen.getByRole('radio', { name: /^Plain/ }))
    await user.type(screen.getByLabelText('Name'), 'Pharmacies')
    await user.click(screen.getByRole('button', { name: /create category/i }))

    expect(await screen.findByText('Name already in use.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('CategoryEditor — the "every listing also has" checkboxes', () => {
  it('Hours/Website/Photo toggles add and remove a managed field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)

    const hours = screen.getByLabelText('Hours')
    expect(hours).not.toBeChecked()
    await user.click(hours)
    expect(hours).toBeChecked()
    await user.click(hours)
    expect(hours).not.toBeChecked()
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
    await user.click(screen.getByLabelText('An address'))
    expect(within(screen.getByRole('region', { name: 'Save' })).getByText('2 changes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Groceries')
    expect(screen.queryByRole('region', { name: 'Save' })).not.toBeInTheDocument()
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
        initial={baseCategory({ detailFields: [{ key: 'kosher', label: 'Kosher certification', type: 'select', renderAs: 'badge', options: [{ value: 'OU', label: 'OU' }] }] })}
        siblings={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const row = screen.getByRole('button', { name: /^Kosher certification/ })
    expect(row).toHaveTextContent('Filter · on the row')
    await user.click(row)
    expect(screen.getByRole('heading', { name: 'Kosher certification' })).toBeInTheDocument()
    expect(screen.getByText('A field on Groceries')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Basics' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '‹ Groceries' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Basics' })).toBeInTheDocument())
  })

  it('shows the page beside the settings, as they are being typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    const preview = screen.getByRole('complementary', { name: 'Preview' })
    expect(within(preview).getByRole('button', { name: 'Computer' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('Name'), ' and more')
    // Drawn into the preview's own frame.
    const frame = preview.querySelector('iframe')!
    await waitFor(() => expect(frame.contentDocument!.body).toHaveTextContent('Groceries and more'))
    // The page opens full size; Computer and Phone stay buttons of their
    // own, never inside it (a button in a button doesn't hydrate).
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

  // No map switch: a page is on the map when its places have an address.
  it('puts the page on the map with its address, as one change', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={baseCategory({ hasAddress: false, capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, map: false } })} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />)
    await user.click(screen.getByLabelText('An address'))
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

  // The field-removal cleanup workflow: turning off "An address" on a
  // category that already has listings with addresses must check first, and
  // block the save behind an explicit confirmation — the whole reason this
  // component needs coverage before it gets split apart.
  describe('the field-removal cleanup confirmation', () => {
    it('checks field-usage, then blocks the save behind a confirmation when listings have data', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 3, phone: 0, fields: {} } })
      const onSaved = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(
        <CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />,
      )

      await user.click(screen.getByLabelText('An address'))
      await saveNow(user)

      expect(await screen.findByText('This will permanently clear data from existing listings')).toBeInTheDocument()
      expect(screen.getByText(/Address — 3 listings/)).toBeInTheDocument()
      expect(onSaved).not.toHaveBeenCalled()
      expect(fetchJson).toHaveBeenCalledWith(
        '/api/admin/categories/grocery/field-usage?community=test-community',
        expect.objectContaining({ method: 'POST' }),
        'Could not check existing listings.',
      )
    })

    it('proceeds straight to save when no listings have data in the removed field', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 0, phone: 0, fields: {} } })
      const onSaved = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(
        <CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />,
      )

      await user.click(screen.getByLabelText('An address'))
      await saveNow(user)

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(screen.queryByText('This will permanently clear data from existing listings')).not.toBeInTheDocument()
    })

    it('"Clear and save" confirms the cleanup and completes the save', async () => {
      vi.mocked(fetchJson)
        .mockResolvedValueOnce({ usage: { address: 3, phone: 0, fields: {} } })
        .mockResolvedValueOnce({ ok: true })
      const onSaved = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(
        <CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />,
      )

      await user.click(screen.getByLabelText('An address'))
      await saveNow(user)
      await screen.findByText('This will permanently clear data from existing listings')

      await user.click(screen.getByRole('button', { name: /clear and save/i }))

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      const secondCall = vi.mocked(fetchJson).mock.calls[1]!
      const body = JSON.parse((secondCall[1] as RequestInit).body as string)
      expect(body.clearFields).toEqual({ address: true, phone: false, keys: [] })
    })

    it('Cancel backs out of the cleanup confirmation without saving', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 3, phone: 0, fields: {} } })
      const onSaved = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(
        <CategoryEditor token="t" initial={baseCategory()} siblings={null} onSaved={onSaved} onCancel={vi.fn()} />,
      )

      await user.click(screen.getByLabelText('An address'))
      await saveNow(user)
      await screen.findByText('This will permanently clear data from existing listings')

      await user.click(screen.getByRole('button', { name: /^cancel$/i }))

      expect(screen.queryByText('This will permanently clear data from existing listings')).not.toBeInTheDocument()
      expect(onSaved).not.toHaveBeenCalled()
      expect(fetchJson).toHaveBeenCalledTimes(1)
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

      await user.click(screen.getByRole('button', { name: /^Type/ }))
      const optionsBox = screen.getByLabelText(/choices/i)
      await user.clear(optionsBox)
      await user.type(optionsBox, 'Glatt Kosher')
      await user.tab()
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

      await user.click(screen.getByRole('button', { name: /^Type/ }))
      const optionsBox = screen.getByLabelText(/choices/i)
      await user.clear(optionsBox)
      await user.type(optionsBox, 'Glatt Kosher')
      await user.tab()
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

  it('adds lists of the other categories whose places have an address, and only on an existing category', async () => {
    const user = userEvent.setup()
    editor(hotels)
    const section = screen.getByTestId('walk-lists-editor')
    expect(within(section).queryByRole('combobox')).not.toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: '+ Add a list' }))
    const which = within(section).getByRole('combobox', { name: 'List 1: which places' }) as HTMLSelectElement
    expect([...which.options].map((o) => o.textContent)).toEqual(['Synagogues', 'Food'])
    cleanup()
    editor(null)
    expect(screen.queryByTestId('walk-lists-editor')).not.toBeInTheDocument()
  })

  it('sends the lists when they changed, 30 minutes and by distance unless chosen, and leaves them out when they didn’t', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(hotels, onSaved)
    expect(await save(user, onSaved, 1)).not.toHaveProperty('walkList')

    await user.click(screen.getByRole('button', { name: '+ Add a list' }))
    expect((await save(user, onSaved, 2)).walkList).toEqual([{ categoryId: 'synagogue', maxMinutes: 30 }])

    // A second list, of food, grouped by its Store Type; the first can't be
    // chosen again.
    await user.click(screen.getByRole('button', { name: '+ Add a list' }))
    const second = screen.getByRole('combobox', { name: 'List 2: which places' }) as HTMLSelectElement
    expect([...second.options].map((o) => o.value)).toEqual(['restaurant'])
    expect([...(screen.getByRole('combobox', { name: 'Group Food by' }) as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      'Grouped by distance',
      'Grouped by Store Type',
    ])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Group Food by' }), 'foodType')
    await user.selectOptions(screen.getByRole('combobox', { name: 'How far a walk for Synagogues' }), '15')
    expect((await save(user, onSaved, 3)).walkList).toEqual([
      { categoryId: 'synagogue', maxMinutes: 15 },
      { categoryId: 'restaurant', maxMinutes: 30, groupBy: 'foodType' },
    ])
    // Every category listed: nothing left to add.
    expect(screen.queryByRole('button', { name: '+ Add a list' })).not.toBeInTheDocument()
  })

  it('shows the list saved before there could be several, and removing the last sends null', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor({ ...hotels, walkList: { categoryId: 'synagogue', maxMinutes: 45 } }, onSaved)
    expect(screen.getByRole('combobox', { name: 'List 1: which places' })).toHaveValue('synagogue')
    expect(screen.getByRole('combobox', { name: 'How far a walk for Synagogues' })).toHaveValue('45')
    await user.click(within(screen.getByTestId('walk-lists-editor')).getByRole('button', { name: 'Remove' }))
    expect((await save(user, onSaved, 1)).walkList).toBeNull()
  })
})

// A main card, a Shabbos card, Set as location (listingParts.ts). Sent only
// when changed, for migration 066.
describe('CategoryEditor — on each listing', () => {
  const hospitals = baseCategory({
    id: 'hospital',
    label: 'Hospital',
    pluralLabel: 'Hospitals',
    detailFields: [
      { key: 'who', label: 'Who to call first', type: 'text' },
      { key: 'who_phone', label: 'Their phone', type: 'tel' },
      { key: 'eruv', label: 'Eruv', type: 'select', renderAs: 'row', options: [{ value: 'uc', label: 'University City Eruv' }] },
      { key: 'kosher_inside', label: 'Kosher food inside', type: 'textarea' },
    ],
  })
  const payload = () => (vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body
  const editor = (initial = hospitals, onSaved = vi.fn()) =>
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={[initial]} onSaved={onSaved} onCancel={vi.fn()} />)

  it('sends a titled main card of ticked fields and a Shabbos card, only once changed', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(hospitals, onSaved)
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload())).not.toHaveProperty('listingParts')

    const section = screen.getByTestId('listing-parts-editor')
    await user.click(within(section).getByRole('checkbox', { name: 'A card of its own first' }))
    // Not finished: says so, and isn't sent as a card.
    expect(within(section).getByText(/Give it a title and tick at least one field/)).toBeInTheDocument()
    await user.type(within(section).getByRole('textbox', { name: 'The card’s title' }), 'Who to call first')
    const mainFields = within(within(section).getByRole('group', { name: 'Its fields' }))
    await user.click(mainFields.getByRole('checkbox', { name: 'Who to call first' }))
    await user.click(mainFields.getByRole('checkbox', { name: 'Their phone' }))
    await user.click(within(section).getByRole('checkbox', { name: /This Shabbos/ }))
    const shabbosFields = within(within(section).getByRole('group', { name: 'Fields on the Shabbos card' }))
    await user.click(shabbosFields.getByRole('checkbox', { name: 'Eruv' }))
    await user.click(shabbosFields.getByRole('checkbox', { name: 'Kosher food inside' }))
    // No Set as my location switch: every listing with an address has it (Oct 10).
    expect(within(section).queryByRole('checkbox', { name: /Set as my location/ })).not.toBeInTheDocument()
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
    expect(JSON.parse(payload()).listingParts).toEqual({
      main: { title: 'Who to call first', fields: ['who', 'who_phone'] },
      shabbos: { fields: ['eruv', 'kosher_inside'] },
    })
  })

  it('sends boxes of ticked fields in the admin’s order, and where the Shabbos card goes among them', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    const refuah = baseCategory({
      ...hospitals,
      detailFields: [
        { key: 'liaisons', label: 'Liaisons', type: 'contacts' },
        { key: 'pantry', label: 'Pantry', type: 'contacts' },
        { key: 'packages', label: 'Food packages', type: 'contacts' },
        { key: 'eruv', label: 'Eruv', type: 'select', renderAs: 'row', options: [{ value: 'uc', label: 'University City Eruv' }] },
      ],
    })
    editor(refuah, onSaved)
    const boxes = screen.getByTestId('boxes-editor')
    await user.click(within(boxes).getByRole('button', { name: '+ Add a box' }))
    await user.type(within(boxes).getByRole('textbox', { name: 'Box 1: its title' }), 'Kosher food')
    // Ticked packages first, then pantry, then the other way round: the box
    // keeps the order ticked.
    let first = within(within(boxes).getAllByRole('group', { name: 'In it' })[0])
    await user.click(first.getByRole('checkbox', { name: 'Pantry' }))
    await user.click(first.getByRole('checkbox', { name: 'Food packages' }))
    await user.click(within(boxes).getByRole('button', { name: '+ Add a box' }))
    await user.type(within(boxes).getByRole('textbox', { name: 'Box 2: its title' }), 'Who to call')
    await user.click(within(within(boxes).getAllByRole('group', { name: 'In it' })[1]).getByRole('checkbox', { name: 'Liaisons' }))
    await user.click(within(boxes).getByRole('button', { name: 'Move box 2 up' }))
    first = within(within(boxes).getAllByRole('group', { name: 'In it' })[0])
    expect(first.getByRole('checkbox', { name: 'Liaisons' })).toBeChecked()

    const section = screen.getByTestId('listing-parts-editor')
    await user.click(within(section).getByRole('checkbox', { name: /This Shabbos/ }))
    await user.click(within(within(section).getByRole('group', { name: 'Fields on the Shabbos card' })).getByRole('checkbox', { name: 'Eruv' }))
    await user.selectOptions(within(section).getByRole('combobox', { name: 'Where it goes the rest of the week' }), 'After “Who to call”')
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload()).listingParts).toEqual({
      boxes: [
        { title: 'Who to call', fields: ['liaisons'] },
        { title: 'Kosher food', fields: ['pantry', 'packages'] },
      ],
      shabbos: { fields: ['eruv'], after: 1 },
    })
  })

  it('shows what’s saved, and turning everything off sends null', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor({ ...hospitals, listingParts: { shabbos: { fields: ['eruv'] } } }, onSaved)
    const section = screen.getByTestId('listing-parts-editor')
    const box = within(section).getByRole('checkbox', { name: /This Shabbos/ })
    expect(box).toBeChecked()
    await user.click(box)
    await saveNow(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload()).listingParts).toBeNull()
  })
})
