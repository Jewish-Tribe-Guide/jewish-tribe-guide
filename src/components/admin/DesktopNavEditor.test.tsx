// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { DEFAULT_DESKTOP_NAV_ITEMS, type DesktopNavItem } from '@/lib/siteSettings'
import DesktopNavEditor from './DesktopNavEditor'

// Same controlled-input reasoning as MobileTabsEditor's own pattern: this
// component never holds its own copy of `items`, only calls `onChange` — a
// harness that actually owns the state is needed to type into a label input
// and see the value reflected back.
function Harness({ initial }: { initial: DesktopNavItem[] }) {
  const [items, setItems] = useState(initial)
  return <DesktopNavEditor items={items} onChange={setItems} />
}

afterEach(() => cleanup())

const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })

const show = (items: DesktopNavItem[] = DEFAULT_DESKTOP_NAV_ITEMS, onChange = vi.fn()) => {
  renderWithProviders(<DesktopNavEditor items={items} onChange={onChange} />, { content: { categories: [grocery] } })
  return onChange
}

// Each link one row saying where it goes; a dropdown opens to its own links
// in the same rows (note 27). Dragging itself needs layout:
// e2e-admin-write/drag.spec.ts.
describe('DesktopNavEditor', () => {
  it('is one row per item, saying where it goes, with no arrows', () => {
    show()
    expect(screen.getByRole('button', { name: 'Categories' })).toHaveAccessibleDescription('Menu of the Browse groups')
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAccessibleDescription('Opens the Map')
    expect(screen.getByRole('button', { name: 'You' })).toHaveAccessibleDescription('Opens You')
    expect(screen.getByRole('button', { name: 'More' })).toHaveAccessibleDescription('Dropdown · About, Feedback, Privacy')
    expect(screen.getAllByRole('button', { name: /^Move / })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /earlier|later/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('a link opens to its name and where it goes; renaming renames its row', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness initial={DEFAULT_DESKTOP_NAV_ITEMS} />, { content: { categories: [grocery] } })
    await user.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByLabelText('Opens')).toHaveValue('map')
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Find on map')
    expect(screen.getByRole('button', { name: 'Find on map' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('Take it off drops an item from the nav', async () => {
    const user = userEvent.setup()
    const onChange = show()
    await user.click(screen.getByRole('button', { name: 'Map' }))
    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    expect(onChange).toHaveBeenCalledWith(DEFAULT_DESKTOP_NAV_ITEMS.filter((i) => i.id !== 'map'))
  })

  it('a dropdown opens to its links in rows, each with an × and opening to rename it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness initial={DEFAULT_DESKTOP_NAV_ITEMS} />, { content: { categories: [grocery] } })
    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByText('Opens the About page')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Take Feedback off' }))
    expect(screen.getByRole('button', { name: 'More' })).toHaveAccessibleDescription('Dropdown · About, Privacy')
    await user.click(screen.getByRole('button', { name: 'About' }))
    const name = screen.getAllByLabelText('Name')[1]!
    await user.clear(name)
    await user.type(name, 'Who we are')
    expect(screen.getByRole('button', { name: 'More' })).toHaveAccessibleDescription('Dropdown · Who we are, Privacy')
  })

  it('moves an item, and a link inside the dropdown, by its handle with the arrow keys', async () => {
    const user = userEvent.setup()
    const onChange = show()
    screen.getByRole('button', { name: 'Move You' }).focus()
    await user.keyboard('{ArrowUp}')
    const [categories, map, you, more] = DEFAULT_DESKTOP_NAV_ITEMS
    expect(onChange).toHaveBeenLastCalledWith([categories, you, map, more])
    await user.click(screen.getByRole('button', { name: 'More' }))
    screen.getByRole('button', { name: 'Move Privacy' }).focus()
    await user.keyboard('{ArrowUp}')
    const [about, feedback, privacy] = more!.items!
    expect(onChange).toHaveBeenLastCalledWith([categories, map, you, { ...more, items: [about, privacy, feedback] }])
  })

  it('+ Add a link adds one pointing at a category, and opens it', async () => {
    const user = userEvent.setup()
    const categories: DesktopNavItem = { id: 'categories', label: 'Categories', kind: 'categories-menu' }
    renderWithProviders(<Harness initial={[categories]} />, { content: { categories: [grocery] } })
    await user.selectOptions(screen.getByLabelText('+ Add a link'), 'grocery')
    expect(screen.getByRole('button', { name: 'Grocery Stores' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('+ Add a link adds one pointing at a built-in destination', async () => {
    const user = userEvent.setup()
    const onChange = show([])
    await user.selectOptions(screen.getByLabelText('+ Add a link'), 'map')
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ label: 'Map', kind: 'link', target: 'map' })])
  })

  it('shows an empty-nav warning when there are no items', () => {
    show([])
    expect(screen.getByText(/needs at least one item/)).toBeInTheDocument()
  })
})
