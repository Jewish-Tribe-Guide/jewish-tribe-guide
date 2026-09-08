// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeCategory } from '@/test/providerFixtures'
import type { CategoryField } from '@/lib/categories'
import CategoryFilter, { type FilterOption } from './CategoryFilter'

afterEach(() => {
  cleanup()
})

// No providers needed — CategoryFilter is pure props, and useIsMobile()
// reads window.matchMedia, already polyfilled (always-desktop) in
// vitest.setup.ts.

function option(overrides: Partial<FilterOption> = {}): FilterOption {
  return {
    id: 'grocery',
    label: 'Grocery',
    color: '#1d4ed8',
    count: 5,
    ...overrides,
  }
}

function baseProps(overrides: Partial<React.ComponentProps<typeof CategoryFilter>> = {}) {
  return {
    options: [option()],
    selected: new Set(['grocery']),
    onToggle: vi.fn(),
    onAll: vi.fn(),
    categories: [],
    points: [],
    boolFields: [],
    onToggleBool: vi.fn(),
    selectFilters: {},
    onToggleSelectValue: vi.fn(),
    ...overrides,
  }
}

describe('CategoryFilter', () => {
  it('renders an All chip plus one chip per option, with its label and count', () => {
    render(<CategoryFilter {...baseProps({ options: [option({ id: 'grocery', label: 'Grocery', count: 5 })] })} />)

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Grocery/ })).toHaveTextContent('5')
  })

  it('calls onAll when the All chip is clicked', async () => {
    const user = userEvent.setup()
    const onAll = vi.fn()
    render(<CategoryFilter {...baseProps({ onAll })} />)

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(onAll).toHaveBeenCalledTimes(1)
  })

  it('calls onToggle with the option id when its chip is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<CategoryFilter {...baseProps({ onToggle, options: [option({ id: 'grocery', label: 'Grocery' })] })} />)

    await user.click(screen.getByRole('button', { name: /Grocery/ }))
    expect(onToggle).toHaveBeenCalledWith('grocery')
  })

  it('marks the All chip pressed only when every option is selected', () => {
    const options = [option({ id: 'grocery' }), option({ id: 'dentist', label: 'Dentist' })]
    const { rerender } = render(
      <CategoryFilter {...baseProps({ options, selected: new Set(['grocery', 'dentist']) })} />,
    )
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')

    rerender(<CategoryFilter {...baseProps({ options, selected: new Set(['grocery']) })} />)
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders the pinned chip right after All, when provided', () => {
    render(<CategoryFilter {...baseProps({ pinnedChip: <button>Pinned</button> })} />)

    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons[0]).toBe('All')
    expect(buttons[1]).toBe('Pinned')
  })

  describe('maxVisible truncation', () => {
    const options = [
      option({ id: 'food', label: 'Food', count: 70 }),
      option({ id: 'grocery', label: 'Grocery', count: 22 }),
      option({ id: 'synagogues', label: 'Synagogues', count: 15 }),
      option({ id: 'childcare', label: 'Childcare', count: 3 }),
    ]

    it('shows only maxVisible chips plus a More chip for the rest', () => {
      render(<CategoryFilter {...baseProps({ options, selected: new Set(options.map((o) => o.id)), maxVisible: 2 })} />)

      expect(screen.getByRole('button', { name: /Food/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Grocery/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Synagogues/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Childcare/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '⋯ More' })).toBeInTheDocument()
    })

    it('calls onMore when the More chip is clicked', async () => {
      const user = userEvent.setup()
      const onMore = vi.fn()
      render(
        <CategoryFilter
          {...baseProps({ options, selected: new Set(options.map((o) => o.id)), maxVisible: 2, onMore })}
        />,
      )

      await user.click(screen.getByRole('button', { name: '⋯ More' }))
      expect(onMore).toHaveBeenCalledTimes(1)
    })

    it('shows no More chip once maxVisible covers every option', () => {
      render(<CategoryFilter {...baseProps({ options, selected: new Set(options.map((o) => o.id)), maxVisible: 4 })} />)
      expect(screen.queryByRole('button', { name: '⋯ More' })).not.toBeInTheDocument()
    })

    // Regression test for the bug fixed in this file: `order` used to seed
    // as `null` and only get computed reactively (gated on a resortKey
    // check that's trivially false on the very first render — see the
    // component's own comment), so a category selected via a deep link
    // (e.g. the map's `?cat=` URL param) landed in its plain, default
    // count-sorted position instead of being promoted to the front —
    // invisible behind "More" with no way to tell it was even selected.
    it('promotes the selected option to a visible slot on the very first render, even if it would otherwise be truncated', () => {
      // "childcare" is last by count — selecting only it must still put it
      // inside the first `maxVisible` slots on mount, not behind More.
      render(
        <CategoryFilter {...baseProps({ options, selected: new Set(['childcare']), maxVisible: 2 })} />,
      )

      expect(screen.getByRole('button', { name: /Childcare/ })).toBeInTheDocument()
    })
  })

  describe('the desktop filter chevron', () => {
    const filterableField: CategoryField = {
      key: 'isKosher',
      label: 'Kosher',
      type: 'boolean',
      filterable: true,
    }

    it('appears for a category with a filterable field', () => {
      const cat = makeCategory({ id: 'grocery', detailFields: [filterableField] })
      render(
        <CategoryFilter
          {...baseProps({ options: [option({ id: 'grocery' })], categories: [cat] })}
        />,
      )
      expect(screen.getByRole('button', { name: 'Grocery filters' })).toBeInTheDocument()
    })

    it('is absent for a category with no filterable fields', () => {
      const cat = makeCategory({ id: 'grocery', detailFields: [] })
      render(
        <CategoryFilter
          {...baseProps({ options: [option({ id: 'grocery' })], categories: [cat] })}
        />,
      )
      expect(screen.queryByRole('button', { name: 'Grocery filters' })).not.toBeInTheDocument()
    })
  })

  describe('scrollArrow (desktop Google-Maps-style "show more" button)', () => {
    // jsdom never actually lays anything out — scrollWidth/clientWidth are
    // both always 0 — so the row's real overflow check needs the DOM's own
    // getters stubbed to say "this row doesn't fit," the same way a real
    // browser would once there are enough chips to scroll. Scoped to just
    // this describe block and restored after, so it can't leak into any
    // other test's layout measurements.
    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (HTMLElement.prototype as any).scrollWidth
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (HTMLElement.prototype as any).clientWidth
    })

    function stubOverflow(overflowing: boolean) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, value: overflowing ? 300 : 100 })
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 100 })
    }

    it('is absent when the row fits without scrolling', () => {
      stubOverflow(false)
      render(<CategoryFilter {...baseProps({ scrollArrow: true })} />)
      expect(screen.queryByRole('button', { name: 'Show more categories' })).not.toBeInTheDocument()
    })

    // Regression test for a real bug found in a real browser (jsdom can't
    // reproduce the actual feedback loop — see below): the button used to be
    // conditionally MOUNTED, not just hidden. Mounting/unmounting it changes
    // how much width its sibling row has to lay out in, which changes the
    // row's own scrollWidth/clientWidth, which is exactly what decides
    // whether the button mounts — so adding it could shrink the row into
    // overflowing and removing it could shrink it back out, forever. Every
    // ResizeObserver tick flipped the verdict, which visually read as the
    // last chip and the arrow shaking back and forth. The fix keeps the
    // button always mounted (reserving its layout space via `shrink-0`
    // regardless of state) and only toggles `invisible`/`aria-hidden` —
    // neither of which changes layout, so the row's own width, and the
    // verdict measured from it, can no longer depend on the button's own
    // visibility. This asserts the structural half of that fix (always
    // mounted); the actual thrashing loop needs a real browser's layout
    // engine to reproduce and isn't covered here.
    it('stays mounted (just hidden) rather than unmounting when the row fits — so it can never itself change the row width it measures', () => {
      stubOverflow(false)
      const { container } = render(<CategoryFilter {...baseProps({ scrollArrow: true })} />)
      const button = container.querySelector('[aria-label="Show more categories"]')
      expect(button).not.toBeNull()
      expect(button).toHaveAttribute('aria-hidden', 'true')
      expect(button).toHaveClass('invisible')
    })

    it('appears once the row actually overflows, and scrolls it when clicked', async () => {
      stubOverflow(true)
      const user = userEvent.setup()
      render(<CategoryFilter {...baseProps({ scrollArrow: true })} />)

      const button = screen.getByRole('button', { name: 'Show more categories' })
      const scrollBy = vi.fn()
      // jsdom has no real scroll implementation to observe — assert the
      // component asked the row to scroll, not that any pixel moved.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(button.previousSibling as any).scrollBy = scrollBy

      await user.click(button)
      expect(scrollBy).toHaveBeenCalledTimes(1)
    })

    it('is absent without scrollArrow, even when the row would overflow', () => {
      stubOverflow(true)
      render(<CategoryFilter {...baseProps()} />)
      expect(screen.queryByRole('button', { name: 'Show more categories' })).not.toBeInTheDocument()
    })
  })
})
