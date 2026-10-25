'use client'

import { useParams } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import WatchKindPage from '@/components/admin/WatchKindPage'

// One kind of place on the Watches tab, by its category's id
// (/philly/admin/watches/kind/restaurant). 'use client', so the category
// comes from useParams(), as on /admin/[community]/history/[status].
export default function AdminWatchKindPage() {
  const session = useAdminSession()
  const params = useParams<{ category: string }>()
  return (
    <div>
      <AdminNav />
      <WatchKindPage token={session.access_token} category={params.category} />
    </div>
  )
}
