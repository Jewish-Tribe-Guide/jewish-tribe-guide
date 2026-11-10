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
const storeType: CategoryField = { key: 'store', label: 'Store Type', type: 'select', renderAs: 'badge', onCard: true, options: choices('Restaurant', 'Scheduled Deliveries') }
const delivery: CategoryField = { key: 'delivery', label: 'Delivery Details', type: 'textarea' }
const food = (fields: CategoryField[]): CategoryConfig => ({ id: 'food', label: 'Restaurant', pluralLabel: 'Food', icon: '', description: '', kind: 'listing', detailFields: fields })

function show(field: CategoryField, fields: CategoryField[], more: Partial<Parameters<typeof FieldLooks>[0]> = {}) {
  const props = { category: food(fields), field, placeName: 'A restaurant', canAdd: true, onShowOnRow: vi.fn(), onWholePage: vi.fn(), ...more }
  const view = render(<FieldLooks {...props} />)
  return { ...props, ...view }
}
const looks = () => screen.getByRole('complementary', { name: 'How it looks' })
const tabs = () => within(looks()).getAllByRole('tab').map((t) => t.textContent)
const shown = () => within(looks()).getByRole('tabpanel')
const open = (name: string) => userEvent.setup().click(within(looks()).getByRole('tab', { name }))
const marks = () => [...shown().querySelectorAll('mark')].map((m) => m.textContent)

describe('FieldLooks: a field, how it looks, as tabs (boards 33d–34c)', () => {
  it('has a tab for each place a visitor meets it, and opens on the list', () => {
    show(foodType, [foodType, hechsher])
    expect(tabs()).toEqual(['List', 'Filters', 'A listing', 'Adding'])
    expect(within(looks()).getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true')
    expect(shown()).toHaveAccessibleName('List')
  })

  // Board 33d: three rows, the field on each, a different answer on each.
  it('shows the list as three rows, the field outlined on every one', () => {
    show(foodType, [foodType, hechsher])
    expect(within(shown()).getAllByRole('listitem')).toHaveLength(3)
    expect(marks()).toEqual(['Meat', 'Dairy', 'Parve'])
    expect(shown()).toHaveTextContent('Keystone-K')
    // The page's own top, as a visitor sees it.
    expect(shown()).toHaveTextContent('Ask anything about food')
    expect(shown()).toHaveTextContent('3 listings')
  })

  // The user, Nov 9: the picked choice blue, as Filters' picked chip is.
  it('shows Filters with the field’s own filter working and picked, the rest faded', async () => {
    show(foodType, [foodType, hechsher])
    await open('Filters')
    const meat = within(shown()).getByRole('button', { name: 'Meat' })
    expect(meat).toHaveAttribute('aria-pressed', 'true')
    expect(meat.className).toMatch(/(^| )bg-primary( |$)/)
    expect(meat.querySelector('svg path')).toHaveAttribute('d', 'M20 6 9 17l-5-5')
    await userEvent.setup().click(within(shown()).getByRole('button', { name: 'Dairy' }))
    expect(within(shown()).getByRole('button', { name: 'Dairy' })).toHaveAttribute('aria-pressed', 'true')
    // The page's other filter is there, faded, nothing picked and nothing to press.
    const ou = within(shown()).getByText('OU').closest('button')!
    expect(ou).toHaveAttribute('aria-pressed', 'false')
    expect(ou.closest('[inert]')).not.toBeNull()
    expect(meat.closest('[inert]')).toBeNull()
  })

  it('shows the opened listing, the field in its facts, with no Directions on a place with no address', async () => {
    show(foodType, [foodType, hechsher])
    await open('A listing')
    expect(marks()).toEqual(['Meat'])
    expect(shown()).toHaveTextContent('A restaurant')
    expect(shown()).toHaveTextContent('Call')
    expect(shown()).toHaveTextContent('Share')
    expect(shown()).not.toHaveTextContent('Directions')
  })

  it('shows the add form, the field the add form’s own control, picked as the place answers it', async () => {
    show(foodType, [foodType, hechsher])
    await open('Adding')
    expect(shown()).toHaveTextContent('Add to Food')
    const adding = within(shown()).getByRole('button', { name: 'Meat' })
    expect(adding).toHaveAttribute('aria-pressed', 'true')
    expect(adding.className).toMatch(/(^| )bg-primary( |$)/)
    expect(within(shown()).getByRole('button', { name: 'Dairy' }).className).not.toMatch(/(^| )bg-primary( |$)/)
  })

  it('has no Filters while it isn’t in the filter, and no Adding where visitors can’t add', () => {
    const off = { ...foodType, filterable: false }
    show(off, [off, hechsher], { canAdd: false })
    expect(tabs()).toEqual(['List', 'A listing'])
  })

  // Board 34b-34c: a field off the row opens where it is, and the list says
  // it isn't there.
  it('opens a field off the row on its listing, and says on the list where it could go', async () => {
    const { onShowOnRow } = show(delivery, [foodType, delivery])
    expect(shown()).toHaveAccessibleName('A listing')
    const box = shown().querySelector('[data-mine]')!
    expect(box).toHaveTextContent('About')
    expect(box).toHaveTextContent('Orders by Wednesday noon')
    await open('List')
    expect(shown()).toHaveTextContent('Not shown in the list.')
    expect(marks()).toEqual([])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show it on a row' }))
    expect(onShowOnRow).toHaveBeenCalledWith('third')
  })

  // Delivery Details, asked once Store Type is Scheduled Deliveries: the
  // made-up place is one, and the field is asked with Store Type.
  it('gives the answer a field is asked after, and asks it where the site does', async () => {
    const asked = { field: 'store', equals: 'Scheduled Deliveries' }
    show(delivery, [storeType, delivery], { askedWhen: asked })
    expect(shown()).toHaveTextContent('Scheduled Deliveries')
    await open('Adding')
    expect(within(shown()).getByRole('button', { name: 'Scheduled Deliveries' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(shown()).getByRole('textbox', { name: 'Delivery Details' }).closest('[data-mine]')).not.toBeNull()
  })

  it('tries the add form’s own input, sending nothing', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    show(delivery, [delivery])
    await open('Adding')
    const box = within(shown()).getByRole('textbox', { name: 'Delivery Details' })
    await user.clear(box)
    await user.type(box, 'Fridays')
    expect(box).toHaveValue('Fridays')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the tab picked for a field, and opens the next field on its own first tab', async () => {
    const { rerender, ...props } = show(foodType, [foodType, delivery])
    await open('Adding')
    rerender(<FieldLooks {...props} />)
    expect(shown()).toHaveAccessibleName('Adding')
    rerender(<FieldLooks {...props} field={delivery} />)
    expect(shown()).toHaveAccessibleName('A listing')
  })

  // Nov 10: the field's own "Under the name" switch puts it on its row or
  // takes it off, and How it looks shows the List, where that's seen.
  it('shows the List when the field goes on its row or comes off it, whatever tab was showing', async () => {
    const { rerender, ...props } = show(foodType, [foodType, delivery])
    await open('Adding')
    const off = { ...foodType, onCard: false }
    rerender(<FieldLooks {...props} category={food([off, delivery])} field={off} />)
    expect(shown()).toHaveAccessibleName('List')
    expect(shown()).toHaveTextContent('Not shown in the list.')
    await open('A listing')
    rerender(<FieldLooks {...props} category={food([foodType, delivery])} field={foodType} />)
    expect(shown()).toHaveAccessibleName('List')
    expect(marks()).toEqual(['Meat', 'Dairy', 'Parve'])
  })

  it('opens the whole page', async () => {
    const user = userEvent.setup()
    const { onWholePage } = show(foodType, [foodType])
    await user.click(screen.getByRole('button', { name: 'See the whole page' }))
    expect(onWholePage).toHaveBeenCalled()
  })
})
