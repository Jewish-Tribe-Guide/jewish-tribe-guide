'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import NewslettersPage from '@/components/admin/NewslettersPage'

// Watches → Newsletters: setting up the Gmail script, and the shul
// newsletters it reads (NewslettersPage.tsx). What's tracked's Newsletters
// row opens it.
export default function AdminNewslettersPage() {
  const session = useAdminSession()
  return (
    <div>
      <NewslettersPage token={session.access_token} />
    </div>
  )
}
