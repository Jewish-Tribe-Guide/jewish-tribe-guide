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
