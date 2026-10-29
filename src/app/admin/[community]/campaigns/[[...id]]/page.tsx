'use client'

import { useParams, useRouter } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import CampaignBannerManager from '@/components/admin/CampaignBannerManager'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'

// /{community}/admin/campaigns (the list) and .../campaigns/<id> or /new (one
// campaign), like ../../categories/[[...id]]/page.tsx.
export default function AdminCampaignsPage() {
  const session = useAdminSession()
  const community = useCommunitySlug()
  const router = useRouter()
  const params = useParams<{ id?: string[] }>()
  const openId = params.id?.[0] ? decodeURIComponent(params.id[0]) : null
  return (
    <CampaignBannerManager
      token={session.access_token}
      openId={openId}
      onOpen={(id) => router.push(`${adminBase(community)}/campaigns/${id}`)}
      onClose={() => router.push(`${adminBase(community)}/campaigns`)}
    />
  )
}
