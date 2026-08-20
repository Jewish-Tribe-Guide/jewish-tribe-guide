'use client'

import { usePathname } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import SiteSettingsEditor from '@/components/admin/SiteSettingsEditor'
import { ADMIN_BASE } from '@/lib/adminNav'

// /admin/site and /admin/home deliberately render the SAME mounted
// SiteSettingsEditor instance — one draft, one Save button — so switching
// between them doesn't silently drop a half-finished edit. A route file per
// tab would break that (Next mounts/unmounts per route by default); this
// route-group layout is the fix: it persists across exactly those two
// sibling routes (the same way admin/layout.tsx persists across every
// /admin/* route) and owns the one SiteSettingsEditor mount point itself,
// deriving which section to show from the URL rather than from a prop a
// per-route page file would have to pass down. site/page.tsx and
// home/page.tsx are empty on purpose — this layout renders the real content
// for both, ignoring `children`.
export default function SiteSettingsLayout() {
  const session = useAdminSession()
  const pathname = usePathname()
  const section = pathname.startsWith(`${ADMIN_BASE}/home`) ? 'home' : 'site'

  return (
    <div>
      <AdminNav />
      <SiteSettingsEditor token={session.access_token} section={section} />
    </div>
  )
}
