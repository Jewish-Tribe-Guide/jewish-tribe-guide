'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { superAdminTabs } from '@/lib/adminNav'

/** The standalone superadmin console's own tab bar (/admin, /admin/pages —
 *  no community segment) — same active-link-via-usePathname shape as
 *  AdminNav, just for the two genuinely cross-community screens instead of
 *  one community's own tabs. Kept as its own component rather than a mode of
 *  AdminNav: AdminNav's hrefs all derive from a community slug
 *  (useCommunitySlug()), which doesn't exist here at all. */
export default function SuperAdminNav() {
  const pathname = usePathname()
  const tabs = superAdminTabs()

  return (
    <div className="flex items-center gap-3 mb-5 border-b border-slate-200">
      <div className="flex gap-1 overflow-x-auto touch-pan-x">
        {tabs.map(({ tab, href, label }) => {
          // '/admin' (Communities) only matches exactly — otherwise it'd stay
          // lit up while on '/admin/pages' too, since every href starts with it.
          const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
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
