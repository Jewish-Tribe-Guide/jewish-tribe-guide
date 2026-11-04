// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

// support/volunteer only show up as card options when their (published,
// active) form exists — see useCardOptions in HomeSectionManager.tsx — so
// tests that rely on those two fixed cards being offered need a forms
// fixture, not just the default empty one.
const supportVolunteerForms = [
  { id: 'support', title: 'Patient & Family Support', steps: [], submitLabel: '', successTitle: '', successMessage: '', icon: '', active: true },
  { id: 'volunteer', title: 'Volunteer for Patients', steps: [], submitLabel: '', successTitle: '', successMessage: '', icon: '', active: true },
]

function renderManager(
  sections: DraftHomeSection[],
  onChange = vi.fn(),
  categories = [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })],
  forms = supportVolunteerForms,
) {
  render(
    <ContentProvider content={makeContent({ categories, forms })}>
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

afterEach(() => cleanup())

const open = (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(screen.getByRole('button', { name }))

// Each group one row naming its cards, opening to its name and its cards
// (note 26). Dragging itself needs layout: e2e-admin-write/drag.spec.ts.
describe('HomeSectionManager', () => {
  it('lists an unassigned card as being in More', () => {
    renderManager([])
    expect(screen.getByText(/In More, at the end:.*Grocery Stores/)).toBeInTheDocument()
  })

  it('a group is one row with its cards under it, and no arrows', () => {
    const section: DraftHomeSection = { id: 'sec-1', kind: 'section', title: 'Essentials', cardIds: ['grocery', 'support'], width: 'full' }
    renderManager([section])
    expect(screen.getByRole('button', { name: 'Essentials' })).toHaveAccessibleDescription('Grocery Stores · Patient & Family Support')
    expect(screen.getByRole('button', { name: 'Move Essentials' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Move section/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('+ Add a group adds one and opens it to its name', async () => {
    const user = userEvent.setup()
    render(<ManagerHarness initial={[]} />)
    await user.click(screen.getByRole('button', { name: '+ Add a group' }))
    expect(screen.getByRole('button', { name: 'New group' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Name')).toHaveValue('New group')
  })

  it('renaming a group renames its row', async () => {
    const user = userEvent.setup()
    render(<ManagerHarness initial={[{ id: 'sec-1', kind: 'section', title: 'Old Title', cardIds: [], width: 'full' }]} />)
    await open(user, 'Old Title')
    const titleInput = screen.getByLabelText('Name')
    await user.clear(titleInput)
    await user.type(titleInput, 'New Title')
    expect(screen.getByRole('button', { name: 'New Title' })).toBeInTheDocument()
  })

  it('Take it off asks once, says its cards move to More, and Leave it keeps it', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'sec-1', kind: 'section', title: 'Essentials', cardIds: [], width: 'full' }
    const onChange = renderManager([section])
    await open(user, 'Essentials')
    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    expect(screen.getByText('Take Essentials off? Its cards move to More.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave it' }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('+ Add a card puts a card in the group', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'sec-1', kind: 'section', title: 'Essentials', cardIds: [], width: 'full' }
    const onChange = renderManager([section])
    await open(user, 'Essentials')
    await user.selectOptions(screen.getByLabelText('+ Add a card'), 'grocery')
    expect(onChange).toHaveBeenCalledWith([{ ...section, cardIds: ['grocery'] }])
  })

  it('a card’s × takes it out of the group', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'sec-1', kind: 'section', title: 'Essentials', cardIds: ['grocery'], width: 'full' }
    const onChange = renderManager([section])
    await open(user, 'Essentials')
    await user.click(screen.getByRole('button', { name: 'Take Grocery Stores off' }))
    expect(onChange).toHaveBeenCalledWith([{ ...section, cardIds: [] }])
  })

  it('moves a group, and a card inside one, by its handle with the arrow keys', async () => {
    const user = userEvent.setup()
    const a: DraftHomeSection = { id: 'a', kind: 'section', title: 'A', cardIds: ['grocery', 'support'], width: 'full' }
    const b: DraftHomeSection = { id: 'b', kind: 'section', title: 'B', cardIds: [], width: 'full' }
    const onChange = renderManager([a, b])
    screen.getByRole('button', { name: 'Move A' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith([b, a])
    await open(user, 'A')
    screen.getByRole('button', { name: 'Move Patient & Family Support' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith([{ ...a, cardIds: ['support', 'grocery'] }, b])
  })

  // Regression test: the "+ Add a card" picker used to only list cards from
  // the global "unassigned" pool, so once every card had a home the whole
  // control vanished from every group — there was no way left to move a
  // card from one group to another short of removing it first.
  it('still offers the picker, listing other groups’ cards, when nothing is unassigned', async () => {
    const user = userEvent.setup()
    const a: DraftHomeSection = { id: 'a', kind: 'section', title: 'A', cardIds: ['grocery'], width: 'full' }
    const b: DraftHomeSection = { id: 'b', kind: 'section', title: 'B', cardIds: [], width: 'full' }
    const onChange = renderManager([a, b])
    await open(user, 'B')
    expect(screen.getByRole('option', { name: 'Grocery Stores (move here)' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('+ Add a card'), 'grocery')
    expect(onChange).toHaveBeenCalledWith([{ ...a, cardIds: [] }, { ...b, cardIds: ['grocery'] }])
  })

  it('a group’s own picker never offers a card already in that same group', async () => {
    const user = userEvent.setup()
    const a: DraftHomeSection = { id: 'a', kind: 'section', title: 'A', cardIds: ['support', 'volunteer', 'grocery'], width: 'full' }
    renderManager([a])
    await open(user, 'A')
    expect(screen.queryByLabelText('+ Add a card')).not.toBeInTheDocument()
  })
})

// The desktop-only cards live in the SAME draft array as plain groups
// (shared save pipeline — see homeSectionsDraft.ts) but are edited from
// DesktopTopicsManager — this component must never render, reorder, or lose
// one of these entries even though they ride along in `sections`.
describe('HomeSectionManager — ignores built-in entries riding along in the draft', () => {
  const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Explore the map', cardIds: [], width: 'full' }

  it('never renders a built-in entry as a group row', () => {
    renderManager([map])
    expect(screen.queryByRole('button', { name: 'Explore the map' })).not.toBeInTheDocument()
  })

  it('adding a group leaves an existing built-in entry untouched, after the groups', async () => {
    const user = userEvent.setup()
    const onChange = renderManager([map])
    await user.click(screen.getByRole('button', { name: '+ Add a group' }))
    expect(onChange.mock.calls[0]![0]).toEqual([expect.objectContaining({ title: 'New group', kind: 'section' }), map])
  })

  it('reordering groups never moves a built-in entry out of the draft', async () => {
    const user = userEvent.setup()
    const a: DraftHomeSection = { id: 'a', kind: 'section', title: 'A', cardIds: [], width: 'full' }
    const b: DraftHomeSection = { id: 'b', kind: 'section', title: 'B', cardIds: [], width: 'full' }
    const onChange = renderManager([a, b, map])
    screen.getByRole('button', { name: 'Move A' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenCalledWith([b, a, map])
  })

  it('taking a group off leaves a built-in entry elsewhere in the draft untouched', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'a', kind: 'section', title: 'Essentials', cardIds: [], width: 'full' }
    const onChange = renderManager([section, map])
    await open(user, 'Essentials')
    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    expect(onChange).toHaveBeenCalledWith([map])
  })
})
