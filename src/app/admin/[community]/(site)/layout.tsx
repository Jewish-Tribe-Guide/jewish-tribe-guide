'use client'

import { usePathname } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import SiteSettingsEditor from '@/components/admin/SiteSettingsEditor'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'

// /admin/home and /admin/menus deliberately render the SAME mounted
// SiteSettingsEditor instance — one draft, one Save bar — so stepping between
// Site's Home page and Header and menus tabs doesn't silently drop a
// half-finished edit. A route file per tab would break that (Next
// mounts/unmounts per route by default); this route-group layout persists
// across exactly those two sibling routes and owns the one mount point
// itself, deriving which tab to show from the URL. home/page.tsx and
// menus/page.tsx are empty on purpose — this layout ignores `children`.
export default function SiteSettingsLayout() {
  const session = useAdminSession()
  const community = useCommunitySlug()
  const pathname = usePathname()
  const section = pathname.startsWith(`${adminBase(community)}/menus`) ? 'menus' : 'home'
  return <SiteSettingsEditor token={session.access_token} section={section} />
}
