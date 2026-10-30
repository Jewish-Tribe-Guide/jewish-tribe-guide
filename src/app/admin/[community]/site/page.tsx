'use client'

import { useIsSuperAdmin } from '@/components/admin/AdminAuthGate'
import SiteScreens from '@/components/admin/SiteScreens'

// Site on a phone (board 21): its screens as a list, each opening with a
// way back here. The phone's Site tab lands here; a computer's sidebar
// opens the Home page tab instead, with the screens as tabs.
export default function AdminSitePage() {
  return <SiteScreens isSuperAdmin={useIsSuperAdmin()} />
}
