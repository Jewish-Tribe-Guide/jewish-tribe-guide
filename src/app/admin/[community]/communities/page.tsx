'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import CommunityManager from '@/components/admin/CommunityManager'

export default function AdminCommunitiesPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <CommunityManager token={session.access_token} />
    </div>
  )
}
