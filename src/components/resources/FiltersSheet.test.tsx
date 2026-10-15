// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FiltersSheet, { TOP_ITEMS } from './FiltersSheet'
import MapFiltersSheet from '@/components/map/MapFiltersSheet'

const viewport = vi.hoisted(() => ({ mobile: true }))
vi.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => viewport.mobile }))
afterEach(() => {
  cleanup()
  viewport.mobile = true
})

// Oct 6: on a phone, Filters drags down to close, like the listing, “+ Add”
// and Add a place sheets. It was the plain sheet with only a ✕.
describe('Filters on a phone', () => {
  it('a category page’s drags', () => {
    render(
      <FiltersSheet isOpen onClose={() => {}} hasOpenNow openNow={false} onOpenNow={() => {}} booleans={[]} onBoolean={() => {}} selects={[]} onSelect={() => {}} onClearAll={() => {}} count={3} />,
    )
    expect(screen.getByRole('button', { name: 'Drag to resize' })).toBeInTheDocument()
  })

  it('the Map’s drags', () => {
    render(
      <MapFiltersSheet
        isOpen
        onClose={() => {}}
        top={{ shown: false, on: false, note: null }}
        onTopOpenNow={() => {}}
        sections={[]}
        onOpenNow={() => {}}
        onBoolean={() => {}}
        onSelect={() => {}}
        onClearAll={() => {}}
        anyOn={false}
        count={3}
      />,
    )
    expect(screen.getByRole('button', { name: 'Drag to resize' })).toBeInTheDocument()
  })
})

// Oct 15: "All N items" is a step inside the sheet, so its name takes the
// sheet's title, with Back before it — "‹ Has" where "Filters" was. It used to
// open under "Filters" with a back chip and "Has · 10 items" of its own: two
// titles and two ways back, stacked. The same on a phone and in the dialog.
describe('“All N items” takes the header', () => {
  const tags = Array.from({ length: TOP_ITEMS + 2 }, (_, i) => ({ tag: `Item ${String.fromCharCode(65 + i)}`, count: 1 }))
  const sheet = (isOpen = true) => (
    <FiltersSheet
      isOpen={isOpen}
      onClose={() => {}}
      hasOpenNow={false}
      openNow={false}
      onOpenNow={() => {}}
      booleans={[]}
      onBoolean={() => {}}
      selects={[]}
      onSelect={() => {}}
      items={[{ key: 'm', label: 'Has', counts: tags, chosen: [] }]}
      onItem={() => {}}
      onClearAll={() => {}}
      count={3}
    />
  )

  for (const mobile of [true, false]) {
    it(mobile ? 'on a phone' : 'in the dialog', async () => {
      viewport.mobile = mobile
      const user = userEvent.setup()
      render(sheet())
      await user.click(screen.getByRole('button', { name: `All ${tags.length} items` }))

      const dialog = screen.getByRole('dialog', { name: 'Has' })
      expect(within(dialog).getByRole('heading', { name: 'Has' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('heading', { name: 'Filters' })).not.toBeInTheDocument()
      // No second heading, and no "· 10 items" under the title.
      expect(within(screen.getByTestId('all-items')).queryByRole('heading')).not.toBeInTheDocument()
      expect(dialog).not.toHaveTextContent(/·\s*\d+ items/)
      // One way back, the header's.
      const backs = within(dialog).getAllByRole('button', { name: /^Back/ })
      expect(backs).toHaveLength(1)

      await user.click(backs[0])
      expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
      expect(screen.queryByTestId('all-items')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Back/ })).not.toBeInTheDocument()
    })
  }

  it('opens again on the whole list, not where it was left', async () => {
    viewport.mobile = false
    const user = userEvent.setup()
    const { rerender } = render(sheet())
    await user.click(screen.getByRole('button', { name: `All ${tags.length} items` }))
    rerender(sheet(false))
    rerender(sheet(true))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
    expect(screen.queryByTestId('all-items')).not.toBeInTheDocument()
  })
})
