import { DEFAULT_DESKTOP_NAV_ITEMS, DEFAULT_MOBILE_TABS, type DesktopNavItem, type SiteSettings } from './siteSettings'

// The top of the page, on a computer, as tabs (the user, Nov 4: "Let's call
// it one thing, a tab, and have the user actions dictate whether it's a link
// or dropdown"; drawing KdHT8Tci1ufXSXobnnSfEm). A tab holds links or
// headings, and what goes in first decides which: one link and it's a link,
// two and it's a dropdown; headings make a dropdown with links under each.
// Nothing goes deeper. The Categories tab is the one whose headings are the
// home sections (stored on their own), so it isn't one of these. Pure.

export type TabHolds = 'nothing' | 'links' | 'headings'

/** What a tab holds. A link saved before tabs is a tab holding one link. */
export function tabHolds(tab: DesktopNavItem): TabHolds {
  const items = tabItems(tab)
  if (items.length === 0) return 'nothing'
  return items[0]!.kind === 'heading' ? 'headings' : 'links'
}

/** A tab's links or headings. */
export function tabItems(tab: DesktopNavItem): DesktopNavItem[] {
  if (tab.kind === 'link') return [{ id: `${tab.id}-link`, label: tab.label, kind: 'link', target: tab.target }]
  return tab.items ?? []
}

/** The tab holding `items` in place of what it held. */
export function withTabItems(tab: DesktopNavItem, items: DesktopNavItem[]): DesktopNavItem {
  return { id: tab.id, label: tab.label, kind: 'more-menu', items }
}

/** A tab's row line. `opens` says where one link goes ("Opens the Map"). */
export function tabLine(tab: DesktopNavItem, opens: (target: string) => string): string {
  const items = tabItems(tab)
  const holds = tabHolds(tab)
  if (holds === 'nothing') return 'Nothing in it yet'
  if (holds === 'headings') return `Dropdown · ${headings(items.length)}`
  if (items.length === 1) return opens(items[0]!.target!)
  return `Dropdown · ${items.map((i) => i.label).join(', ')}`
}

export const headings = (n: number) => `${n} heading${n === 1 ? '' : 's'}`

/** A heading's row line: its links, or that it has none. */
export function headingLine(names: readonly string[]): string {
  return names.length ? names.join(' · ') : 'Nothing in it yet'
}

/** Whether the header or a phone tab links to the Map, the one thing that
 *  puts it on the site (Category pages has no Map row, board 1). */
export function linksToMap(settings: Pick<SiteSettings, 'desktopNavItems' | 'mobileTabs'>): boolean {
  const nav = settings.desktopNavItems.length > 0 ? settings.desktopNavItems : DEFAULT_DESKTOP_NAV_ITEMS
  const inTab = (tab: DesktopNavItem) => tabItems(tab).some((i) => i.target === 'map' || (i.items ?? []).some((l) => l.target === 'map'))
  return nav.some(inTab) || (settings.mobileTabs ?? DEFAULT_MOBILE_TABS).some((t) => t.target === 'map')
}
