// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import FiltersSheet from './FiltersSheet'
import MapFiltersSheet from '@/components/map/MapFiltersSheet'

vi.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => true }))
afterEach(() => cleanup())

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
