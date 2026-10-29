'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import PagesEditor from '@/components/admin/PagesEditor'

// About and Privacy, under Site (the admin redesign's step 4). One copy for
// every community (see pagesStore.ts), so only the site owner has the tab
// (adminNav.ts) and /api/admin/pages refuses anyone else.
export default function AdminPagesPage() {
  const session = useAdminSession()
  return <PagesEditor token={session.access_token} />
}
