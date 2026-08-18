// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContentProvider } from '@/lib/contentContext'
import { makeCategory, makeContent } from '@/test/providerFixtures'
import type { DraftHomeSection } from '@/lib/homeSections'
import HomeSectionManager from './HomeSectionManager'

// A fully controlled editor (sections/onChange props) — only needs
// ContentProvider (for useCardOptions' useCategories/useForms), no
// CommunityProvider/router, so this renders directly rather than through
// renderWithProviders.

function renderManager(sections: DraftHomeSection[], onChange = vi.fn(), categories = [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })]) {
  render(
    <ContentProvider content={makeContent({ categories })}>
      <HomeSectionManager sections={sections} onChange={onChange} />
    </ContentProvider>,
  )
  return onChange
}

// HomeSectionManager is fully controlled — it never holds its own copy of
// `sections`, only calls `onChange`. A test that needs to see the UI reflect
// a change across several interactions (not just assert the final onChange
// call) has to actually own that state and feed it back as a new prop, the
// same as the real admin page does.
function ManagerHarness({ initial }: { initial: DraftHomeSection[] }) {
  const [sections, setSections] = useState(initial)
  return (
    <ContentProvider content={makeContent({ categories: [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })] })}>
      <HomeSectionManager sections={sections} onChange={setSections} />
    </ContentProvider>
  )
}

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HomeSectionManager', () => {
  it('lists an unassigned card in the trailing "not in any section" note', () => {
    renderManager([])
    expect(screen.getByText(/Not in any section/)).toBeInTheDocument()
    expect(screen.getByText(/Grocery Stores/)).toBeInTheDocument()
  })

  it('adding a section calls onChange with the new section appended', async () => {
    const user = userEvent.setup()
    const onChange = renderManager([])

    await user.type(screen.getByPlaceholderText('New section title'), 'Essentials')
    await user.click(screen.getByRole('button', { name: 'Add section' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const [sections] = onChange.mock.calls[0]!
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ title: 'Essentials', cardIds: [] })
  })

  it('does not add a section with a blank title', async () => {
    const user = userEvent.setup()
    const onChange = renderManager([])

    expect(screen.getByRole('button', { name: 'Add section' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Add section' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('renaming a section calls onChange with the updated title', async () => {
    const user = userEvent.setup()
    render(<ManagerHarness initial={[{ id: 'sec-1', kind: 'section', title: 'Old Title', cardIds: [] }]} />)

    const titleInput = screen.getByDisplayValue('Old Title')
    await user.clear(titleInput)
    await user.type(titleInput, 'New Title')

    expect(screen.getByDisplayValue('New Title')).toBeInTheDocument()
  })

  it('deleting a section asks for confirmation and removes it once confirmed', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'sec-1', kind: 'section', title: 'Essentials', cardIds: [] }
    const onChange = renderManager([section])

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Essentials'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('leaves the section alone when the delete confirmation is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'sec-1', kind: 'section', title: 'Essentials', cardIds: [] }
    const onChange = renderManager([section])

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('assigning a card via the picker moves it out of "unassigned" and into the section', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'sec-1', kind: 'section', title: 'Essentials', cardIds: [] }
    const onChange = renderManager([section])

    await user.selectOptions(screen.getByRole('combobox'), 'grocery')

    expect(onChange).toHaveBeenCalledWith([{ ...section, cardIds: ['grocery'] }])
  })

  it('removing an assigned card calls onChange without it', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'sec-1', kind: 'section', title: 'Essentials', cardIds: ['grocery'] }
    const onChange = renderManager([section])

    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenCalledWith([{ ...section, cardIds: [] }])
  })

  it('moving a section swaps its position with its neighbor', async () => {
    const user = userEvent.setup()
    const a: DraftHomeSection = { id: 'a', kind: 'section', title: 'A', cardIds: [] }
    const b: DraftHomeSection = { id: 'b', kind: 'section', title: 'B', cardIds: [] }
    const onChange = renderManager([a, b])

    const downButtons = screen.getAllByRole('button', { name: 'Move section down' })
    await user.click(downButtons[0]!)

    expect(onChange).toHaveBeenCalledWith([b, a])
  })

  // Regression test: the "+ Add a card…" picker used to only list cards from
  // the global "unassigned" pool, so once every card had a home the whole
  // control vanished from every section — there was no way left to move a
  // card from one section to another short of removing it first (making it
  // unassigned again) and re-adding it elsewhere.
  it('still offers the picker, listing other sections’ cards, when nothing is unassigned', () => {
    const a: DraftHomeSection = { id: 'a', kind: 'section', title: 'A', cardIds: ['grocery'] }
    const b: DraftHomeSection = { id: 'b', kind: 'section', title: 'B', cardIds: [] }
    renderManager([a, b])

    // Section B's own picker still offers Section A's card, to move it here
    // — same combobox count as before (one per section), but grocery is now
    // reachable from B's dropdown, not just gone until removed from A first.
    const pickers = screen.getAllByRole('combobox')
    expect(pickers).toHaveLength(2)
    expect(screen.getAllByRole('option', { name: 'Grocery Stores (move here)' })).toHaveLength(1)
  })

  it('picking another section’s card from the picker moves it here, out of its old section', async () => {
    const user = userEvent.setup()
    const a: DraftHomeSection = { id: 'a', kind: 'section', title: 'A', cardIds: ['grocery'] }
    const b: DraftHomeSection = { id: 'b', kind: 'section', title: 'B', cardIds: [] }
    const onChange = renderManager([a, b])

    const pickers = screen.getAllByRole('combobox')
    await user.selectOptions(pickers[1]!, 'grocery')

    expect(onChange).toHaveBeenCalledWith([{ ...a, cardIds: [] }, { ...b, cardIds: ['grocery'] }])
  })

  it('a section’s own picker never offers a card already in that same section', () => {
    // Every card option (the two fixed support/volunteer forms plus the one
    // test category) lives in this single section — nothing left its own
    // picker could offer, so it should render no picker at all rather than
    // one listing its own cards back to it.
    const a: DraftHomeSection = { id: 'a', kind: 'section', title: 'A', cardIds: ['support', 'volunteer', 'grocery'] }
    renderManager([a])

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

// The desktop-only "topic" blocks (Popular right now / Explore the map /
// Zmanim & Shabbos) live in the SAME draft array as plain sections (shared
// save pipeline — see homeSectionsDraft.ts) but are edited from their own
// place, DesktopTopicsManager — this component must never render, reorder,
// or lose one of these entries even though they ride along in `sections`.
describe('HomeSectionManager — ignores built-in topic entries riding along in the draft', () => {
  it('never renders a built-in entry as a section row', () => {
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    renderManager([map])

    expect(screen.queryByDisplayValue('Explore the map')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('adding a section leaves an existing built-in entry untouched, in its original relative position', async () => {
    const user = userEvent.setup()
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    const onChange = renderManager([map])

    await user.type(screen.getByPlaceholderText('New section title'), 'Essentials')
    await user.click(screen.getByRole('button', { name: 'Add section' }))

    const [sections] = onChange.mock.calls[0]!
    expect(sections).toEqual([expect.objectContaining({ title: 'Essentials' }), map])
  })

  it('reordering sections never moves a built-in entry out of the draft', async () => {
    const user = userEvent.setup()
    const a: DraftHomeSection = { id: 'a', kind: 'section', title: 'A', cardIds: [] }
    const b: DraftHomeSection = { id: 'b', kind: 'section', title: 'B', cardIds: [] }
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    const onChange = renderManager([a, b, map])

    const downButtons = screen.getAllByRole('button', { name: 'Move section down' })
    await user.click(downButtons[0]!)

    expect(onChange).toHaveBeenCalledWith([b, a, map])
  })

  it('deleting a section leaves a built-in entry elsewhere in the draft untouched', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'a', kind: 'section', title: 'Essentials', cardIds: [] }
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [] }
    const onChange = renderManager([section, map])

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onChange).toHaveBeenCalledWith([map])
  })
})
