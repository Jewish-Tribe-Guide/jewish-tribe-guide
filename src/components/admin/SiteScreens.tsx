'use client'

import { adminAreas } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { AdminBox, AdminRow } from './AdminUI'

/** Site's screens as rows, then View the site (board 21). */
export default function SiteScreens({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const community = useCommunitySlug()
  const site = adminAreas(community, isSuperAdmin).find((a) => a.area === 'site')!
  return (
    <div className="flex flex-col gap-4">
      <AdminBox>
        {site.tabs.map((t) => (
          <AdminRow key={t.tab} href={t.href} name={t.label} />
        ))}
      </AdminBox>
      <AdminBox>
        <AdminRow href={`/${community}`} name="View the site" />
      </AdminBox>
    </div>
  )
}
