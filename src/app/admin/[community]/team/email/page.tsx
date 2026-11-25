'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import CommunityEmailPage from '@/components/admin/CommunityEmailPage'

// Settings › Team › Community email (board E3): the guide's own Gmail, and
// the newsletter script set up in it. Team's Community email box opens it.
export default function AdminCommunityEmailPage() {
  return <CommunityEmailPage token={useAdminSession().access_token} />
}
