'use client'

import AdminAuthGate, { useAdminSession } from '@/components/admin/AdminAuthGate'
import PagesEditor from '@/components/admin/PagesEditor'
import SuperAdminNav from '@/components/admin/SuperAdminNav'

// The site's About/Privacy copy — one shared pair, not per-community (see
// pagesStore.ts's own doc) — so this is a sibling of the standalone
// superadmin console at /admin itself, not a tab under any one community's
// /{community}/admin. It used to live there (gated by the same global
// SUPERADMIN_EMAILS check underneath, via getAdminUser in
// /api/admin/pages), which meant every other admin of that community saw a
// "Pages" tab that only ever dead-ended in "Not authorized" — the same
// mistake the Communities tab's isSuperAdmin guard (adminNav.ts) exists to
// avoid for that tab. Moved here so there's exactly one Pages screen, not a
// per-community mirage of one.
export default function SuperAdminPagesPage() {
  return (
    <AdminAuthGate shellTitle="Pages" shellSubtitle="Edit the site's About and Privacy pages.">
      <SuperAdminPagesConsole />
    </AdminAuthGate>
  )
}

function SuperAdminPagesConsole() {
  const session = useAdminSession()
  return (
    <div>
      <SuperAdminNav />
      <PagesEditor token={session.access_token} />
    </div>
  )
}
