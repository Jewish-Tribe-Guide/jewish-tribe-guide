'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import WhatChangedAdmin from '@/components/admin/WhatChangedAdmin'

export default function AdminWhatChangedPage() {
  const session = useAdminSession()
  // Always here (Nov 21): the public page is on whenever the admin links
  // it, and hiding an entry from it is done here.
  return (
    <div>
      <WhatChangedAdmin token={session.access_token} />
    </div>
  )
}
