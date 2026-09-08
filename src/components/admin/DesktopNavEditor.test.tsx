// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
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

describe('DesktopNavEditor', () => {
  it('renders the default Categories/Map/More structure by label', () => {
    renderWithProviders(<DesktopNavEditor items={DEFAULT_DESKTOP_NAV_ITEMS} onChange={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    // getAllByDisplayValue, not getByDisplayValue, for any label that a
    // row's own "Opens" <select> could also resolve to (its selected
    // option's text) — the label <input> always renders first in DOM order.
    expect(screen.getByDisplayValue('Categories')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('Map')[0]).toBeInTheDocument()
    expect(screen.getByDisplayValue('More')).toBeInTheDocument()
    // The More dropdown's own contents render inline underneath it.
    expect(screen.getAllByDisplayValue('About')[0]).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('Feedback')[0]).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('Privacy')[0]).toBeInTheDocument()
  })

  it('renaming a top-level item calls onChange with the updated label', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness initial={DEFAULT_DESKTOP_NAV_ITEMS} />, { content: { categories: [grocery] } })

    const mapInput = screen.getAllByDisplayValue('Map')[0]!
    await user.clear(mapInput)
    await user.type(mapInput, 'Find on map')

    expect(screen.getByDisplayValue('Find on map')).toBeInTheDocument()
  })

  it('removing a top-level item drops it from the nav', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<DesktopNavEditor items={DEFAULT_DESKTOP_NAV_ITEMS} onChange={onChange} />, {
      content: { categories: [grocery] },
    })

    // getAllByDisplayValue, not getByDisplayValue: the row's own "Opens"
    // <select> also resolves to display value "Map" (its selected option's
    // text) — the label <input> renders first in DOM order, so [0] is it.
    const mapRow = screen.getAllByDisplayValue('Map')[0]!.closest('li')!
    await user.click(within(mapRow).getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenCalledWith(DEFAULT_DESKTOP_NAV_ITEMS.filter((i) => i.id !== 'map'))
  })

  it('adding a link creates a new top-level item pointing at a category', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(
      <DesktopNavEditor items={[{ id: 'categories', label: 'Categories', kind: 'categories-menu' }]} onChange={onChange} />,
      { content: { categories: [grocery] } },
    )

    // Only one combobox on screen here — the categories-menu item has no
    // "Opens" select, so this is unambiguously the "+ Add a link" picker.
    await user.selectOptions(screen.getByRole('combobox'), 'grocery')

    expect(onChange).toHaveBeenCalledWith([
      { id: 'categories', label: 'Categories', kind: 'categories-menu' },
      expect.objectContaining({ label: 'Grocery Stores', kind: 'link', target: 'grocery' }),
    ])
  })

  it('adding a link creates a new top-level item pointing at a built-in destination', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<DesktopNavEditor items={[]} onChange={onChange} />, { content: { categories: [grocery] } })

    const selects = screen.getAllByRole('combobox')
    const addLinkSelect = selects.find((s) => within(s).queryByText('Map'))!
    await user.selectOptions(addLinkSelect, 'map')

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ label: 'Map', kind: 'link', target: 'map' })])
  })

  it('shows an empty-nav warning when there are no items', () => {
    renderWithProviders(<DesktopNavEditor items={[]} onChange={vi.fn()} />, { content: { categories: [grocery] } })
    expect(screen.getByText(/needs at least one item/)).toBeInTheDocument()
  })
})
