'use client'

import Link from 'next/link'
import { useCampaignBanners } from '@/lib/contentContext'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { activeCampaignBanner } from '@/lib/campaignBanner'
import { routes, mapQueryString } from '@/lib/routes'
import { community } from '@/community.config'

// ── A seasonal promotion (see CampaignBannerManager's own doc) — renders
// nothing outside its admin-set date range, so there is no separate on/off
// flag anywhere else to keep in sync. Deliberately not part of the
// home_section/builtInOrder system Landing.tsx's other cards go through:
// this isn't admin-orderable among them, it's a plain "is one active right
// now" check, same shape as hasMap/zmanimCategory further down that file.
//
// Links straight to the map, pre-filtered to the linked category
// (mapQueryString's own `cat` param) — that filtered map IS the landing
// page; nothing else needed. Card, not a bare link, so it earns a spot this
// prominent (right under the hero, above every other card) without looking
// like an afterthought — same rounded-2xl bordered shell every other
// home-screen card uses (see DaveningTimesCard).
export default function CampaignBannerCard() {
  const banners = useCampaignBanners()
  const categories = useCategories()
  const communitySlug = useCommunitySlug()
  const now = useNow()

  const banner = activeCampaignBanner(banners, now, community.timezone)
  if (!banner) return null

  const category = categories?.find((c) => c.id === banner.categoryId)
  // The linked category was removed/renamed out from under an otherwise-live
  // banner — render nothing rather than a card that links to a 404-shaped
  // empty filter.
  if (!category) return null

  const href = `${routes.map(communitySlug)}${mapQueryString({ categories: [banner.categoryId] })}`

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Happening now</p>
      <h3 className="mb-1 text-lg font-semibold text-slate-900">{banner.title}</h3>
      {banner.subtitle && <p className="mb-4 text-sm leading-relaxed text-muted">{banner.subtitle}</p>}
      <Link
        href={href}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
      >
        View on the map →
      </Link>
    </div>
  )
}
