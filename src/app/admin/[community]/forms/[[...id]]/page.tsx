'use client'

import { useParams, useRouter } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import CategoryManager from '@/components/admin/CategoryManager'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'

// /{community}/admin/forms (list) and .../forms/form:<id> (editor): Site's
// Forms tab, the same manager as Category pages showing its forms (see
// ../categories/[[...id]]/page.tsx for why the open item is the URL
// segment, and why it's decoded here).
export default function AdminFormsPage() {
  const session = useAdminSession()
  const community = useCommunitySlug()
  const router = useRouter()
  const params = useParams<{ id?: string[] }>()
  const editingId = params.id?.[0] ? decodeURIComponent(params.id[0]) : null

  return (
    <CategoryManager
      token={session.access_token}
      show="forms"
      editingId={editingId}
      onOpenEditor={(id) => router.push(`${adminBase(community)}/forms/${id}`)}
      onCloseEditor={() => router.push(`${adminBase(community)}/forms`)}
    />
  )
}
