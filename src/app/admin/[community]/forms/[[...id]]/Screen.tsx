'use client'

import { useParams, useRouter } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import FormsManager from '@/components/admin/FormsManager'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'

// /{community}/admin/forms (list), .../forms/feedback and .../forms/form:<id>:
// Site's Forms tab (see ../../categories/[[...id]]/page.tsx for why the open
// item is the URL segment, and why it's decoded here).
export default function AdminFormsPage() {
  const session = useAdminSession()
  const community = useCommunitySlug()
  const router = useRouter()
  const params = useParams<{ id?: string[] }>()
  const openId = params.id?.[0] ? decodeURIComponent(params.id[0]) : null

  return (
    <FormsManager
      token={session.access_token}
      openId={openId}
      onOpen={(id) => router.push(`${adminBase(community)}/forms/${id}`)}
      onClose={() => router.push(`${adminBase(community)}/forms`)}
    />
  )
}
