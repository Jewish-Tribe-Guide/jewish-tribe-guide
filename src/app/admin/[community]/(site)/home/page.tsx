'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import SiteSettingsEditor from '@/components/admin/SiteSettingsEditor'

// Site's Home page: the home page and the header over it, on a computer or a
// phone. (Header and menus was a tab of its own until Nov 4; its old address
// is a redirect in next.config.ts.)
export default function AdminHomePage() {
  const session = useAdminSession()
  return <SiteSettingsEditor token={session.access_token} />
}
