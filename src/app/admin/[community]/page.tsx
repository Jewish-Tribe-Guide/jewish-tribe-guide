'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import ModerationQueue from '@/components/admin/ModerationQueue'

// The default admin screen — moderation queue, mounted at /admin itself
// (every other tab gets its own sibling route: /admin/categories,
// /admin/responses, /admin/archived, /admin/site, /admin/home). Auth is
// already resolved by AdminAuthGate (see admin/layout.tsx) by the time this
// renders, so this is just the queue plus the shared tab bar.
export default function AdminPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <ModerationQueue session={session} />
    </div>
  )
}
