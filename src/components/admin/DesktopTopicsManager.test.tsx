// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Each card is a row that opens in place (board 7).
async function openRow(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name }))
}

describe('DesktopTopicsManager', () => {
  // Regression: found live against the real dev database, which still had
  // a 'map' row plus nothing else — reasonable, since 'davening'/
  // 'listings'/'subscribe'/'jewishTimes' are new kinds replacing the old
  // 'zmanim'/'shabbat'/'featured'. DDL only ever widens the DB's allowed
  // kinds, never narrows (see homeSections.ts's own doc), so a row with one
  // of those retired kinds can still be sitting in real data. This crashed
  // the whole Desktop tab with "Cannot read properties of undefined
  // (reading 'title')" before this fix — BUILT_IN_BLOCKS has no entry for
  // a retired kind, and the component read its `.title` unconditionally.
  //
  // 'map' (the home screen's own embedded map card) has since retired too —
  // the same "old row, still in some community's real data" story applies
  // to it now, alongside 'zmanim'.
  it('does not crash on a row whose kind predates the current five (e.g. the old "zmanim", or the since-retired "map")', () => {
    const legacyZmanim: DraftHomeSection = { id: 'zmanim', kind: 'zmanim' as DraftHomeSection['kind'], title: 'Zmanim & Shabbos', cardIds: [], width: 'full' }
    const legacyMap: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [], width: 'full' }
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' }
    expect(() => renderManager([legacyZmanim, legacyMap, davening])).not.toThrow()
    expect(screen.getByText('Davening Times')).toBeInTheDocument()
    expect(screen.queryByText('Zmanim & Shabbos')).not.toBeInTheDocument()
    expect(screen.queryByText('Map Card')).not.toBeInTheDocument()
  })

  it('leaves legacy-kind rows untouched when reordering/adding/removing another card', async () => {
    const user = userEvent.setup()
    const legacyZmanim: DraftHomeSection = { id: 'zmanim', kind: 'zmanim' as DraftHomeSection['kind'], title: 'Zmanim & Shabbos', cardIds: [], width: 'full' }
    const legacyMap: DraftHomeSection = { id: 'map', kind: 'map', title: 'Map Card', cardIds: [], width: 'full' }
    const { onChange } = renderManager([legacyZmanim, legacyMap])

    await user.click(screen.getByRole('button', { name: /Add “Davening Times Card”/ }))

    expect(onChange).toHaveBeenCalledWith([
      legacyZmanim,
      legacyMap,
      { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' },
    ])
  })

  it('defaults to Full width selected, and clicking Half width calls onChange with the updated card', async () => {
    const user = userEvent.setup()
    const subscribe: DraftHomeSection = { id: 'subscribe', kind: 'subscribe', title: 'Email Signup Card', cardIds: [], width: 'full' }
    const { onChange } = renderManager([subscribe])
    await openRow(userEvent.setup(), /^Stay in the Loop/)

    expect(screen.getByRole('button', { name: 'Full width' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Half width' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Half width' }))

    expect(onChange).toHaveBeenCalledWith([{ ...subscribe, width: 'half' }])
  })

  // Davening Times and Update Listings always share one row on the home with
  // Suggest a Listing, which ignores their width (Landing.tsx).
  it('offers no width for the two cards that always share a row', async () => {
    const user = userEvent.setup()
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' }
    const listings: DraftHomeSection = { id: 'listings', kind: 'listings', title: 'Update Listings Card', cardIds: [], width: 'full' }
    renderManager([davening, listings])
    await openRow(user, /^Davening Times/)
    await openRow(user, new RegExp(`^${SITE_SETTINGS_DEFAULTS.desktopListingsHeading}`))

    expect(screen.queryByRole('button', { name: 'Full width' })).not.toBeInTheDocument()
  })

  it('shows a hint explaining pairing only once a card is set to Half width', async () => {
    const user = userEvent.setup()
    const subscribe: DraftHomeSection = { id: 'subscribe', kind: 'subscribe', title: 'Email Signup Card', cardIds: [], width: 'full' }
    render(<ManagerHarness initialSections={[subscribe]} />)
    await openRow(user, /^Stay in the Loop/)

    expect(screen.queryByText(/beside the next half-width card/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Half width' }))
    expect(screen.getByText(/beside the next half-width card/i)).toBeInTheDocument()
  })

  it('lists each card as a row named by what visitors see, with one line under it', () => {
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening', cardIds: [], width: 'full' }
    const subscribe: DraftHomeSection = { id: 'subscribe', kind: 'subscribe', title: 'Email Signup Card', cardIds: [], width: 'full' }
    renderManager([davening, subscribe], vi.fn(), { ...SITE_SETTINGS_DEFAULTS, desktopSubscribeHeading: 'Stay in the Loop' })

    const davRow = screen.getByRole('button', { name: 'Davening Times' })
    expect(davRow).toHaveAttribute('aria-expanded', 'false')
    expect(davRow).toHaveAccessibleDescription('The next minyan, beside the listings card')
    expect(screen.getByRole('button', { name: 'Stay in the Loop' })).toHaveAccessibleDescription('Email sign-up')
    // Closed, a row shows nothing else.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows Eyebrow and Heading inputs for a card that has both, seeded from settings', async () => {
    const listings: DraftHomeSection = { id: 'listings', kind: 'listings', title: 'Update Listings Card', cardIds: [], width: 'full' }
    renderManager([listings], vi.fn(), { ...SITE_SETTINGS_DEFAULTS, desktopListingsEyebrow: 'Right now', desktopListingsHeading: 'Kept by you' })
    await openRow(userEvent.setup(), /^Kept by you/)

    expect(screen.getByDisplayValue('Right now')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Kept by you')).toBeInTheDocument()
  })

  // Their titles are fixed on the site, so a field for them would change nothing.
  it('shows no text fields for the Categories and Davening Times cards', async () => {
    const user = userEvent.setup()
    const browse: DraftHomeSection = { id: 'browse', kind: 'browse', title: 'Browse', cardIds: [], width: 'full' }
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' }
    renderManager([browse, davening])
    await openRow(user, /^Categories and Search/)
    await openRow(user, /^Davening Times/)

    expect(screen.queryByText('Heading')).not.toBeInTheDocument()
    expect(screen.queryByText('Small line above')).not.toBeInTheDocument()
  })

  // Jewish Times has no eyebrow field at all — its real eyebrow is the
  // computed Hebrew date + location, not static text worth overriding (see
  // CARD_META's own doc).
  it('shows only a Heading input for the Jewish Times card, no Eyebrow field', async () => {
    const jewishTimes: DraftHomeSection = { id: 'jewishTimes', kind: 'jewishTimes', title: 'Jewish Times Card', cardIds: [], width: 'full' }
    renderManager([jewishTimes])
    await openRow(userEvent.setup(), new RegExp(`^${SITE_SETTINGS_DEFAULTS.desktopJewishTimesHeading}`))

    expect(screen.getByText('Heading')).toBeInTheDocument()
    expect(screen.queryByText('Small line above')).not.toBeInTheDocument()
  })

  it('editing a card\'s Heading input calls onSettingChange with the right key', async () => {
    const user = userEvent.setup()
    const listings: DraftHomeSection = { id: 'listings', kind: 'listings', title: 'Update Listings Card', cardIds: [], width: 'full' }
    render(<ManagerHarness initialSections={[listings]} />)
    await openRow(user, new RegExp(`^${SITE_SETTINGS_DEFAULTS.desktopListingsHeading}`))

    const headingInput = screen.getByDisplayValue(SITE_SETTINGS_DEFAULTS.desktopListingsHeading)
    await user.clear(headingInput)
    await user.type(headingInput, 'See the times')

    expect(screen.getByDisplayValue('See the times')).toBeInTheDocument()
  })

  // 'map' is deliberately absent from both sides of this assertion — it's
  // no longer offered at all (see CARD_META's own doc), not just already
  // configured, so there's no "+ Add" button for it under any circumstance.
  it('offers "+ Add" only for cards missing from the list, one button per missing kind — never for the retired map card', () => {
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' }
    renderManager([davening])

    expect(screen.queryByRole('button', { name: /Add “Davening Times Card”/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add “Categories and Search Card”/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add “Jewish Times Card”/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add “Map/ })).not.toBeInTheDocument()
  })

  it('clicking "+ Add" appends that card with its fixed id and default title', async () => {
    const user = userEvent.setup()
    const { onChange } = renderManager([])

    await user.click(screen.getByRole('button', { name: /Add “Davening Times Card”/ }))

    expect(onChange).toHaveBeenCalledWith([{ id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' }])
  })

  it('taking a card off asks once, then takes it off', async () => {
    const user = userEvent.setup()
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' }
    const { onChange } = renderManager([davening])
    await openRow(user, /^Davening Times/)

    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    expect(screen.getByText('Take Davening Times off the home page?')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Take it off' }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('leaves the card alone on Leave it', async () => {
    const user = userEvent.setup()
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' }
    const { onChange } = renderManager([davening])
    await openRow(user, /^Davening Times/)

    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    await user.click(screen.getByRole('button', { name: 'Leave it' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Take it off' })).toBeInTheDocument()
  })

  it('moving a card swaps its position with its neighbor', async () => {
    const user = userEvent.setup()
    const browse: DraftHomeSection = { id: 'browse', kind: 'browse', title: 'Categories and Search Card', cardIds: [], width: 'full' }
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' }
    const { onChange } = renderManager([browse, davening])
    await openRow(user, /^Categories and Search/)

    const downButtons = screen.getAllByRole('button', { name: /Move .* down/ })
    await user.click(downButtons[0]!)

    expect(onChange).toHaveBeenCalledWith([davening, browse])
  })

  // The same shared draft array also carries plain category sections (see
  // HomeSectionManager) — this component must never touch or reorder them.
  it('leaves a plain section entry riding along in the draft completely untouched', async () => {
    const user = userEvent.setup()
    const section: DraftHomeSection = { id: 'a', kind: 'section', title: 'Food', cardIds: ['grocery'], width: 'full' }
    const davening: DraftHomeSection = { id: 'davening', kind: 'davening', title: 'Davening Times Card', cardIds: [], width: 'full' }
    const { onChange } = renderManager([section, davening])

    await openRow(user, /^Davening Times/)
    await user.click(screen.getByRole('button', { name: 'Take it off' }))
    await user.click(screen.getByRole('button', { name: 'Take it off' }))

    expect(onChange).toHaveBeenCalledWith([section])
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
  })
})
