// @vitest-environment jsdom
import { useState } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DraftHomeSection } from '@/lib/homeSections'
import DesktopTopicsManager from './DesktopTopicsManager'

// A fully controlled editor (sections/onChange props), like HomeSectionManager
// — needs no providers at all (no useCategories/useForms), so renders bare.

function renderManager(sections: DraftHomeSection[], onChange = vi.fn()) {
  render(<DesktopTopicsManager sections={sections} onChange={onChange} />)
  return onChange
}

// Same reasoning as HomeSectionManager.test.tsx's own ManagerHarness: this
// component never holds its own copy of `sections`, only calls `onChange` —
// typing multiple keystrokes into a controlled input needs something that
// actually owns the state and feeds it back, same as the real admin page.
function ManagerHarness({ initial }: { initial: DraftHomeSection[] }) {
  const [sections, setSections] = useState(initial)
  return <DesktopTopicsManager sections={sections} onChange={setSections} />
}

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DesktopTopicsManager', () => {
  it('lists each topic by its current title, with a description under it', () => {
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    renderManager([map])

    expect(screen.getByDisplayValue('Explore the map')).toBeInTheDocument()
    expect(screen.getByText(/The map, embedded directly on the home screen\./)).toBeInTheDocument()
  })

  it('renaming a topic calls onChange with the updated title', async () => {
    const user = userEvent.setup()
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    render(<ManagerHarness initial={[map]} />)

    const titleInput = screen.getByDisplayValue('Explore the map')
    await user.clear(titleInput)
    await user.type(titleInput, 'See the map')

    expect(screen.getByDisplayValue('See the map')).toBeInTheDocument()
  })

  it('offers "+ Add" only for topics missing from the list, one button per missing kind', () => {
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    renderManager([map])

    expect(screen.queryByRole('button', { name: /Add “Explore the map”/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add “Popular right now”/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add “Zmanim & Shabbos”/ })).toBeInTheDocument()
  })

  it('clicking "+ Add" appends that topic with its fixed id and default title', async () => {
    const user = userEvent.setup()
    const onChange = renderManager([])

    await user.click(screen.getByRole('button', { name: /Add “Zmanim & Shabbos”/ }))

    expect(onChange).toHaveBeenCalledWith([{ id: 'zmanim', kind: 'zmanim', title: 'Zmanim & Shabbos', cardIds: [] }])
  })

  it('removing a topic asks for confirmation and removes it', async () => {
    const user = userEvent.setup()
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    const onChange = renderManager([map])

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Explore the map'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('leaves the topic alone when the remove confirmation is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const user = userEvent.setup()
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    const onChange = renderManager([map])

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('moving a topic swaps its position with its neighbor', async () => {
    const user = userEvent.setup()
    const featured: DraftHomeSection = { id: 'featured', kind: 'featured', title: 'Popular right now', cardIds: [] }
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    const onChange = renderManager([featured, map])

    const downButtons = screen.getAllByRole('button', { name: 'Move topic down' })
    await user.click(downButtons[0]!)

    expect(onChange).toHaveBeenCalledWith([map, featured])
  })

  // The same shared draft array also carries plain category sections (see
  // HomeSectionManager) — this component must never touch or reorder them.
  it('leaves a plain section entry riding along in the draft completely untouched', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'a', kind: 'section', title: 'Food', cardIds: ['grocery'] }
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    const onChange = renderManager([section, map])

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenCalledWith([section])
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
  })
})
