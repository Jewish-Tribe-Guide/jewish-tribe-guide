'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import PlaceDetailBody from '@/components/resources/PlaceDetailBody'
import FreshnessFooter from '@/components/resources/FreshnessFooter'
import ListingActionsMenu from '@/components/resources/ListingActionsMenu'
import ListingForm from '@/components/resources/ListingForm'
import ReportSheet from '@/components/resources/ReportSheet'
import CategoryIcon from '@/components/CategoryIcon'
import PinnedBadge from '@/components/PinnedBadge'
import { ChevronLeftIcon } from '@/components/icons'
import { ui } from '@/lib/uiConfig'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { useCommunitySlug } from '@/lib/communityContext'
import { usePinned } from '@/lib/pinnedContext'

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
  const { isPinned } = usePinned()
  const pinned = isPinned(item.id)
  const iconImageUrl =
    (typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim()
      ? (item[PHOTO_FIELD_KEY] as string)
      : category.iconImageUrl) ?? undefined
  // Edit swaps this whole detail view for the same form the category
  // directory uses (ListingForm), same as GenericListingCard's own mobile
  // accordion — just scoped to this one component instead of the whole
  // screen, since the map has no separate "form view" of its own to
  // navigate to. Returns to this same place's detail (not the list) on
  // cancel or submit, since that's what was on screen before Edit was
  // tapped.
  //
  // Gets its own history entry, nested on top of the one MobileNearbySheet's
  // selectPlace already pushed for this place — so a swipe-back/browser-back
  // out of the form lands on this place's detail, not the list underneath
  // it or off the map entirely. Same pattern as that one; see its own
  // comment for why (and CategoryEditor's openPreview/closePreview, the
  // precedent both follow).
  //
  // Report used to work the identical way (a third `action` value, its own
  // history entry) — moved to its own sheet instead (see ReportSheet's own
  // doc on why: its form is short enough not to need a full replace at
  // all). No history entry for it any more, on purpose: dismissing a sheet
  // is a local UI change, not a navigation, so it doesn't belong in browser
  // history alongside the places this map sheet actually visited.
  const [editOpen, setEditOpen] = useState(false)
  const [reportSheetOpen, setReportSheetOpen] = useState(false)
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as { mapSheetForm?: 'edit' } | null
      setEditOpen(state?.mapSheetForm === 'edit')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const openEdit = () => {
    history.pushState({ ...(window.history.state ?? {}), mapSheetForm: 'edit' }, '')
    setEditOpen(true)
  }
  const closeEdit = () => history.back()
  const caps = resolveCapabilities(category.capabilities)
  const canEdit = ui.contributions.edit && caps.edit
  const canReport = ui.contributions.report && caps.report

  if (editOpen) {
    return (
      <>
        {/* Mobile only — ListingForm's own back affordance (a Breadcrumb)
            is desktop-only by design (see Breadcrumb's own doc), and its
            useSetScreenHeader "‹ Suggest an edit" call never actually
            becomes visible here: MapScreen deliberately collapses the
            shared header on this screen (useCollapseHeader), so it
            doesn't compete with the map's own floating search bar.
            Without this, editing from here on mobile opened straight into
            the form with no way back at all — confirmed live. Reuses
            "Back to list" below's exact style; "Back" alone rather than
            naming a destination, since — unlike that button, which really
            does go to a different screen (the nearby list) — this one
            just returns to the same place detail you were already on. */}
        <button
          onClick={closeEdit}
          className="desktop:hidden mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back
        </button>
        <ListingForm category={category} mode="edit" existing={item} onUp={closeEdit} onSubmitted={closeEdit} />
      </>
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
        {/* Same PinnedBadge GenericListingCard/NearbyList put on their own
            avatars — self-start moved to this wrapper so the badge can
            anchor to the same box without disturbing the icon's position. */}
        <span className="relative shrink-0 self-start">
          <CategoryIcon
            icon={category.icon}
            categoryId={category.id}
            iconImageUrl={iconImageUrl}
            color={color}
            className="h-12 w-12 text-2xl"
            sizePx={48}
          />
          {pinned && <PinnedBadge />}
        </span>
        {/* min-w-0 flex-1 — the kebab used to sit right after the name
            (back when this spot held a text-label Pin button, short and
            meant to read as part of the name line) instead of at the row's
            far edge. Now that it's an icon-only overflow menu, the far edge
            is the more standard spot for it (same trailing placement the
            directory card's own kebab already uses) — flex-1 here is what
            pushes it there regardless of how short the name is.
            No top padding either — self-start on the icon above already
            puts its top edge flush with this block's, i.e. with the name's
            first line. A pt would reintroduce exactly the few-pixel gap
            that made the icon and the name look unaligned in the first
            place. */}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight text-slate-900">
            <Link href={listingPath} className="hover:underline">
              {item.name}
            </Link>
          </h2>
          <p className="text-sm text-muted">{category.label}</p>
        </div>
        {/* self-center — was self-start (the flex row's own default,
            un-overridden) until this centered against just the name line
            instead of the whole name+category block. Reversed to match the
            category directory's own kebab (GenericListingCard), which
            centers against its full header block for the same reason:
            Material Design's own guidance is that a row's leading/trailing
            elements center against the row as a whole, not just its first
            line — a rule this component used to make a deliberate exception
            to, before that same rule got applied elsewhere in the app.
            Mocked up first (both options, side by side) before this landed.
            Pin/Share/"Set location" all live behind this one menu now — see
            ListingActionsMenu — so there's no separate Share button in the
            footer below any more, and PlaceDetailBody's own address row has
            no SetLocationButton either. */}
        {/* mr-1 — a small trailing gap so the kebab doesn't sit flush
            against this edge-to-edge mobile sheet's own true edge, matching
            Spotify's own overflow-menu spacing rather than butting right up
            against it. (Which way the dropdown itself opens is measured
            automatically — see ListingActionsMenu's own doc.) */}
        {/* onEdit/onReport/canEdit/canReport: same optional props
            GenericListingCard's own mobile kebab passes — see that
            component's doc on why Edit/Report moved into this menu instead
            of sitting alone in the footer below (removed from here now,
            same reasoning). Report opens ReportSheet locally; Edit still
            swaps this whole panel via the history-backed editOpen state
            above, unchanged. */}
        <ListingActionsMenu
          item={item}
          category={category}
          path={listingPath}
          className="mr-1 self-center"
          onEdit={openEdit}
          onReport={() => setReportSheetOpen(true)}
          canEdit={canEdit}
          canReport={canReport}
        />
      </div>

      {/* This has never had a persistent collapsed-row header the way
          GenericListingCard's mobile accordion does — a showInHeader url
          field (e.g. Networking's Website link) had nowhere to show at all
          here. See the prop's own comment. */}
      <PlaceDetailBody item={item} category={category} includeHeaderUrlFields />

      <div className="pt-2 border-t border-slate-200 space-y-2">
        <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} />
        {/* Edit/Report used to sit here too — both now live only in the
            kebab above, same place Pin/Share/Set location do. */}
      </div>

      <ReportSheet
        isOpen={reportSheetOpen}
        onClose={() => setReportSheetOpen(false)}
        listing={item}
        upLabel={category.pluralLabel}
      />
    </div>
  )
}
