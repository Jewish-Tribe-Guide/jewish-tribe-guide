// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_MOBILE_TABS, type MobileTabConfig } from '@/lib/siteSettings'
import MobileTabBar from './MobileTabBar'

// The tabs the Today home is meant to go with: Today · Map · Browse, set in
// the admin's tab editor (the home tab keeps its 'categories' target).
const todayTabs: MobileTabConfig[] = [
  { id: 'categories', label: 'Today', target: 'categories' },
  { id: 'map', label: 'Map', target: 'map' },
  { id: 'browse', label: 'Browse', target: 'browse' },
]

afterEach(() => cleanup())

/** The tab's icon, as the outline of its first shape. */
const iconOf = (name: string) => screen.getByRole('button', { name }).querySelector('svg')?.firstElementChild?.outerHTML

// Nov 1 (BarNew15): the bar went unnoticed, light grey, thin and see-through;
// the admin's stood out. A class check, as jsdom has no colours to read.
describe('the bar’s look', () => {
  it('is solid white, its tabs dark enough to see, the current one bold', () => {
    render(<MobileTabBar mode="browse" tabs={todayTabs} onSelect={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav.className).toMatch(/(^| )bg-white( |$)/)
    expect(nav.className).not.toContain('backdrop-blur')
    const other = screen.getByRole('button', { name: 'Map' })
    expect(other.className).toContain('text-slate-600')
    expect(other.querySelector('span')?.className).toContain('text-xs font-semibold')
    expect(screen.getByRole('button', { name: 'Browse' }).querySelector('span')?.className).toContain('text-xs font-bold')
  })
})

describe('the phone tabs with Browse', () => {
  it('Browse is lit on the Browse page, and the home tab isn’t', () => {
    render(<MobileTabBar mode="browse" tabs={todayTabs} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Today' })).not.toHaveAttribute('aria-current')
  })

  it('tapping Browse asks for the Browse screen', () => {
    const onSelect = vi.fn()
    render(<MobileTabBar mode="home" tabs={todayTabs} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
    expect(onSelect).toHaveBeenCalledWith(todayTabs[2])
  })

  it('the grid is Browse’s; the home tab is a house', () => {
    render(<MobileTabBar mode="home" tabs={todayTabs} onSelect={vi.fn()} />)
    const grid = iconOf('Browse')
    expect(grid).toMatch(/^<rect/)
    expect(iconOf('Today')).not.toBe(grid)
  })

  it('without a Browse tab, the home tab keeps its grid', () => {
    render(<MobileTabBar mode="home" tabs={DEFAULT_MOBILE_TABS} onSelect={vi.fn()} />)
    expect(iconOf('Categories')).toMatch(/^<rect/)
  })
})

// You (Oct 14): the third tab, its icon the Save mark (a bookmark, as
// Google Maps does), lit on the You page.
describe('the You tab', () => {
  const tabs: MobileTabConfig[] = [
    { id: 'categories', label: 'Home', target: 'categories' },
    { id: 'map', label: 'Map', target: 'map' },
    { id: 'you', label: 'You', target: 'you' },
  ]

  it('is lit on You, and the home tab isn’t', () => {
    render(<MobileTabBar mode="you" tabs={tabs} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'You' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('wears the bookmark', () => {
    render(<MobileTabBar mode="home" tabs={tabs} onSelect={vi.fn()} />)
    expect(iconOf('You')).toContain('m19 21-7-4-7 4V5')
  })

  it('is on the bar by default, after Map', () => {
    expect(DEFAULT_MOBILE_TABS.map((t) => t.target).slice(0, 3)).toEqual(['categories', 'map', 'you'])
  })
})
