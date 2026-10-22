'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { adminGroups, adminNavPosition } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { useIsSuperAdmin } from './AdminAuthGate'

/** The console's nav, driven by the URL — every group and tab is a genuine
 *  &lt;Link&gt;, so Back/Forward/refresh/sharing all just work. The top row
 *  is the five groups; the second row is the open group's tabs (which
 *  group is open comes from the path, see adminNavPosition). */
export default function AdminNav() {
  const pathname = usePathname()
  const community = useCommunitySlug()
  const isSuperAdmin = useIsSuperAdmin()
  const groups = adminGroups(community, isSuperAdmin)
  const position = adminNavPosition(pathname, community, isSuperAdmin)
  const open = groups.find((g) => g.group === position?.group)

  return (
    // touch-pan-x: a diagonal-ish swipe on these strips otherwise gets read
    // as an ambiguous gesture and can scroll the page vertically along with
    // it — same fix NearbyList's swipeable rows use (touch-pan-y there) for
    // the opposite direction. Locks touch panning here to horizontal only,
    // and both rows scroll sideways rather than wrap on a phone.
    //
    // No community switcher here (there used to be one, AdminCommunitySwitcher,
    // removed) — each community's admin console is meant to be reachable only
    // by its own admin, so jumping straight into another community's console
    // from a dropdown defeats that the moment their admin_emails diverge (see
    // AdminAuthGate's per-community authorization check). A URL for a
    // community you're not authorized for still 404s/bounces to sign-in the
    // same as any other unauthorized visit — this just stops offering it as a
    // click.
    <nav aria-label="Admin" className="mb-5">
      <div className="flex gap-1 overflow-x-auto touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-slate-200">
        {groups.map(({ group, href, label }) => {
          const active = group === position?.group
          return (
            <Link
              key={group}
              href={href}
              aria-current={active ? 'true' : undefined}
              className={`shrink-0 whitespace-nowrap text-sm font-semibold px-2.5 sm:px-3 py-2 -mb-px border-b-2 transition-colors ${
                active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-slate-700'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
      {open && (
        <div data-testid="admin-subnav" className="flex gap-1 overflow-x-auto touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pt-2">
          {open.tabs.map(({ tab, href, label }) => {
            const active = tab === position?.tab
            return (
              <Link
                key={tab}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                  active ? 'bg-primary/10 text-primary' : 'text-muted hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      )}
    </nav>
  )
}
