'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_TABS } from '@/lib/adminNav'

/** Real per-tab underline, driven by the URL instead of the pushState-shim
 *  local state AdminTabs used to keep — every tab is a genuine
 *  &lt;Link&gt;, so Back/Forward/refresh/sharing all just work. */
export default function AdminNav() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 mb-5 border-b border-slate-200 overflow-x-auto">
      {ADMIN_TABS.map(({ tab, href, label }) => {
        // '/admin' (queue) only matches exactly — every other href starts
        // with it, so a plain startsWith would light up every tab at once.
        // '/admin/categories' also covers the editor
        // (/admin/categories/cat:<id>), which should still read as "on the
        // Categories tab" while you're inside it.
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
  )
}
