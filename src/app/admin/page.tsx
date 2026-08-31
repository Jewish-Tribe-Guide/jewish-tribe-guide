'use client'

import AdminAuthGate, { useAdminSession } from '@/components/admin/AdminAuthGate'
import CommunityManager from '@/components/admin/CommunityManager'

// The standalone superadmin console, at /admin itself — genuinely
// cross-community, unlike everything under /{community}/admin (see
// admin/[community]/layout.tsx). Gated by AdminAuthGate with no `community`
// prop, which checks the SUPERADMIN list (the global ADMIN_EMAILS) instead
// of any one community's admin_email — see AdminAuthGate's own doc and
// /api/admin/whoami's community-omitted branch.
//
// Deliberately no AdminNav here — that's the per-community tab bar
// (Moderation queue, Categories, …), which has nothing to point at from a
// page with no community in its URL. If a second genuinely-cross-community
// screen shows up, it gets its own sibling route under this same gate.
export default function SuperAdminPage() {
  return (
    <AdminAuthGate shellTitle="Every community" shellSubtitle="Manage every community this site hosts, or add a new one.">
      <SuperAdminConsole />
    </AdminAuthGate>
  )
}

function SuperAdminConsole() {
  const session = useAdminSession()
  return <CommunityManager token={session.access_token} />
}
