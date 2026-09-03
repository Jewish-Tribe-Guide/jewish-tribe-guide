'use client'

import AdminAuthGate, { useAdminSession } from '@/components/admin/AdminAuthGate'
import CommunityManager from '@/components/admin/CommunityManager'
import SuperAdminNav from '@/components/admin/SuperAdminNav'

// The standalone superadmin console, at /admin itself — genuinely
// cross-community, unlike everything under /{community}/admin (see
// admin/[community]/layout.tsx). Gated by AdminAuthGate with no `community`
// prop, which checks the SUPERADMIN list (the global SUPERADMIN_EMAILS) instead
// of any one community's admin_email — see AdminAuthGate's own doc and
// /api/admin/whoami's community-omitted branch.
//
// SuperAdminNav (not AdminNav, the per-community tab bar) — this and
// /admin/pages are the only two genuinely-cross-community screens. A third
// one gets added to superAdminTabs() and gets its own sibling route here,
// same pattern.
export default function SuperAdminPage() {
  return (
    <AdminAuthGate shellTitle="Every community" shellSubtitle="Manage every community this site hosts, or add a new one.">
      <SuperAdminConsole />
    </AdminAuthGate>
  )
}

function SuperAdminConsole() {
  const session = useAdminSession()
  return (
    <div>
      <SuperAdminNav />
      <CommunityManager token={session.access_token} />
    </div>
  )
}
