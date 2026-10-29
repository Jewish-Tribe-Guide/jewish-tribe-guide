'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import WhatChangedAdmin from '@/components/admin/WhatChangedAdmin'
import { notFound } from 'next/navigation'
import { features } from '@/lib/features'

export default function AdminWhatChangedPage() {
  const session = useAdminSession()
  // Held back from the site for now (see features.ts).
  if (!features.whatChanged) notFound()
  return (
    <div>
      <WhatChangedAdmin token={session.access_token} />
    </div>
  )
}
