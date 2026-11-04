// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import type { MobileTabConfig } from '@/lib/siteSettings'
import MobileTabsEditor from './MobileTabsEditor'

// The phone's tabs as rows that open, dragged into order (note 28). The
// dragging itself needs layout: e2e-admin-write/drag.spec.ts.

const TABS: MobileTabConfig[] = [
  { id: 't1', label: 'Home', target: 'categories' },
  { id: 't2', label: 'Map', target: 'map' },
  { id: 't3', label: 'You', target: 'you' },
]
const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })

function Harness({ initial, onChange }: { initial: MobileTabConfig[]; onChange?: (t: MobileTabConfig[]) => void }) {
  const [tabs, setTabs] = useState(initial)
  return (
    <MobileTabsEditor
      tabs={tabs}
      onChange={(t) => {
        setTabs(t)
        onChange?.(t)
      }}
    />
  )
}
const show = (initial = TABS, onChange?: (t: MobileTabConfig[]) => void) =>
  renderWithProviders(<Harness initial={initial} onChange={onChange} />, { content: { categories: [grocery] } })

afterEach(() => cleanup())

describe('MobileTabsEditor', () => {
  it('is one row per tab, saying what it opens, with no arrows', () => {
    show()
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAccessibleDescription('Opens the Map')
    expect(screen.getByRole('button', { name: 'You' })).toHaveAccessibleDescription('Opens You')
    expect(screen.getAllByRole('button', { name: /^Move / })).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /earlier|later/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('a row opens to its name, what it opens, and Take it off', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    show(TABS, onChange)
    await user.click(screen.getByRole('button', { name: 'Map' }))
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Find')
    expect(screen.getByRole('button', { name: 'Find' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    expect(onChange).toHaveBeenLastCalledWith([TABS[0], TABS[2]])
  })

  it('moves a tab by its handle with the arrow keys', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    show(TABS, onChange)
    screen.getByRole('button', { name: 'Move You' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith([TABS[0], TABS[2], TABS[1]])
  })

  it('+ Add a tab adds one named after where it goes, and opens it; five at most', async () => {
    const user = userEvent.setup()
    show()
    await user.selectOptions(screen.getByLabelText('+ Add a tab'), 'grocery')
    expect(screen.getByRole('button', { name: 'Grocery Stores' })).toHaveAttribute('aria-expanded', 'true')
    await user.selectOptions(screen.getByLabelText('+ Add a tab'), 'feedback')
    expect(screen.queryByLabelText('+ Add a tab')).toBeNull()
    expect(screen.getByText(/Five tabs at most/)).toBeInTheDocument()
  })
})
