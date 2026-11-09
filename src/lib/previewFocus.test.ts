import { describe, expect, it } from 'vitest'
import type { CategoryConfig, CategoryField } from './categories'
import { NEW_FIELD_KEY, focusOn } from './previewFocus'

const page = {
  id: 'food',
  label: 'Food',
  pluralLabel: 'Food',
  icon: '',
  description: '',
  kind: 'listing',
  detailFields: [
    { key: 'store', label: 'Store Type', type: 'select', options: [{ value: 'deliveries', label: 'Scheduled Deliveries' }] },
    { key: 'delivery', label: 'Delivery Details', type: 'textarea', showIf: { field: 'store', equals: 'deliveries' } },
  ],
} as unknown as CategoryConfig

describe('focusOn', () => {
  it('shows a field that waits on another answer', () => {
    const { category, focus } = focusOn(page, page.detailFields[1])
    expect(focus).toBe('delivery')
    expect(category.detailFields[1].showIf).toBeUndefined()
    expect(category.detailFields).toHaveLength(2)
  })

  it('puts a field not on the page yet on it', () => {
    const field = { key: 'denomination', label: 'Denomination', type: 'select' } as CategoryField
    const { category, focus } = focusOn(page, field)
    expect(focus).toBe('denomination')
    expect(category.detailFields.map((f) => f.key)).toEqual(['store', 'delivery', 'denomination'])
  })

  it('gives a field being made, with no key or name yet, something to open', () => {
    const { category, focus } = focusOn(page, { key: '', label: ' ', type: 'text' } as CategoryField)
    expect(focus).toBe(NEW_FIELD_KEY)
    expect(category.detailFields.at(-1)).toMatchObject({ key: NEW_FIELD_KEY, label: 'New field' })
  })

  it('opens the address or phone as they are, and nothing without a field', () => {
    expect(focusOn(page, 'phone')).toEqual({ category: page, focus: 'phone' })
    expect(focusOn(page, undefined)).toEqual({ category: page })
  })
})
