'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import PlaceDetailBody from '@/components/resources/PlaceDetailBody'
import FreshnessFooter from '@/components/resources/FreshnessFooter'
import ShareButton from '@/components/resources/ShareButton'
import PinButton from '@/components/resources/PinButton'
import ListingForm from '@/components/resources/ListingForm'
import ReportListing from '@/components/resources/ReportListing'
import CategoryIcon from '@/components/CategoryIcon'
import { ChevronLeftIcon, PencilIcon, FlagIcon } from '@/components/icons'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { ui } from '@/lib/uiConfig'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { useCommunitySlug } from '@/lib/communityContext'

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  color: string
  onBack: () => void
}

/**
 * Full place details shown inline in the mobile map's bottom sheet — the
 * Google-Maps-style alternative to navigating away to the category
 * directory. Renders the same `PlaceDetailBody` the category directory's
 * expanded listing card does (hours, tags, badges, davening times, freeform
 * fields, caveat notes), read-only (no filter callbacks — the map has no
 * such filters of its own), plus its own header, back button, and the same
 * FreshnessFooter/Share/Edit/Report bottom section GenericListingCard shows
 * once expanded — so a place reads (and can be corrected) the same whether
 * you found it here or in the category directory. Still doesn't show
 * upvote inline: that's a directory-list affordance (ranking search
 * results against each other), which doesn't mean anything for a single
 * place already selected on the map.
 */
export default function MapPlaceDetail({ item, category, color, onBack }: Props) {
  const community = useCommunitySlug()
  const listingPath = routes.listing(community, category.id, listingSlug(item))
  const iconImageUrl =
    (typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim()
      ? (item[PHOTO_FIELD_KEY] as string)
      : category.iconImageUrl) ?? undefined
  // Edit/Report swap this whole detail view for the same forms the category
  // directory uses (ListingForm/ReportListing), same as GenericListingCard —
  // just scoped to this one component instead of the whole screen, since the
  // map has no separate "form view" of its own to navigate to. Returns to
  // this same place's detail (not the list) on cancel or submit, since
  // that's what was on screen before Edit/Report was tapped.
  const [action, setAction] = useState<'edit' | 'report' | null>(null)
  const caps = resolveCapabilities(category.capabilities)
  const canEdit = ui.contributions.edit && caps.edit
  const canReport = ui.contributions.report && caps.report

  if (action === 'edit') {
    return <ListingForm category={category} mode="edit" existing={item} onUp={() => setAction(null)} onSubmitted={() => setAction(null)} />
  }
  if (action === 'report') {
    return (
      <ReportListing listing={item} upLabel={category.pluralLabel} onUp={() => setAction(null)} onSubmitted={() => setAction(null)} />
    )
  }

  return (
    <div className="space-y-4 pb-2">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to list
      </button>

      {/* ── Header: icon, name, category, pin ────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0 self-start">
          <CategoryIcon
            icon={category.icon}
            categoryId={category.id}
            iconImageUrl={iconImageUrl}
            color={color}
            className="h-12 w-12 text-2xl"
            sizePx={48}
          />
          {/* Map pins/list badges always show the category's own glyph, never
              a listing's own photo (too small/dense on the map to read as
              anything but noise there — see NearbyList's own note). Once you
              tap through to here, the photo takes over as the main avatar, so
              without this corner badge nothing visually ties this specific
              store back to the colored glyph you tapped on the map. Same
              badge treatment (white ring, small circle, top-right) as the
              "pinned" badge NearbyList overlays on its own icon. */}
          {iconImageUrl && (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-white text-[11px] leading-none"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            >
              <CategoryGlyph categoryId={category.id} icon={category.icon} className="h-3 w-3" />
            </span>
          )}
        </div>
        {/* min-w-0 but deliberately NOT flex-1 — same reasoning as the
            address row further down (see PlaceDetailBody): sizing to its
            own text lets Pin sit right after the name, closer to where
            "I'm here" sits relative to the address below it, rather than
            pinned to the row's far right edge regardless of how short the
            name is.
            No top padding either — self-start on the icon above already
            puts its top edge flush with this block's, i.e. with the name's
            first line. A pt would reintroduce exactly the few-pixel gap
            that made the icon and the name look unaligned in the first
            place. */}
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-slate-900">
            <Link href={listingPath} className="hover:underline">
              {item.name}
            </Link>
          </h2>
          <p className="text-sm text-muted">{category.label}</p>
        </div>
        {/* self-start + a measured nudge — centered on just the NAME line,
            not the shorter category label under it. self-center would
            center against the whole name+category block instead, pulling
            Pin down further than the name alone calls for.
            The nudge itself needs to be -2.75px, not the +3.25px the name/
            icon math alone suggests: PinButton's own -m-1.5/p-1.5 (its tap-
            target trick — see that component) cancel out to a net-zero
            visual offset, and a plain mt-* utility here overrides the
            shorthand's margin-top outright rather than adding to it, which
            breaks that cancellation. -2.75 is the value that, combined with
            the trick's fixed 6px padding-top, nets out to the actual
            +3.25px of visual movement wanted: (22.5-14)/2, name line-height
            vs. icon height. */}
        {ui.map.pins && <PinButton id={item.id} categoryId={category.id} name={item.name} className="self-start mt-[-2.75px]" />}
      </div>

      <PlaceDetailBody item={item} category={category} />

      <div className="pt-2 border-t border-slate-200 space-y-2">
        <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} />
        <div className="flex gap-3">
          <ShareButton path={listingPath} title={item.name} />
          {canEdit && (
            <button
              onClick={() => setAction('edit')}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors cursor-pointer"
            >
              <PencilIcon className="h-3.5 w-3.5" /> Edit
            </button>
          )}
          {canReport && (
            <button
              onClick={() => setAction('report')}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer"
            >
              <FlagIcon className="h-3.5 w-3.5" /> Report
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
