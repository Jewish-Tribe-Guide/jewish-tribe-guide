'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import TeamManager from '@/components/admin/TeamManager'

export default function AdminTeamPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <TeamManager token={session.access_token} />
    </div>
  )
}
