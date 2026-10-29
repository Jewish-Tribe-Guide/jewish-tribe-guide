'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import ReadQuestions from '@/components/admin/ReadQuestions'

export default function AdminReadQuestionsPage() {
  const session = useAdminSession()
  return (
    <div>
      <ReadQuestions token={session.access_token} />
    </div>
  )
}
