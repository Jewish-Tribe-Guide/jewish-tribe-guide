// @vitest-environment jsdom
import { useState } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DraftHomeSection } from '@/lib/homeSections'
import { SITE_SETTINGS_DEFAULTS, type SiteSettings } from '@/lib/siteSettings'
import DesktopTopicsManager from './DesktopTopicsManager'

// A fully controlled editor (sections/onChange, settings/onSettingChange
// props), like HomeSectionManager — needs no providers at all, so renders
// bare.

function renderManager(
  sections: DraftHomeSection[],
  onChange = vi.fn(),
  settings: SiteSettings = SITE_SETTINGS_DEFAULTS,
  onSettingChange = vi.fn(),
) {
  render(
    <DesktopTopicsManager
      sections={sections}
      onChange={onChange}
      settings={settings}
      onSettingChange={onSettingChange}
    />,
  )
  return { onChange, onSettingChange }
}

// Same reasoning as HomeSectionManager.test.tsx's own ManagerHarness: this
// component never holds its own copy of `sections`/`settings`, only calls
// its onChange callbacks — typing multiple keystrokes into a controlled
// input needs something that actually owns the state and feeds it back,
// same as the real admin page.
function ManagerHarness({
  initialSections,
  initialSettings = SITE_SETTINGS_DEFAULTS,
}: {
  initialSections: DraftHomeSection[]
  initialSettings?: SiteSettings
}) {
  const [sections, setSections] = useState(initialSections)
  const [settings, setSettings] = useState(initialSettings)
  function onSettingChange<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }))
  }
  return (
    <DesktopTopicsManager sections={sections} onChange={setSections} settings={settings} onSettingChange={onSettingChange} />
  )
}

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DesktopTopicsManager', () => {
  // Regression: found live against the real dev database, which still has
  // a 'map' row plus nothing else — reasonable, since 'davening'/
  // 'listings'/'subscribe'/'jewishTimes' are new kinds replacing the old
  // 'zmanim'/'shabbat'/'featured'. DDL only ever widens the DB's allowed
  // kinds, never narrows (see homeSections.ts's own doc), so a row with one
  // of those retired kinds can still be sitting in real data. This crashed
  // the whole Desktop tab with "Cannot read properties of undefined
  // (reading 'title')" before this fix — BUILT_IN_BLOCKS has no entry for
  // a retired kind, and the component read its `.title` unconditionally.
  it('does not crash on a row whose kind predates the current six (e.g. the old "zmanim")', () => {
    const legacy: DraftHomeSection = { id: 'zmanim', kind: 'zmanim' as DraftHomeSection['kind'], title: 'Zmanim & Shabbos', cardIds: [] }
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [] }
    expect(() => renderManager([legacy, map])).not.toThrow()
    expect(screen.getByText('Map Card')).toBeInTheDocument()
    expect(screen.queryByText('Zmanim & Shabbos')).not.toBeInTheDocument()
  })

  it('leaves a legacy-kind row untouched when reordering/adding/removing another card', async () => {
    const user = userEvent.setup()
    const legacy: DraftHomeSection = { id: 'zmanim', kind: 'zmanim' as DraftHomeSection['kind'], title: 'Zmanim & Shabbos', cardIds: [] }
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [] }
    const { onChange } = renderManager([legacy, map])

    await user.click(screen.getByRole('button', { name: /Add “Davening Times Card”/ }))

    expect(onChange).toHaveBeenCalledWith([
      legacy,
      map,
      { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [] },
    ])
  })

  it('lists each configured card by its fixed admin label, with a description under it', () => {
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map', cardIds: [] }
    renderManager([map])

    expect(screen.getByText('Map Card')).toBeInTheDocument()
    expect(screen.getByText(/The map, embedded directly on the home screen\./)).toBeInTheDocument()
  })

  it('shows Eyebrow and Heading inputs for a card that has both, seeded from settings', () => {
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [] }
    renderManager([davening], vi.fn(), { ...SITE_SETTINGS_DEFAULTS, desktopDaveningEyebrow: 'Right now', desktopDaveningHeading: 'Next Minyan' })

    expect(screen.getByDisplayValue('Right now')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Next Minyan')).toBeInTheDocument()
  })

  // Jewish Times has no eyebrow field at all — its real eyebrow is the
  // computed Hebrew date + location, not static text worth overriding (see
  // CARD_META's own doc).
  it('shows only a Heading input for the Jewish Times card, no Eyebrow field', () => {
    const jewishTimes: DraftHomeSection = { id: 'jewishTimes', kind: 'jewishTimes', title: 'Jewish Times Card', cardIds: [] }
    renderManager([jewishTimes])

    expect(screen.getByText('Heading')).toBeInTheDocument()
    expect(screen.queryByText('Eyebrow')).not.toBeInTheDocument()
  })

  it('editing a card\'s Heading input calls onSettingChange with the right key', async () => {
    const user = userEvent.setup()
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [] }
    render(<ManagerHarness initialSections={[map]} />)

    const headingInput = screen.getByDisplayValue(SITE_SETTINGS_DEFAULTS.desktopMapHeading)
    await user.clear(headingInput)
    await user.type(headingInput, 'See the map')

    expect(screen.getByDisplayValue('See the map')).toBeInTheDocument()
  })

  it('offers "+ Add" only for cards missing from the list, one button per missing kind', () => {
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [] }
    renderManager([map])

    expect(screen.queryByRole('button', { name: /Add “Map Card”/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add “Davening Times Card”/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add “Jewish Times Card”/ })).toBeInTheDocument()
  })

  it('clicking "+ Add" appends that card with its fixed id and default title', async () => {
    const user = userEvent.setup()
    const { onChange } = renderManager([])

    await user.click(screen.getByRole('button', { name: /Add “Map Card”/ }))

    expect(onChange).toHaveBeenCalledWith([{ id: 'map', kind: 'map', title: 'Map Card', cardIds: [] }])
  })

  it('removing a card asks for confirmation and removes it', async () => {
    const user = userEvent.setup()
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [] }
    const { onChange } = renderManager([map])

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Map Card'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('leaves the card alone when the remove confirmation is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const user = userEvent.setup()
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [] }
    const { onChange } = renderManager([map])

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('moving a card swaps its position with its neighbor', async () => {
    const user = userEvent.setup()
    const browse: DraftHomeSection = { id: 'browse', kind: 'browse', title: 'Categories and Search Card', cardIds: [] }
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [] }
    const { onChange } = renderManager([browse, map])

    const downButtons = screen.getAllByRole('button', { name: /Move .* down/ })
    await user.click(downButtons[0]!)

    expect(onChange).toHaveBeenCalledWith([map, browse])
  })

  // The same shared draft array also carries plain category sections (see
  // HomeSectionManager) — this component must never touch or reorder them.
  it('leaves a plain section entry riding along in the draft completely untouched', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'a', kind: 'section', title: 'Food', cardIds: ['grocery'] }
    const map: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [] }
    const { onChange } = renderManager([section, map])

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenCalledWith([section])
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
  })
})
