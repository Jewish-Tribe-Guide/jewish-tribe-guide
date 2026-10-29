'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import CampaignBannerManager from '@/components/admin/CampaignBannerManager'

export default function AdminCampaignsPage() {
  const session = useAdminSession()
  return (
    <div>
      <CampaignBannerManager token={session.access_token} />
    </div>
  )
}
