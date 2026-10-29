'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import CommunityManager from '@/components/admin/CommunityManager'

export default function AdminCommunitiesPage() {
  const session = useAdminSession()
  return (
    <div>
      <CommunityManager token={session.access_token} />
    </div>
  )
}
