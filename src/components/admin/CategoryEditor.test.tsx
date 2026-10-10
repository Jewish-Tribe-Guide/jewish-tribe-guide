// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryEditor } from './CategoryEditor'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { CATEGORY_TEMPLATES } from '@/lib/categoryTemplates'
import { fetchJson } from '@/lib/fetchJson'
import type { CategoryConfig } from '@/lib/categories'

// This component is ~1000 lines doing template application, field-schema
// editing, and two separate destructive-change confirmation workflows
// (option-rename migration, field-removal cleanup) — real behavior worth
// locking in before any structural split, not just a lint-motivated
// extraction like the rest of this session's refactors. Deliberately does
// NOT cover the Preview button: CategoryPreview needs the same heavy
// provider stack (ContentProvider/CommunityProvider) that GenericListingCard
// does, out of scope here — see the memory note on the provider-harness gap.

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn() }))
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CategoryEditor — new category', () => {
  it('shows "New category" and offers templates', () => {
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('New category')).toBeInTheDocument()
    expect(screen.getByText(CATEGORY_TEMPLATES[0]!.label)).toBeInTheDocument()
  })

  it('blocks save without a name', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /create category/i }))

    expect(screen.getByText('Category name is required.')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('creates the category via POST once a name is given', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="tok" initial={null} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText(/^name \*/i), 'Pharmacies')
    await user.click(screen.getByRole('button', { name: /create category/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories?community=test-community',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
      'Save failed.',
    )
  })

  it('applies a template\'s fields and name when none are set yet', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByText(CATEGORY_TEMPLATES[0]!.label))

    expect(screen.getByLabelText(/^name \*/i)).toHaveValue(CATEGORY_TEMPLATES[0]!.pluralLabel)
  })

  it('shows a save-failure error and does not call onSaved', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Name already in use.'))
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText(/^name \*/i), 'Pharmacies')
    await user.click(screen.getByRole('button', { name: /create category/i }))

    expect(await screen.findByText('Name already in use.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('CategoryEditor — the "every listing also has" checkboxes', () => {
  it('Hours/Website/Photo toggles add and remove a managed field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)

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
        hasMapCategory={false}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('Edit “Groceries”')).toBeInTheDocument()
  })

  it('saves via PATCH with no confirmation step when nothing destructive changed', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <CategoryEditor token="t" initial={baseCategory()} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories/grocery?community=test-community',
      expect.objectContaining({ method: 'PATCH' }),
      'Save failed.',
    )
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
        <CategoryEditor token="t" initial={baseCategory()} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
      )

      await user.click(screen.getByLabelText('An address'))
      await user.click(screen.getByRole('button', { name: /save changes/i }))

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
        <CategoryEditor token="t" initial={baseCategory()} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
      )

      await user.click(screen.getByLabelText('An address'))
      await user.click(screen.getByRole('button', { name: /save changes/i }))

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
        <CategoryEditor token="t" initial={baseCategory()} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
      )

      await user.click(screen.getByLabelText('An address'))
      await user.click(screen.getByRole('button', { name: /save changes/i }))
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
        <CategoryEditor token="t" initial={baseCategory()} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
      )

      await user.click(screen.getByLabelText('An address'))
      await user.click(screen.getByRole('button', { name: /save changes/i }))
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
          hasMapCategory={false}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      const optionsBox = screen.getByLabelText(/choices/i)
      await user.clear(optionsBox)
      await user.type(optionsBox, 'Glatt Kosher')
      await user.tab()
      await user.click(screen.getByRole('button', { name: /save changes/i }))

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
          hasMapCategory={false}
          onSaved={onSaved}
          onCancel={vi.fn()}
        />,
      )

      const optionsBox = screen.getByLabelText(/choices/i)
      await user.clear(optionsBox)
      await user.type(optionsBox, 'Glatt Kosher')
      await user.tab()
      await user.click(screen.getByRole('button', { name: /save changes/i }))
      await screen.findByText('Update existing listings to match this rename?')

      await user.click(screen.getByRole('button', { name: /save without updating/i }))

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      const secondCall = vi.mocked(fetchJson).mock.calls[1]!
      const body = JSON.parse((secondCall[1] as RequestInit).body as string)
      expect(body.applyOptionRenames).toBeUndefined()
    })
  })
})

describe('pin colour', () => {
  // Regression: the field was wired into the preview object rather than the
  // save payload, so the picker rendered, previewed correctly, and the PATCH
  // went out with no pinColor at all — returning 200 and silently keeping the
  // old colour. Asserting on the request body is the only thing that catches
  // that; the UI looked entirely correct.
  it('sends the chosen colour in the save request', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <CategoryEditor token="t" initial={baseCategory()} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: '#b63167' }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const call = vi.mocked(fetchJson).mock.calls.at(-1)!
    expect(JSON.parse((call[1] as RequestInit).body as string).pinColor).toBe('#b63167')
  })

  it('sends null for Automatic, so the positional fallback applies', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <CategoryEditor
        token="t"
        initial={{ ...baseCategory(), pinColor: '#b63167' }}
        siblings={null}
        hasMapCategory={false}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Automatic' }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const call = vi.mocked(fetchJson).mock.calls.at(-1)!
    expect(JSON.parse((call[1] as RequestInit).body as string).pinColor).toBeNull()
  })
})

// A colour picked blind is how two categories end up with matching pins, which
// the admin could previously only discover by opening the preview and
// comparing them by eye. The swatch row names who already holds each colour.
describe('CategoryEditor — pin colour clashes', () => {
  const siblings = [
    baseCategory(),
    baseCategory({ id: 'shul', label: 'Synagogue', pluralLabel: 'Synagogues', pinColor: '#2c8c47' }),
  ]

  it('labels a swatch another category already holds', () => {
    renderWithProviders(<CategoryEditor token="t" initial={siblings[0]} siblings={siblings} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: '#2c8c47 — already used by Synagogues' })).toBeInTheDocument()
    // A free one keeps the bare hex, so "taken" is what stands out.
    expect(screen.getByRole('button', { name: '#7a36bf' })).toBeInTheDocument()
  })

  it('warns after picking a colour that is already taken, and stops once a free one is picked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={siblings[0]} siblings={siblings} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /^#2c8c47 —/ }))
    expect(screen.getByText(/Same colour as Synagogues/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '#7a36bf' }))
    expect(screen.queryByText(/Same colour as/)).not.toBeInTheDocument()
  })

  it('never reports the category being edited as clashing with itself', () => {
    const self = baseCategory({ pinColor: '#2657bf' })
    renderWithProviders(<CategoryEditor token="t" initial={self} siblings={[self, siblings[1]]} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByText(/Same colour as/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '#2657bf' })).toBeInTheDocument()
  })
})

// How the category page groups its list (listGroups.ts). Sent only when
// changed, so every other save keeps working on a database that doesn't
// have migration 059's column yet.
describe('CategoryEditor — grouping the list', () => {
  const shuls = baseCategory({
    id: 'synagogue',
    pluralLabel: 'Synagogues',
    detailFields: [
      { key: 'hours', label: 'Hours', type: 'hours' },
      { key: 'denomination', label: 'Denomination', type: 'select', options: [{ value: 'Reform', label: 'Reform' }] },
    ],
  })
  const payload = () => (vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body

  it('offers the groupings the category’s fields allow, and none for a new category', () => {
    renderWithProviders(<CategoryEditor token="t" initial={shuls} siblings={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)
    const select = screen.getByRole('combobox', { name: 'Group the list' })
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'open', 'distance', 'field:denomination'])
    cleanup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('combobox', { name: 'Group the list' })).not.toBeInTheDocument()
  })

  it('sends the grouping when it changed, and leaves it out when it didn’t', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={shuls} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload())).not.toHaveProperty('groupBy')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Group the list' }), 'field:denomination')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
    expect(JSON.parse(payload()).groupBy).toEqual({ kind: 'field', key: 'denomination' })
  })

  it('shows the saved grouping, and clearing it sends null', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <CategoryEditor token="t" initial={{ ...shuls, groupBy: { kind: 'open' } }} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
    )
    const select = screen.getByRole('combobox', { name: 'Group the list' })
    expect(select).toHaveValue('open')
    await user.selectOptions(select, '')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload()).groupBy).toBeNull()
  })
})

// The one question the category page asks (questionCards.ts). Sent only when
// changed, like the grouping, for migration 060.
describe('CategoryEditor — the question card', () => {
  const food = baseCategory({
    id: 'restaurant',
    pluralLabel: 'Food',
    detailFields: [
      {
        key: 't',
        label: 'Food Type',
        type: 'select',
        options: [
          { value: 'Meat', label: 'Meat' },
          { value: 'Dairy', label: 'Dairy' },
          { value: 'Parve', label: 'Parve' },
        ],
      },
      { key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean' },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
  })
  const payload = () => (vi.mocked(fetchJson).mock.calls.at(-1)![1] as { body: string }).body

  it('offers "Been there lately?" and each yes/no or short pick-list, worded as the page asks it', () => {
    renderWithProviders(<CategoryEditor token="t" initial={food} siblings={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)
    const select = screen.getByRole('combobox', { name: 'Question card' }) as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['', 'confirm', 'field:t', 'field:shabbatFriendly'])
    expect(within(select).getByRole('option', { name: /meat, dairy or parve\?/ })).toBeInTheDocument()
    cleanup()
    renderWithProviders(<CategoryEditor token="t" initial={null} siblings={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('combobox', { name: 'Question card' })).not.toBeInTheDocument()
  })

  it('sends the question when it changed, and leaves it out when it didn’t', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CategoryEditor token="t" initial={food} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload())).not.toHaveProperty('questionCard')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Question card' }), 'field:t')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
    expect(JSON.parse(payload()).questionCard).toEqual({ kind: 'field', key: 't' })
  })

  it('shows the saved question, and clearing it sends null', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <CategoryEditor token="t" initial={{ ...food, questionCard: { kind: 'confirm' } }} siblings={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
    )
    const select = screen.getByRole('combobox', { name: 'Question card' })
    expect(select).toHaveValue('confirm')
    await user.selectOptions(select, '')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload()).questionCard).toBeNull()
  })
})

// Other categories' places within a walk (walkList.ts). Sent only when
// changed, for migration 061.
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
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={siblings} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />)
  const save = async (user: ReturnType<typeof userEvent.setup>, onSaved: ReturnType<typeof vi.fn>, times: number) => {
    await user.click(screen.getByRole('button', { name: /save changes/i }))
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
    renderWithProviders(<CategoryEditor token="t" initial={initial} siblings={[initial]} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />)

  it('sends a titled main card of ticked fields and a Shabbos card, only once changed', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    editor(hospitals, onSaved)
    await user.click(screen.getByRole('button', { name: /save changes/i }))
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
    await user.click(screen.getByRole('button', { name: /save changes/i }))
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
    await user.click(screen.getByRole('button', { name: /save changes/i }))
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
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(JSON.parse(payload()).listingParts).toBeNull()
  })
})
