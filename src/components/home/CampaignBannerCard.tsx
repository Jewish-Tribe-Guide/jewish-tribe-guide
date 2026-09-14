'use client'

import Link from 'next/link'
import { useCampaignBanners } from '@/lib/contentContext'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { useDismissedCampaignBanners } from '@/lib/dismissedCampaignBanners'
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
// Styled as a one-time notice, not another home-screen card: a tinted wash,
// a colored left rail, and a dismiss control (✕) — reads as something to
// notice and either act on or close, the way a system banner does, rather
// than blending into the stack of ordinary cards below it. Dismissing is
// per-browser and per-banner (useDismissedCampaignBanners, keyed by
// banner.id) via localStorage, so closing THIS campaign doesn't hide a
// different future one. State starts "nothing dismissed" to match the
// server-rendered markup (same hydration-safe shape as useStoredLocation.ts/
// pinned.ts) and corrects itself in a post-mount effect — a visitor who
// dismissed this exact banner on a past visit may see it for an instant
// before it disappears again; that trade-off is the same one every other
// localStorage-backed UI in this app already makes.
//
// The accent color itself is deliberately NOT the same on both breakpoints.
// Desktop used to be amber — the theory was that it's already this app's
// "live campaign" color (the map's own chip, DaveningTimesCard's rail) —
// but that reasoning didn't hold up: amber is actually the desktop home
// screen's whole ambient "today / next up" tint (also the hero, Shabbat
// Times' Friday highlight), not something specific to a campaign. A
// stronger amber banner just matched five other things instead of
// standing apart from one. It's `--color-sage` now (globals.css) — warm
// enough for a Sukkot-season banner, but a genuinely different hue from
// everything else on the page, including this app's actual "always in
// stock" green (see that token's own comment on why it isn't reused here).
// Mobile has no existing amber precedent, so it uses the app's own primary
// blue instead — the color every other mobile button/link already is —
// rather than teaching a brand-new "special" color with no learned meaning.
//
// Both real destinations (the map, and the category's own listings) show as
// two buttons rather than the one the old single-CTA version forced a
// choice between. The admin's `destination` field still does something: it
// decides which button is solid (primary) vs outlined (secondary), not
// which one exists.
export default function CampaignBannerCard() {
  const banners = useCampaignBanners()
  const categories = useCategories()
  const communitySlug = useCommunitySlug()
  const now = useNow()
  const { isDismissed, dismiss } = useDismissedCampaignBanners()

  const banner = activeCampaignBanner(banners, now, community.timezone)
  if (!banner) return null

  const category = categories?.find((c) => c.id === banner.categoryId)
  // The linked category was removed/renamed out from under an otherwise-live
  // banner — render nothing rather than a card that links to a 404-shaped
  // empty filter.
  if (!category) return null

  if (isDismissed(banner.id)) return null

  const mapHref = `${routes.map(communitySlug)}${mapQueryString({ categories: [banner.categoryId] })}`
  const listHref = routes.slug(communitySlug, banner.categoryId)
  const mapIsPrimary = banner.destination !== 'list'

  const primary = mapIsPrimary
    ? { href: mapHref, label: 'Map View' }
    : { href: listHref, label: 'Browse Listings' }
  const secondary = mapIsPrimary
    ? { href: listHref, label: 'Browse Listings' }
    : { href: mapHref, label: 'Map View' }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 pr-9 shadow-sm desktop:border-sage-200 desktop:from-sage-50"
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-700 to-blue-900 desktop:from-sage-600 desktop:to-sage-900"
      />
      <button
        type="button"
        onClick={() => dismiss(banner.id)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-blue-900/10 hover:text-blue-900 desktop:hover:bg-sage-900/10 desktop:hover:text-sage-900"
      >
        ✕
      </button>

      {/* Same eyebrow treatment as the Browse card's `desktopBrowseEyebrow`
          ("Get started") — text-xs/uppercase/tracking-wide — colored to
          match this banner's own per-breakpoint accent rather than that
          card's amber, so it reads as this banner's label, not a borrowed
          one. Static, not admin-editable: every banner is "happening now"
          by definition (activeCampaignBanner already filters to live ones),
          so there's nothing per-campaign for an admin to set here. */}
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700 desktop:text-sage-700">
        Happening now
      </p>
      <h3 className="max-w-[28ch] text-lg font-extrabold text-slate-900 desktop:max-w-[32ch] desktop:text-[19px]">
        {banner.title}
      </h3>
      {banner.subtitle && (
        <p className="mb-4 mt-1 text-sm leading-relaxed text-stone-600 desktop:max-w-[44ch]">{banner.subtitle}</p>
      )}

      <div className="mt-4 flex gap-2.5">
        <Link
          href={primary.href}
          className="flex-1 cursor-pointer rounded-lg bg-gradient-to-br from-blue-700 to-blue-800 px-4 py-2.5 text-center text-sm font-bold text-white shadow-sm transition-colors hover:from-blue-800 hover:to-blue-900 desktop:flex-none desktop:from-sage-600 desktop:to-sage-700 desktop:hover:from-sage-700 desktop:hover:to-sage-800"
        >
          {primary.label}
        </Link>
        <Link
          href={secondary.href}
          className="flex-1 cursor-pointer rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-center text-sm font-bold text-blue-800 transition-colors hover:bg-blue-50 desktop:flex-none desktop:border-sage-200 desktop:text-sage-700 desktop:hover:bg-sage-50"
        >
          {secondary.label}
        </Link>
      </div>
    </div>
  )
}
