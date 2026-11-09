// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FieldLooks from './FieldLooks'
import type { CategoryConfig, CategoryField } from '@/lib/categories'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const choices = (...values: string[]) => values.map((v) => ({ value: v, label: v }))
const foodType: CategoryField = { key: 'food_type', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true, onCard: true, options: choices('Meat', 'Dairy', 'Parve') }
const hechsher: CategoryField = { key: 'hechsher', label: 'Hechsher', type: 'select', renderAs: 'badge', filterable: true, onCard: true, options: choices('Keystone-K', 'OU') }
const delivery: CategoryField = { key: 'delivery', label: 'Delivery Details', type: 'textarea' }
const food = (fields: CategoryField[]): CategoryConfig => ({ id: 'food', label: 'Restaurant', pluralLabel: 'Food', icon: '', description: '', kind: 'listing', detailFields: fields })

function show(field: CategoryField, fields: CategoryField[], more: Partial<Parameters<typeof FieldLooks>[0]> = {}) {
  const props = { category: food(fields), field, placeName: 'A restaurant', canAdd: true, onShowOnRow: vi.fn(), onWholePage: vi.fn(), ...more }
  render(<FieldLooks {...props} />)
  return props
}
const panel = (name: string) => screen.getByRole('region', { name })
const panels = () => within(screen.getByRole('complementary', { name: 'How it looks' })).getAllByRole('region').map((r) => r.getAttribute('aria-label'))

describe('FieldLooks: a field, how it looks (boards 33c and 34)', () => {
  it('outlines the field in the list, in Filters, on the listing and when adding', () => {
    show(foodType, [foodType, hechsher])
    expect(panels()).toEqual(['In the list', 'In Filters', 'On the listing', 'When adding'])
    expect(panel('In the list').querySelector('mark')).toHaveTextContent('Meat')
    expect(panel('In the list')).toHaveTextContent('Keystone-K')
    expect(panel('On the listing').querySelector('mark')).toHaveTextContent('Meat')
  })

  // The user, Nov 9: the picked choice blue, as Filters' picked chip is.
  it('picks the first choice, blue as Filters draws a picked one', () => {
    show(foodType, [foodType, hechsher])
    const meat = within(panel('In Filters')).getByRole('button', { name: 'Meat' })
    expect(meat).toHaveAttribute('aria-pressed', 'true')
    expect(meat.className).toContain('bg-primary')
    expect(within(panel('In Filters')).getByRole('button', { name: 'Dairy' })).toHaveAttribute('aria-pressed', 'false')
    const adding = within(panel('When adding')).getByRole('button', { name: 'Meat' })
    expect(adding).toHaveAttribute('aria-pressed', 'true')
    expect(adding.className).toContain('text-primary')
  })

  it('has no Filters while it isn’t in the filter, and no adding where visitors can’t add', () => {
    const off = { ...foodType, filterable: false }
    show(off, [off, hechsher], { canAdd: false })
    expect(panels()).toEqual(['In the list', 'On the listing'])
  })

  it('says a field isn’t on the row, and goes to the line that would take it', async () => {
    const user = userEvent.setup()
    const { onShowOnRow } = show(delivery, [foodType, delivery])
    expect(panel('In the list')).toHaveTextContent('Not shown in the list.')
    expect(panel('In the list').querySelector('mark')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show it on a row' }))
    expect(onShowOnRow).toHaveBeenCalledWith('third')
    expect(within(panel('On the listing')).getByText('About')).toBeInTheDocument()
    expect(within(panel('When adding')).getByText('Phone')).toBeInTheDocument()
  })

  it('tries the add form’s own input, sending nothing', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    show(delivery, [delivery])
    const box = within(panel('When adding')).getByRole('textbox', { name: 'Delivery Details' })
    await user.clear(box)
    await user.type(box, 'Fridays')
    expect(box).toHaveValue('Fridays')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens the whole page', async () => {
    const user = userEvent.setup()
    const { onWholePage } = show(foodType, [foodType])
    await user.click(screen.getByRole('button', { name: 'See the whole page' }))
    expect(onWholePage).toHaveBeenCalled()
  })
})
