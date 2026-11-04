// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { DEFAULT_DESKTOP_NAV_ITEMS, type DesktopNavItem } from '@/lib/siteSettings'
import type { DraftHomeSection } from '@/lib/homeSections'
import DesktopNavEditor from './DesktopNavEditor'

// The top of the page, on a computer, as tabs (drawing KdHT8Tci1ufXSXobnnSfEm:
// "New · What goes in first decides" and "Tabs, links and headings").
// Dragging itself needs layout: e2e-admin-write/drag.spec.ts.

const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
const bakery = makeCategory({ id: 'bakery', pluralLabel: 'Bakeries' })
const content = { content: { categories: [grocery, bakery] } }

const food: DraftHomeSection = { id: 'food', kind: 'section', title: 'Food', cardIds: ['grocery'], width: 'full' }
const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [], width: 'full' }

// The editor only calls onChange; this owns the state, as the admin page does.
function Harness({
  initial,
  sections: initialSections = [food],
  onChange,
  onSectionsChange,
}: {
  initial: DesktopNavItem[]
  sections?: DraftHomeSection[]
  onChange?: (items: DesktopNavItem[]) => void
  onSectionsChange?: (sections: DraftHomeSection[]) => void
}) {
  const [items, setItems] = useState(initial)
  const [sections, setSections] = useState(initialSections)
  return (
    <DesktopNavEditor
      items={items}
      onChange={(next) => {
        setItems(next)
        onChange?.(next)
      }}
      sections={sections}
      onSectionsChange={(next) => {
        setSections(next)
        onSectionsChange?.(next)
      }}
    />
  )
}

const show = (initial: DesktopNavItem[] = DEFAULT_DESKTOP_NAV_ITEMS, more: { sections?: DraftHomeSection[] } = {}) => {
  const onChange = vi.fn()
  const onSectionsChange = vi.fn()
  renderWithProviders(<Harness initial={initial} onChange={onChange} onSectionsChange={onSectionsChange} {...more} />, content)
  return { onChange, onSectionsChange, user: userEvent.setup() }
}

const row = (name: string) => screen.getByRole('button', { name })
const adds = () => screen.queryAllByRole('button', { name: /^\+ Add a heading$/ }).length + screen.queryAllByLabelText('+ Add a link').length

afterEach(() => cleanup())

describe('DesktopNavEditor — tabs', () => {
  it('is one row per tab, saying what it is, with no arrows and no name boxes', () => {
    show()
    expect(row('Categories')).toHaveAccessibleDescription('Dropdown · 1 heading')
    expect(row('Map')).toHaveAccessibleDescription('Opens the Map')
    expect(row('You')).toHaveAccessibleDescription('Opens You')
    expect(row('More')).toHaveAccessibleDescription('Dropdown · About, Feedback, Privacy')
    expect(screen.getAllByRole('button', { name: /^Move / })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /earlier|later/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('open, a tab shows its name, not its line; a tap on the name edits it, beside a trash can', async () => {
    const { user, onChange } = show()
    await user.click(row('Map'))
    // What the line summed up is showing under it, so it goes.
    expect(screen.queryByText('Opens the Map')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    await user.click(row('Rename Map'))
    const name = screen.getByRole('textbox', { name: 'Name' })
    expect(name).toHaveFocus()
    await user.clear(name)
    await user.type(name, 'Find on map{Enter}')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(row('Rename Find on map')).toHaveTextContent('Find on map')
    expect(screen.getByRole('button', { name: 'Find on map', expanded: true })).toBeInTheDocument()
    // The tab's trash can comes first; then its one link's ×.
    await user.click(screen.getAllByRole('button', { name: 'Take Find on map off' })[0]!)
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_DESKTOP_NAV_ITEMS.filter((i) => i.id !== 'map'))
    expect(screen.queryByRole('button', { name: 'Take it off' })).toBeNull()
  })

  it('a tap anywhere in the open row but its name and buttons closes it', async () => {
    const { user } = show()
    await user.click(row('Map'))
    await user.click(row('Rename Map'))
    expect(row('Map')).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByTestId('open-row'))
    expect(row('Map')).toHaveAttribute('aria-expanded', 'false')
  })

  it('+ Add a tab adds an empty New tab, open with its name ready to type over, offering a link or a heading', async () => {
    const { user } = show()
    await user.click(row('+ Add a tab'))
    const name = screen.getByRole('textbox', { name: 'Name' })
    expect(name).toHaveValue('New tab')
    expect(name).toHaveFocus()
    expect(screen.getByLabelText('+ Add a link')).toBeInTheDocument()
    expect(row('+ Add a heading')).toBeInTheDocument()
  })

  it('what goes in first decides: a link leaves only links, emptying it brings both back', async () => {
    const { user, onChange } = show()
    await user.click(row('+ Add a tab'))
    await user.selectOptions(screen.getByLabelText('+ Add a link'), 'map')
    expect(screen.queryByRole('button', { name: '+ Add a heading' })).toBeNull()
    expect(onChange.mock.lastCall![0].at(-1)).toMatchObject({ label: 'New tab', kind: 'more-menu', items: [{ kind: 'link', target: 'map' }] })
    await user.click(screen.getByRole('button', { name: 'Take Map off' }))
    expect(adds()).toBe(2)
  })

  it('what goes in first decides: a heading leaves only headings, and opens with its name ready', async () => {
    const { user, onChange } = show()
    await user.click(row('+ Add a tab'))
    await user.click(row('+ Add a heading'))
    const name = screen.getAllByRole('textbox', { name: 'Name' }).at(-1)!
    expect(name).toHaveValue('New heading')
    expect(name).toHaveFocus()
    // The heading's own Add, and the tab's Add a heading; no link for the tab.
    expect(screen.getAllByLabelText('+ Add a link')).toHaveLength(1)
    expect(row('+ Add a heading')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('+ Add a link'), 'bakery')
    expect(onChange.mock.lastCall![0].at(-1)).toMatchObject({
      kind: 'more-menu',
      items: [{ label: 'New heading', kind: 'heading', items: [{ kind: 'link', target: 'bakery', label: 'Bakeries' }] }],
    })
  })

  it('a link saved before tabs is a tab holding one link; a second makes it a dropdown', async () => {
    const { user, onChange } = show()
    await user.click(row('Map'))
    // Its one link is a name and an ×, and doesn't open.
    // (The tab's trash can, then the link's ×.)
    expect(screen.getAllByRole('button', { name: 'Take Map off' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Map', expanded: false })).toBeNull()
    await user.selectOptions(screen.getByLabelText('+ Add a link'), 'you')
    expect(screen.getByRole('button', { name: 'Map', expanded: true })).toBeInTheDocument()
    expect(onChange.mock.lastCall![0][1]).toMatchObject({
      id: 'map',
      label: 'Map',
      kind: 'more-menu',
      items: [{ kind: 'link', target: 'map' }, { kind: 'link', target: 'you' }],
    })
  })

  it('a dropdown opens to its links, each a name and an × that never opens, saying once where it goes', async () => {
    const more = DEFAULT_DESKTOP_NAV_ITEMS.find((i) => i.id === 'more')!
    const renamed = { ...more, items: [{ ...more.items![0]!, label: 'Who we are' }, ...more.items!.slice(1)] }
    const { user } = show([renamed])
    await user.click(row('More'))
    expect(screen.queryByRole('button', { name: 'About', expanded: false })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Who we are', expanded: false })).toBeNull()
    // Named after where it goes, a link says nothing more; named otherwise, it says where.
    expect(screen.getByText('Feedback', { selector: 'span' }).nextSibling).toBeNull()
    expect(screen.getByText('Opens the About page')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Take Feedback off' }))
    expect(screen.queryByText('Feedback', { selector: 'span' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('a link added is named as the site calls it', async () => {
    const { user, onChange } = show()
    await user.click(row('+ Add a tab'))
    await user.selectOptions(screen.getByLabelText('+ Add a link'), 'you')
    expect(onChange.mock.lastCall![0].at(-1).items).toEqual([expect.objectContaining({ label: 'You', target: 'you' })])
  })

  it('moves a tab, and a link inside a dropdown, by its handle with the arrow keys', async () => {
    const { user, onChange } = show()
    screen.getByRole('button', { name: 'Move You' }).focus()
    await user.keyboard('{ArrowUp}')
    const [categories, map, you, more] = DEFAULT_DESKTOP_NAV_ITEMS
    expect(onChange).toHaveBeenLastCalledWith([categories, you, map, more])
    await user.click(row('More'))
    screen.getByRole('button', { name: 'Move Privacy' }).focus()
    await user.keyboard('{ArrowUp}')
    const [about, feedback, privacy] = more!.items!
    expect(onChange).toHaveBeenLastCalledWith([categories, you, map, { ...more, items: [about, privacy, feedback] }])
  })

  it('offers the Categories menu back only once it has been taken off', async () => {
    const { user } = show()
    expect(screen.queryByRole('button', { name: '+ Add the Categories menu' })).toBeNull()
    await user.click(row('Categories'))
    await user.click(screen.getByRole('button', { name: 'Take Categories off' }))
    expect(row('+ Add the Categories menu')).toBeInTheDocument()
  })

  it('shows an empty-nav warning when there are no tabs', () => {
    show([])
    expect(screen.getByText(/needs at least one item/)).toBeInTheDocument()
  })
})

describe('DesktopNavEditor — Categories’ headings (the groups)', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(row('Categories'))

  it('opens to its headings, each naming its links, then Other, with no handle and no trash can', async () => {
    const { user } = show()
    await open(user)
    expect(row('Food')).toHaveAccessibleDescription('Grocery Stores')
    expect(row('Other')).toHaveAccessibleDescription('Bakeries · new categories land here')
    expect(screen.queryByRole('button', { name: 'Move Other' })).toBeNull()
    await user.click(row('Other'))
    expect(screen.queryByRole('button', { name: 'Take Other off' })).toBeNull()
    expect(within(screen.getByRole('list')).getByText('Bakeries')).toBeInTheDocument()
  })

  it('+ Add a heading adds one before the home page’s own blocks, open with its name ready', async () => {
    const { user, onSectionsChange } = show(DEFAULT_DESKTOP_NAV_ITEMS, { sections: [food, map] })
    await open(user)
    await user.click(row('+ Add a heading'))
    expect(onSectionsChange.mock.lastCall![0]).toEqual([food, expect.objectContaining({ title: 'New heading', kind: 'section' }), map])
    const name = screen.getAllByRole('textbox', { name: 'Name' }).at(-1)!
    expect(name).toHaveValue('New heading')
    expect(name).toHaveFocus()
    expect(row('New heading')).toBeInTheDocument()
  })

  it('a heading renames in its row', async () => {
    const { user, onSectionsChange } = show()
    await open(user)
    await user.click(row('Food'))
    await user.click(row('Rename Food'))
    const name = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Eat')
    expect(onSectionsChange.mock.lastCall![0]).toEqual([{ ...food, title: 'Eat' }])
  })

  it('its trash can asks once, saying its links move to Other; Leave it keeps it', async () => {
    const { user, onSectionsChange } = show(DEFAULT_DESKTOP_NAV_ITEMS, { sections: [food, map] })
    await open(user)
    await user.click(row('Food'))
    await user.click(screen.getByRole('button', { name: 'Take Food off' }))
    expect(screen.getByText('Take Food off? Its links move to Other.')).toBeInTheDocument()
    await user.click(row('Leave it'))
    expect(onSectionsChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Take Food off' }))
    await user.click(row('Take it off'))
    expect(onSectionsChange).toHaveBeenLastCalledWith([map])
  })

  it('+ Add a link moves a category out of another heading; a heading never offers its own', async () => {
    const drinks: DraftHomeSection = { id: 'drinks', kind: 'section', title: 'Drinks', cardIds: [], width: 'full' }
    const { user, onSectionsChange } = show(DEFAULT_DESKTOP_NAV_ITEMS, { sections: [food, drinks] })
    await open(user)
    await user.click(row('Drinks'))
    expect(screen.getByRole('option', { name: 'Grocery Stores (move here)' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('+ Add a link'), 'grocery')
    expect(onSectionsChange).toHaveBeenLastCalledWith([{ ...food, cardIds: [] }, { ...drinks, cardIds: ['grocery'] }])
    await user.click(row('Food'))
    expect(screen.getByRole('button', { name: 'Food', expanded: true })).toBeInTheDocument()
  })

  it('a link’s × takes it out of its heading; headings move by the handle, leaving the home page’s blocks', async () => {
    const drinks: DraftHomeSection = { id: 'drinks', kind: 'section', title: 'Drinks', cardIds: [], width: 'full' }
    const { user, onSectionsChange } = show(DEFAULT_DESKTOP_NAV_ITEMS, { sections: [food, drinks, map] })
    await open(user)
    screen.getByRole('button', { name: 'Move Drinks' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(onSectionsChange).toHaveBeenLastCalledWith([drinks, food, map])
    await user.click(row('Food'))
    await user.click(screen.getByRole('button', { name: 'Take Grocery Stores off' }))
    expect(onSectionsChange).toHaveBeenLastCalledWith([drinks, { ...food, cardIds: [] }, map])
    await user.click(screen.getByRole('button', { name: 'Food', expanded: true }))
    expect(row('Food')).toHaveAccessibleDescription('Nothing in it yet')
  })
})
