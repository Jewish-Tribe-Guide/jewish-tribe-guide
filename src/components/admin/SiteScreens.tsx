'use client'

import { adminAreas, type AdminTab } from '@/lib/adminNav'
import { useCommunitySlug, useCommunityTimezone } from '@/lib/communityContext'
import { useCampaignBanners, useCategories, useForms } from '@/lib/contentContext'
import { activeCampaignBanner } from '@/lib/campaignBanner'
import { useNow } from '@/lib/useNow'
import { AdminBox, AdminRow } from './AdminUI'

/** Site's screens as rows, each with what it holds under its name, then
 *  View the site (board 21, its lines built Nov 22). */
export default function SiteScreens({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const community = useCommunitySlug()
  const site = adminAreas(community, isSuperAdmin).find((a) => a.area === 'site')!
  const categories = useCategories()
  const forms = useForms()
  const banners = useCampaignBanners()
  const timezone = useCommunityTimezone()
  // Null until the browser has the time, so the server's copy (built
  // days before) never says a campaign is running when it has ended.
  const now = useNow()
  const running = now === null ? undefined : activeCampaignBanner(banners, now, timezone)

  const lines: Partial<Record<AdminTab, string | undefined>> = {
    home: 'The big line, the photo, and what’s below it',
    categories: `${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`,
    forms: forms.length ? forms.map((f) => f.title).join(', ') : 'None yet',
    campaigns: running === undefined ? undefined : running ? `Running: ${running.title}` : 'None running',
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminBox>
        {site.tabs.map((t) => (
          <AdminRow key={t.tab} href={t.href} name={t.label} line={lines[t.tab]} />
        ))}
      </AdminBox>
      <AdminBox>
        <AdminRow href={`/${community}`} name="View the site" />
      </AdminBox>
    </div>
  )
}
