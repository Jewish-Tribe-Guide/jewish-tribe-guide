'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import CampaignBannerManager from '@/components/admin/CampaignBannerManager'

export default function AdminCampaignsPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <CampaignBannerManager token={session.access_token} />
    </div>
  )
}
