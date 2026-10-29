'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import TeamManager from '@/components/admin/TeamManager'

export default function AdminTeamPage() {
  const session = useAdminSession()
  return <TeamManager token={session.access_token} me={session.user.email ?? ''} />
}
