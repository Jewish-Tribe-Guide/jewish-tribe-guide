'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCampaignBanners } from '@/lib/contentContext'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { useDismissedCampaignBanners } from '@/lib/dismissedCampaignBanners'
import { activeCampaignBanner } from '@/lib/campaignBanner'
import { routes, mapQueryString } from '@/lib/routes'
import { community } from '@/community.config'
import { LeafIcon } from '@/components/icons'

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
//
// Desktop mockup match (Phase 4, docs/desktop-mockup-plan.md): a completely
// separate horizontal layout (`hidden desktop:flex`), not the mobile card's
// vertical one reused with a few overrides — the two read too differently
// (a left-edge photo, buttons pinned to the right, no colour rail) to
// share markup cleanly. Mobile's own JSX is untouched apart from gaining
// `desktop:hidden`; both blocks are computed from the same
// `banner`/`primary`/`secondary` values above so the actual content/logic
// only lives in one place.
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
    <>
      {/* Mobile — unchanged, apart from `desktop:hidden` (the old desktop:
          color overrides are gone from here too, now that desktop has its
          own separate block below rather than this one wearing both). */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 pr-9 shadow-sm desktop:hidden">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-700 to-blue-900"
        />
        <button
          type="button"
          onClick={() => dismiss(banner.id)}
          aria-label="Dismiss"
          // active:bg-blue-900/20 — one step past the existing hover fill;
          // this and its desktop twin below both had a hover state with
          // nothing past it for a real press.
          className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-blue-900/10 hover:text-blue-900 active:bg-blue-900/20"
        >
          ✕
        </button>

        {/* Same eyebrow treatment as the Browse card's `desktopBrowseEyebrow`
            ("Get started") — text-xs/uppercase/tracking-wide. Static, not
            admin-editable: every banner is "happening now" by definition
            (activeCampaignBanner already filters to live ones), so there's
            nothing per-campaign for an admin to set here. */}
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
          Happening now
        </p>
        {/* h2, not h3: this is the first real section heading below the
            page's own h1 (it renders above "Explore by Category"'s own
            h2), so h3 here skipped a level — axe's heading-order rule,
            caught by e2e/accessibility.spec.ts. */}
        <h2 className="max-w-[28ch] text-lg font-extrabold text-slate-900">
          {banner.title}
        </h2>
        {banner.subtitle && (
          <p className="mb-4 mt-1 text-sm leading-relaxed text-stone-600">{banner.subtitle}</p>
        )}

        <div className="mt-4 flex gap-2.5">
          <Link
            href={primary.href}
            className="flex-1 cursor-pointer rounded-lg bg-gradient-to-br from-blue-700 to-blue-800 px-4 py-2.5 text-center text-sm font-bold text-white shadow-sm transition-colors hover:from-blue-800 hover:to-blue-900"
          >
            {primary.label}
          </Link>
          <Link
            href={secondary.href}
            className="flex-1 cursor-pointer rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-center text-sm font-bold text-blue-800 transition-colors hover:bg-blue-50"
          >
            {secondary.label}
          </Link>
        </div>
      </div>

      {/* Desktop — horizontal: a photo on the left fading into the banner,
          text in the middle, buttons pinned to the right. No left colour
          rail here (that's a mobile-only accent). */}
      <div className="relative hidden items-center overflow-hidden rounded-2xl border border-sage-200 bg-sage-50 desktop:flex min-h-[120px]">
        <div
          aria-hidden="true"
          // `absolute inset-y-0` rather than a flex `self-stretch` child —
          // pins this to the card's own top and bottom edges exactly, with
          // no dependency on the row's content height agreeing with it.
          className="absolute inset-y-0 left-0 w-[24%] overflow-hidden [mask-image:linear-gradient(to_right,black_60%,transparent)]"
        >
          {/* A real photo (an AI-generated sukkah, user-supplied — no
              licensing concern the way a stock-photo pull would carry),
              replacing the gradient+LeafIcon placeholder every other
              seasonal banner still falls back to. Served from /public
              (not hotlinked) since this came in as a local file, not a
              URL — public/images/sukkah-banner.webp (converted from the
              user's own PNG upload: 132 KB -> 12 KB at the same 408x136).

              `unoptimized`: a local /public asset still goes through
              Vercel's own Image Optimization pipeline unless told not to
              — confirmed live on a preview deploy, `402 Payment Required
              — OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` (that account's
              monthly quota, see imageHosts.ts's own doc on the same
              constraint for remote hosts). This file is already a small,
              fixed-size WebP with nothing for the optimizer to usefully
              resize, so skipping it entirely costs nothing. */}
          <Image
            src="/images/sukkah-banner.webp"
            alt=""
            fill
            sizes="(min-width: 640px) 24vw, 0px"
            className="object-cover"
            unoptimized
          />
        </div>

        <div className="flex-1 py-6 pl-[calc(24%+1.5rem)] pr-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sage-700">
            Happening now
          </p>
          {/* h2 — same heading-order reasoning as the mobile block above. */}
          <h2 className="max-w-[32ch] font-serif text-[24px] font-semibold text-ink">
            {banner.title}
          </h2>
          {banner.subtitle && (
            <p className="mt-1 max-w-[44ch] text-[15px] text-stone-600">{banner.subtitle}</p>
          )}
        </div>

        {/* Faint leaf decoration behind the buttons, at the banner's own
            right edge — purely decorative, aria-hidden, -z-10 to stay
            behind the buttons rather than competing with them for clicks
            (the wrapper's own overflow-hidden also keeps it from spilling
            past the rounded corner). */}
        <LeafIcon className="pointer-events-none absolute -right-4 bottom-0 -z-10 h-28 w-28 text-sage-900/10" />

        <div className="flex shrink-0 items-center gap-3 pr-16">
          <Link
            href={primary.href}
            className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg bg-sage-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-sage-700"
          >
            {primary.label}
          </Link>
          <Link
            href={secondary.href}
            className="cursor-pointer rounded-lg border border-sage-200 bg-white px-4 py-2.5 text-sm font-bold text-sage-700 transition-colors hover:bg-sage-50"
          >
            {secondary.label}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => dismiss(banner.id)}
          aria-label="Dismiss"
          // See the mobile dismiss button's own doc above — same
          // active:bg-*-900/20 addition, this block's own sage token.
          className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-sage-900/10 hover:text-sage-900 active:bg-sage-900/20"
        >
          ✕
        </button>
      </div>
    </>
  )
}
