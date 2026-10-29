'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import CommunityEditor from '@/components/admin/CommunityEditor'

export default function AdminCommunityPage() {
  const session = useAdminSession()
  return <CommunityEditor token={session.access_token} />
}
