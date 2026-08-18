// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryEditor } from './CategoryEditor'
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
    render(<CategoryEditor token="t" initial={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('New category')).toBeInTheDocument()
    expect(screen.getByText(CATEGORY_TEMPLATES[0]!.label)).toBeInTheDocument()
  })

  it('blocks save without a name', async () => {
    const user = userEvent.setup()
    render(<CategoryEditor token="t" initial={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /create category/i }))

    expect(screen.getByText('Category name is required.')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('creates the category via POST once a name is given', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<CategoryEditor token="tok" initial={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText(/^name \*/i), 'Pharmacies')
    await user.click(screen.getByRole('button', { name: /create category/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
      'Save failed.',
    )
  })

  it('applies a template\'s fields and name when none are set yet', async () => {
    const user = userEvent.setup()
    render(<CategoryEditor token="t" initial={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByText(CATEGORY_TEMPLATES[0]!.label))

    expect(screen.getByLabelText(/^name \*/i)).toHaveValue(CATEGORY_TEMPLATES[0]!.pluralLabel)
  })

  it('shows a save-failure error and does not call onSaved', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Name already in use.'))
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<CategoryEditor token="t" initial={null} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText(/^name \*/i), 'Pharmacies')
    await user.click(screen.getByRole('button', { name: /create category/i }))

    expect(await screen.findByText('Name already in use.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('CategoryEditor — the "every listing also has" checkboxes', () => {
  it('Hours/Website/Photo toggles add and remove a managed field', async () => {
    const user = userEvent.setup()
    render(<CategoryEditor token="t" initial={null} hasMapCategory={false} onSaved={vi.fn()} onCancel={vi.fn()} />)

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
    render(
      <CategoryEditor
        token="t"
        initial={baseCategory()}
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
    render(
      <CategoryEditor token="t" initial={baseCategory()} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/categories/grocery',
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
      render(
        <CategoryEditor token="t" initial={baseCategory()} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
      )

      await user.click(screen.getByLabelText('An address'))
      await user.click(screen.getByRole('button', { name: /save changes/i }))

      expect(await screen.findByText('This will permanently clear data from existing listings')).toBeInTheDocument()
      expect(screen.getByText(/Address — 3 listings/)).toBeInTheDocument()
      expect(onSaved).not.toHaveBeenCalled()
      expect(fetchJson).toHaveBeenCalledWith(
        '/api/admin/categories/grocery/field-usage',
        expect.objectContaining({ method: 'POST' }),
        'Could not check existing listings.',
      )
    })

    it('proceeds straight to save when no listings have data in the removed field', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce({ usage: { address: 0, phone: 0, fields: {} } })
      const onSaved = vi.fn()
      const user = userEvent.setup()
      render(
        <CategoryEditor token="t" initial={baseCategory()} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
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
      render(
        <CategoryEditor token="t" initial={baseCategory()} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
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
      render(
        <CategoryEditor token="t" initial={baseCategory()} hasMapCategory={false} onSaved={onSaved} onCancel={vi.fn()} />,
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
      render(
        <CategoryEditor
          token="t"
          initial={categoryWithSelectField()}
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
        '/api/admin/categories/grocery/option-usage',
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
      render(
        <CategoryEditor
          token="t"
          initial={categoryWithSelectField()}
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
