'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import TeamManager from '@/components/admin/TeamManager'

export default function AdminTeamPage() {
  const session = useAdminSession()
  return (
    <div>
      <TeamManager token={session.access_token} />
    </div>
  )
}
