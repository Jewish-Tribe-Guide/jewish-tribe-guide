// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CategoryField } from '@/lib/categories'
import { DetailFieldInput } from './DetailFieldInput'

// Carried over from the old sectioned form's tests (ListingForm.test.tsx)
// when that form was deleted — the field-by-field behaviours that belong to
// this input itself, whichever editor renders it.
//
// Whether a field is shown at all (showIf, audience sections) is decided by
// the caller, not here: see ListingEditor.test.tsx's hechsher caveat for the
// editor, and useListingDraft.test.tsx for what reaches the submission.

afterEach(cleanup)

/** Rendered controlled, as every real caller does, with each value it
 *  reports kept in `changes`. */
function renderField(field: CategoryField, initial?: unknown, props: { labelOverride?: string } = {}) {
  const changes: unknown[] = []
  function Controlled() {
    const [value, setValue] = useState<unknown>(initial)
    return (
      <DetailFieldInput
        field={field}
        value={value}
        onChange={(v) => {
          changes.push(v)
          setValue(v)
        }}
        {...props}
      />
    )
  }
  render(<Controlled />)
  return { changes, last: () => changes.at(-1) }
}

const photo: CategoryField = { key: 'photoOverride', label: 'Photo', type: 'image' }
const yesNo: CategoryField = { key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean' }
const cuisine: CategoryField = {
  key: 'cuisine',
  label: 'Cuisine',
  type: 'select',
  options: [
    { value: 'italian', label: 'Italian' },
    { value: 'deli', label: 'Deli' },
  ],
}

// ImageUploadField's admin-facing hints are opt-out — the site's own logo /
// hero / category-icon editors keep them (see SiteSettingsEditor's tests),
// but someone filling in one listing's photo doesn't need them spelled out.
describe('a photo field', () => {
  it('never shows the "reposition/re-zoom" hint, even once a photo is set', () => {
    renderField(photo, 'https://example.com/photo.jpg')
    expect(screen.queryByText('Click the preview to reposition/re-zoom it')).not.toBeInTheDocument()
  })

  it('never shows the "drag an image onto the preview" hint before one is set either', () => {
    renderField(photo)
    expect(screen.queryByText(/drag an image onto the preview/)).not.toBeInTheDocument()
  })

  it('drops the help text and starts its URL-paste row collapsed', () => {
    renderField(photo)
    expect(screen.queryByText(/Shown instead of the category's usual icon/)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('https://…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste URL' })).toBeInTheDocument()
  })

  // Every other field type is browser-rendered with a border of its own;
  // the photo picker's loose pieces (preview, buttons) need an explicit box
  // to read as one field beside them.
  it('is boxed, the picker inside the box', () => {
    renderField(photo)
    const box = screen.getByText('Photo').closest('div')?.querySelector('.rounded-md.border')
    expect(box).not.toBeNull()
    expect(box?.querySelector('input[type="file"]')).toBeInTheDocument()
  })
})

// Answered with two buttons, Yes and No (Oct 10). It was a switch, whose
// off read as "No" when nobody had said so.
describe('a yes/no field', () => {
  it('is titled like any other field and answered Yes or No, neither chosen until someone does', async () => {
    const user = userEvent.setup()
    const { last } = renderField(yesNo)

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    const answer = screen.getByRole('group', { name: 'Shabbat friendly' })
    const yes = within(answer).getByRole('button', { name: 'Yes' })
    const no = within(answer).getByRole('button', { name: 'No' })
    expect(yes).toHaveAttribute('aria-pressed', 'false')
    expect(no).toHaveAttribute('aria-pressed', 'false')

    await user.click(yes)
    expect(last()).toBe(true)
    expect(yes).toHaveAttribute('aria-pressed', 'true')
    expect(no).toHaveAttribute('aria-pressed', 'false')

    await user.click(no)
    expect(last()).toBe(false)
    expect(yes).toHaveAttribute('aria-pressed', 'false')
    expect(no).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Shabbat friendly')).toHaveLength(1)
  })

  // `kosherPartial` is stored as "true means NOT everything is kosher", but
  // asked the friendlier way round ("Everything here is kosher?"), so what's
  // shown is the opposite of what's saved.
  it('shows an invertDisplay field backwards from what it stores, defaulting to Yes when unanswered', async () => {
    const user = userEvent.setup()
    const { last } = renderField({ key: 'kosherPartial', label: 'Everything here is kosher', type: 'boolean', invertDisplay: true })

    const answer = screen.getByRole('group', { name: 'Everything here is kosher' })
    expect(within(answer).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(answer).getByRole('button', { name: 'No' }))
    expect(last()).toBe(true)
    expect(within(answer).getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(answer).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('a choice field', () => {
  it('with multiSelect, takes more than one option and sums up what is picked', async () => {
    const user = userEvent.setup()
    const { last } = renderField({ ...cuisine, multiSelect: true })

    await user.click(screen.getByLabelText('Cuisine'))
    await user.click(screen.getByRole('checkbox', { name: 'Italian' }))
    await user.click(screen.getByRole('checkbox', { name: 'Deli' }))

    expect(last()).toEqual(['italian', 'deli'])
    expect(screen.getByText('Italian, Deli')).toBeInTheDocument()
  })

  it('with "Other…", reveals a free-text box whose words become the value', async () => {
    const user = userEvent.setup()
    const { last } = renderField({ ...cuisine, allowOther: true })

    await user.selectOptions(screen.getByLabelText('Cuisine'), 'Other…')
    const other = screen.getByPlaceholderText('Please specify')
    await user.type(other, 'Fusion')

    expect(other).toHaveValue('Fusion')
    expect(last()).toBe('Fusion')
  })

  // A choice an admin has since renamed or removed comes back in the box,
  // rather than silently reset to blank.
  it('with "Other…", reopens with the box already holding a saved value that isn’t one of its options', () => {
    renderField({ ...cuisine, allowOther: true }, 'Fusion')
    expect(screen.getByPlaceholderText('Please specify')).toHaveValue('Fusion')
  })
})

// Inside an audience section, "Women's Phone" reads as just "Phone".
it('titles a field with labelOverride when given one, keeping the required mark', () => {
  renderField({ key: 'womensPhone', label: "Women's Phone", type: 'text', required: true }, '', { labelOverride: 'Phone' })
  expect(screen.getByLabelText('Phone *')).toBeInTheDocument()
  expect(screen.queryByText(/Women's Phone/)).not.toBeInTheDocument()
})
