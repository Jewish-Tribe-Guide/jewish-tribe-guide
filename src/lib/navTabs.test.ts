import { describe, expect, it } from 'vitest'
import type { DesktopNavItem } from './siteSettings'
import { headingLine, tabHolds, tabItems, tabLine, withTabItems } from './navTabs'

// A tab holds links or headings; what goes in first decides (the user, Nov 4).

const opens = (t: string) => `Opens ${t}`
const link = (id: string, target = id): DesktopNavItem => ({ id, label: id, kind: 'link', target })
const tab = (items: DesktopNavItem[]): DesktopNavItem => ({ id: 't', label: 'Tab', kind: 'more-menu', items })
const heading = (id: string, items: DesktopNavItem[] = []): DesktopNavItem => ({ id, label: id, kind: 'heading', items })

describe('navTabs', () => {
  it('says what a tab holds by what went in first', () => {
    expect(tabHolds(tab([]))).toBe('nothing')
    expect(tabHolds(tab([link('a')]))).toBe('links')
    expect(tabHolds(tab([heading('h')]))).toBe('headings')
  })

  it('a link saved before tabs is a tab holding that one link', () => {
    const old = link('map')
    expect(tabHolds(old)).toBe('links')
    expect(tabItems(old)).toEqual([{ id: 'map-link', label: 'map', kind: 'link', target: 'map' }])
    expect(withTabItems(old, [link('map'), link('you')])).toEqual({ id: 'map', label: 'map', kind: 'more-menu', items: [link('map'), link('you')] })
  })

  it('a row line: nothing, where one link goes, a dropdown of links, or of headings', () => {
    expect(tabLine(tab([]), opens)).toBe('Nothing in it yet')
    expect(tabLine(tab([link('map')]), opens)).toBe('Opens map')
    expect(tabLine(tab([link('About', 'about'), link('Privacy', 'privacy')]), opens)).toBe('Dropdown · About, Privacy')
    expect(tabLine(tab([heading('h')]), opens)).toBe('Dropdown · 1 heading')
    expect(tabLine(tab([heading('h'), heading('i')]), opens)).toBe('Dropdown · 2 headings')
  })

  it('a heading line names its links, or says there are none', () => {
    expect(headingLine(['Food', 'Grocery'])).toBe('Food · Grocery')
    expect(headingLine([])).toBe('Nothing in it yet')
  })
})
