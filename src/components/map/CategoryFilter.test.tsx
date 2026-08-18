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
})
