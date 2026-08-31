'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { adminBase, adminTabs } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'

/** Real per-tab underline, driven by the URL instead of the pushState-shim
 *  local state AdminTabs used to keep — every tab is a genuine
 *  &lt;Link&gt;, so Back/Forward/refresh/sharing all just work. */
export default function AdminNav() {
  const pathname = usePathname()
  const community = useCommunitySlug()
  const base = adminBase(community)
  const tabs = adminTabs(community)

  return (
    // touch-pan-x: a diagonal-ish swipe on this strip otherwise gets read as
    // an ambiguous gesture and can scroll the page vertically along with it —
    // same fix NearbyList's swipeable rows use (touch-pan-y there) for the
    // opposite direction. Locks touch panning here to horizontal only.
    //
    // No community switcher here (there used to be one, AdminCommunitySwitcher,
    // removed) — each community's admin console is meant to be reachable only
    // by its own admin, so jumping straight into another community's console
    // from a dropdown defeats that the moment their admin_emails diverge (see
    // AdminAuthGate's per-community authorization check). A URL for a
    // community you're not authorized for still 404s/bounces to sign-in the
    // same as any other unauthorized visit — this just stops offering it as a
    // click.
    <div className="flex items-center gap-3 mb-5 border-b border-slate-200">
      <div className="flex gap-1 overflow-x-auto touch-pan-x">
        {tabs.map(({ tab, href, label }) => {
          // base (queue) only matches exactly — every other href starts with
          // it, so a plain startsWith would light up every tab at once.
          // '/philly/admin/categories' also covers the editor
          // (/philly/admin/categories/cat:<id>), which should still read as
          // "on the Categories tab" while you're inside it.
          const active = href === base ? pathname === base : pathname.startsWith(href)
          return (
            <Link
              key={tab}
              href={href}
              className={`shrink-0 whitespace-nowrap text-sm font-medium px-3 py-2 -mb-px border-b-2 transition-colors ${
                active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-slate-700'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
