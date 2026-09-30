'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import ReadQuestions from '@/components/admin/ReadQuestions'

export default function AdminReadQuestionsPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <ReadQuestions token={session.access_token} />
    </div>
  )
}
