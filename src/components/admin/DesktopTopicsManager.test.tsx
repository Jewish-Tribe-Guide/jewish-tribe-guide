// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DraftHomeSection, HomeBlockKind } from '@/lib/homeSections'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import DesktopTopicsManager from './DesktopTopicsManager'

// A fully controlled editor (sections/onChange props), like
// HomeSectionManager — needs no providers at all, so renders bare.

function renderManager(sections: DraftHomeSection[], onChange = vi.fn(), onPointCard = vi.fn()) {
  render(<DesktopTopicsManager sections={sections} onChange={onChange} settings={SITE_SETTINGS_DEFAULTS} onPointCard={onPointCard} />)
  return { onChange, onPointCard }
}

// Owns the draft and feeds it back, as the admin page does, so several
// moves in a row each start from the last one.
function ManagerHarness({ initialSections, onChange }: { initialSections: DraftHomeSection[]; onChange: (s: DraftHomeSection[]) => void }) {
  const [sections, setSections] = useState(initialSections)
  return (
    <DesktopTopicsManager
      sections={sections}
      onChange={(next) => {
        onChange(next)
        setSections(next)
      }}
      settings={SITE_SETTINGS_DEFAULTS}
    />
  )
}

const TITLES: Partial<Record<HomeBlockKind, string>> = {
  browse: 'Categories Card',
  davening: 'Davening Times Card',
  listings: 'Update Listings Card',
  suggest: 'Suggest a Listing Card',
  subscribe: 'Email Signup Card',
  jewishTimes: 'Jewish Times Card',
}
function card(kind: HomeBlockKind, sharesRow = false): DraftHomeSection {
  return { id: kind, kind, title: TITLES[kind] ?? kind, cardIds: [], sharesRow }
}

const LISTINGS = SITE_SETTINGS_DEFAULTS.desktopListingsHeading
const SUBSCRIBE = SITE_SETTINGS_DEFAULTS.desktopSubscribeHeading

/** Each row's cards by name, as the list draws them: a box per shared row. */
function drawnRows(): string[][] {
  const rows: string[][] = []
  let open = false
  for (const el of document.querySelectorAll('[data-drag-row]')) {
    const name = el.querySelector('.font-medium')?.textContent
    if (!name) continue
    const slot = el.parentElement!.className
    const inBox = slot.includes('border-x')
    if (!inBox || slot.includes('rounded-t')) rows.push([])
    rows.at(-1)!.push(name)
    open = inBox && !slot.includes('rounded-b')
  }
  expect(open).toBe(false)
  return rows
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DesktopTopicsManager', () => {
  // DDL only ever widens the DB's allowed kinds, never narrows (see
  // homeSections.ts's own doc), so a row with a retired kind ('zmanim',
  // 'map') can still be sitting in real data. That once crashed the whole
  // tab: BUILT_IN_BLOCKS has no entry for a retired kind.
  it('does not crash on a row whose kind is retired (the old "zmanim", or "map"), and lists none', () => {
    const legacyZmanim: DraftHomeSection = { id: 'zmanim', kind: 'zmanim' as DraftHomeSection['kind'], title: 'Zmanim & Shabbos', cardIds: [], sharesRow: false }
    expect(() => renderManager([legacyZmanim, card('map'), card('davening')])).not.toThrow()
    expect(drawnRows()).toEqual([['Davening Times']])
    expect(screen.queryByText('Zmanim & Shabbos')).not.toBeInTheDocument()
  })

  it('leaves retired-kind rows untouched when adding a card', async () => {
    const user = userEvent.setup()
    const legacyZmanim: DraftHomeSection = { id: 'zmanim', kind: 'zmanim' as DraftHomeSection['kind'], title: 'Zmanim & Shabbos', cardIds: [], sharesRow: false }
    const { onChange } = renderManager([legacyZmanim, card('map')])

    await user.click(screen.getByRole('button', { name: '+ Add Davening Times' }))

    expect(onChange).toHaveBeenCalledWith([legacyZmanim, card('map'), card('davening')])
  })

  // The drawing (artifact 8HpeQANzsQyGbyHVPsXrc5): a card alone fills its
  // row; cards that share one sit in one box.
  it('draws cards that share a row in one box, and a card alone on its own', () => {
    renderManager([card('browse'), card('davening'), card('listings', true), card('suggest', true), card('subscribe')])
    expect(drawnRows()).toEqual([['Categories'], ['Davening Times', LISTINGS, 'Suggest a Listing'], [SUBSCRIBE]])
  })

  // The same rules as the home page (cardRows): a saved row can't put
  // Categories beside anything, or a fourth card in a row.
  it('keeps Categories alone and a row to three, whatever was saved', () => {
    renderManager([card('browse'), card('davening', true), card('listings', true), card('suggest', true), card('subscribe', true)])
    expect(drawnRows()).toEqual([['Categories'], ['Davening Times', LISTINGS, 'Suggest a Listing'], [SUBSCRIBE]])
  })

  // Nothing opens: each card is a handle, its name and an ×.
  it('takes a card off with its ×, at once', async () => {
    const user = userEvent.setup()
    const { onChange } = renderManager([card('davening'), card('subscribe')])

    expect(screen.queryByRole('button', { expanded: false })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Take Davening Times off' }))

    expect(onChange).toHaveBeenCalledWith([card('subscribe')])
    expect(screen.queryByText(/off the home page\?/)).toBeNull()
  })

  it('taking off the first card of a row leaves the rest of that row together', async () => {
    const user = userEvent.setup()
    const { onChange } = renderManager([card('davening'), card('listings', true), card('suggest', true)])

    await user.click(screen.getByRole('button', { name: 'Take Davening Times off' }))

    expect(onChange).toHaveBeenCalledWith([card('listings'), card('suggest', true)])
  })

  // 'map' is retired, so there's no "+ Add" for it under any circumstance.
  it('offers "+ Add" for each card not in the list, Suggest a Listing included, never the map', () => {
    renderManager([card('davening')])
    const adds = screen.getAllByRole('button', { name: /^\+ Add / }).map((b) => b.textContent)
    expect(adds).toEqual(['+ Add Categories', `+ Add ${LISTINGS}`, '+ Add Suggest a Listing', `+ Add ${SUBSCRIBE}`, `+ Add ${SITE_SETTINGS_DEFAULTS.desktopJewishTimesHeading}`])
  })

  it('"+ Add" puts the card back at the bottom, in a row of its own', async () => {
    const user = userEvent.setup()
    const { onChange } = renderManager([card('davening'), card('listings', true)])

    await user.click(screen.getByRole('button', { name: '+ Add Suggest a Listing' }))

    expect(onChange).toHaveBeenCalledWith([card('davening'), card('listings', true), card('suggest')])
  })

  // Dragging needs layout, so it is in e2e-admin-write; here, the handle's
  // keyboard, which steps through the same places a drag drops in.
  it('moves a card by its handle with the arrow keys, past Categories, which shares with nothing', async () => {
    const user = userEvent.setup()
    const { onChange } = renderManager([card('browse'), card('davening')])

    expect(screen.getAllByRole('button', { name: /^Move / })).toHaveLength(2)
    screen.getByRole('button', { name: 'Move Categories' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(onChange).not.toHaveBeenCalled()
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenCalledWith([card('davening'), card('browse')])
  })

  it('each arrow press changes the rows: into the next row, along it, then a row of its own', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ManagerHarness initialSections={[card('davening'), card('subscribe')]} onChange={onChange} />)

    screen.getByRole('button', { name: 'Move Davening Times' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith([card('davening'), card('subscribe', true)])
    expect(drawnRows()).toEqual([['Davening Times', SUBSCRIBE]])

    screen.getByRole('button', { name: 'Move Davening Times' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith([card('subscribe'), card('davening', true)])

    screen.getByRole('button', { name: 'Move Davening Times' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith([card('subscribe'), card('davening')])
    expect(drawnRows()).toEqual([[SUBSCRIBE], ['Davening Times']])
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('a full row of three takes no fourth: the card moving up goes over it', async () => {
    const user = userEvent.setup()
    const { onChange } = renderManager([card('davening'), card('listings', true), card('suggest', true), card('subscribe')])

    screen.getByRole('button', { name: `Move ${SUBSCRIBE}` }).focus()
    await user.keyboard('{ArrowUp}')

    expect(onChange).toHaveBeenCalledWith([card('subscribe'), card('davening'), card('listings', true), card('suggest', true)])
  })

  // Nothing opens, so the preview lights a card while the mouse is on it.
  it('points the preview at the card under the mouse', () => {
    const { onPointCard } = renderManager([card('davening')])
    const row = screen.getByText('Davening Times').closest('[data-drag-row]')!.firstElementChild!
    fireEvent.mouseEnter(row)
    expect(onPointCard).toHaveBeenLastCalledWith('davening')
    fireEvent.mouseLeave(row)
    expect(onPointCard).toHaveBeenLastCalledWith(null)
  })

  // The same shared draft array also carries plain category sections (see
  // DesktopNavEditor's Categories headings) — this component must never touch or reorder them.
  it('leaves a plain section entry riding along in the draft completely untouched', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'a', kind: 'section', title: 'Food', cardIds: ['grocery'], sharesRow: false }
    const { onChange } = renderManager([section, card('davening')])

    await user.click(screen.getByRole('button', { name: 'Take Davening Times off' }))

    expect(onChange).toHaveBeenCalledWith([section])
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
  })
})
