'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import CategoryIcon from '@/components/CategoryIcon'
import PlaceDetailBody from './PlaceDetailBody'
import FreshnessFooter from './FreshnessFooter'
import ListingEditBar from './ListingEditBar'
import ListingForm from './ListingForm'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

type Props = {
  isOpen: boolean
  onClose: () => void
  item: DirectoryResource
  category: CategoryConfig
  color: string
  iconImageUrl?: string
  name: string
  subtitle: string | null
  /** The card's own Open/closure/filterable-badge row, already built by
   *  GenericListingCard — restated here since the card behind this dialog
   *  sits under its dim backdrop. See that component's `badgeRow` comment
   *  for why this is passed rather than recomputed. */
  badgeRow: ReactNode
  headerBadgeKeys: string[]
  /** A showInHeader url field (e.g. "Join group") — same pill, same spot
   *  next to the name, as GenericListingCard's own collapsed row. See the
   *  render site's own comment for why this moved here instead of staying
   *  in the actions row below. */
  headerUrlFields: { f: CategoryField; href: string }[]
  onTagClick: (tag: string) => void
  onFilterOpen: () => void
  onFilterBool: (key: string) => void
  onFilterSelect: (key: string, value: string) => void
  canEdit: boolean
  /** Left/Right arrow while this dialog is focused moves to the previous/
   *  next card in whatever order is currently on screen — the lightbox
   *  pattern (Google Photos, Gmail's message view). Omitted where there's
   *  no well-defined "next" (none today — GenericListingCard always passes
   *  one — but kept optional so a future caller isn't forced to). Up/Down
   *  are deliberately left alone: the desktop grid has neighbors in those
   *  directions too, but "next" reading a multi-column grid top-to-bottom,
   *  left-to-right is the one order a visitor actually recognizes as
   *  "what I was just scrolling past," and that's what the arrows follow. */
  onNavigate?: (direction: 1 | -1) => void
  /** Whether there's actually a previous/next card to move to — draws the
   *  arrow buttons below dimmed and inert at either end, rather than a
   *  clickable-looking arrow that visibly does nothing when tapped. Only
   *  meaningful together with onNavigate; ignored otherwise. */
  hasPrev?: boolean
  hasNext?: boolean
}

/** Desktop's counterpart to the card's inline expand. A multi-column grid has
 *  nowhere sensible to push an expanding card's panel — it would have to
 *  either span every column in its row or overlap its neighbors — so desktop
 *  opens the same PlaceDetailBody content in a centered dialog instead. See
 *  GenericListingCard's `isMobile` branch for the split.
 *
 *  Follows DaveningTimesModal's own conventions: backdrop click and Escape
 *  both close it, body scroll locks while open.
 *
 *  Edit swaps THIS dialog's own content to the form (ListingForm; a removal
 *  request is the last part of that form, see RemovalRequest), the same
 *  in-place pattern MapPlaceDetail already uses —
 *  not a hand-off to a separate ActionDialog. That used to close this
 *  dialog and open a differently-sized one in its place (448px → 576px,
 *  no shared backdrop), which read as a completely different popup
 *  appearing rather than a continuation of the one already open —
 *  confirmed live before this landed. ActionDialog still exists for the
 *  cases that have no open dialog to morph FROM (a deep link, a search
 *  result's own Edit button) — this only replaces the one path
 *  that already had somewhere to morph in place. */
export default function ListingDetailModal({
  isOpen,
  onClose,
  item,
  category,
  color,
  iconImageUrl,
  name,
  subtitle,
  badgeRow,
  headerBadgeKeys,
  headerUrlFields,
  onTagClick,
  onFilterOpen,
  onFilterBool,
  onFilterSelect,
  canEdit,
  onNavigate,
  hasPrev,
  hasNext,
}: Props) {
  // Own history entry, nested on top of whatever real navigation got this
  // dialog open in the first place — so browser back closes the form and
  // returns to the detail view, not out of the dialog (or off the page)
  // entirely. Same pattern MapPlaceDetail's own formOpen uses; see that
  // component's doc for why. Doesn't touch the `?item=` query param this
  // dialog's own open/close already syncs (see GenericDirectory's
  // onExpandedChange) — that stays exactly as it was the whole time this
  // is open, same as it does while just viewing details.
  const [formOpen, setFormOpen] = useState<'edit' | null>(null)
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as { detailModalForm?: 'edit' } | null
      setFormOpen(state?.detailModalForm === 'edit' ? 'edit' : null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const openForm = (mode: 'edit') => {
    history.pushState({ ...(window.history.state ?? {}), detailModalForm: mode }, '')
    setFormOpen(mode)
  }
  const closeForm = () => history.back()

  // Whether ListingForm has swapped its own fields out for the Request
  // removal panel — reported up via its onRemovalOpenChange so this
  // component's own header can become "Request removal of {name}" instead
  // of a static "Suggest an edit", rather than showing a second, smaller
  // title inside the form for the same thing.
  const [removalOpen, setRemovalOpen] = useState(false)

  // Resets the next time this dialog opens (a fresh listing, or the same
  // one reopened later) — adjusted during render, the React-docs-
  // recommended way to reset state on a prop change, rather than in an
  // effect: an effect would commit one frame showing the PREVIOUS open's
  // form before its own setState took hold. Component instance stays
  // mounted the whole time (this always renders, just returns null below
  // while closed), so `formOpen`/`removalOpen` would otherwise carry over
  // from a previous open on their own.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setFormOpen(null)
      setRemovalOpen(false)
    }
  }

  // Reference-counted, not a plain `document.body.style.overflow = isOpen ?
  // 'hidden' : ''` — GenericDirectory can mount dozens of these (one per
  // card), and arrow-key next/prev closes one and opens another in the same
  // commit. Two instances both writing that one global property in the same
  // tick raced, and whichever happened to run last could leave the page
  // scrollable while a dialog was still open — see the hook's own comment.
  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Steps back one level at a time, same as a real nested screen
        // would: out of the form to the detail view first, and only a
        // SECOND Escape (formOpen now null) closes the dialog entirely.
        if (formOpen) closeForm()
        else onClose()
        return
      }
      // Sibling-listing navigation doesn't mean anything mid-edit — arrow
      // keys inside a form's own address/hours fields aren't a "browse
      // elsewhere" gesture, they're just editing.
      if (formOpen) return
      // Guards against a text input inside the dialog someday capturing the
      // arrow keys for cursor movement instead of navigation — nothing here
      // currently has one, but a global keydown listener shouldn't assume
      // that stays true.
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (e.key === 'ArrowLeft') onNavigate?.(-1)
      else if (e.key === 'ArrowRight') onNavigate?.(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose, onNavigate, formOpen])

  if (!isOpen) return null

  // Visible only when there's actually somewhere for them to go — see
  // onNavigate's own comment on why a dimmed, inert arrow beats hiding it
  // outright (a missing button at one end while browsing reads as a glitch;
  // a visibly-disabled one reads as "you've reached the end"). Hidden while
  // formOpen for the same reason the keydown handler above stops routing
  // arrow keys to it then: browsing to a sibling listing mid-edit doesn't
  // mean anything, and the form's own fields want those keys for editing.
  const showNav = !!onNavigate && !formOpen

  // The bar is the way IN to the form, so it has nothing to say once the
  // form is open — the dialog's own header carries Back/"Suggest an edit"
  // from there.
  const showEditBar = canEdit && !formOpen

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center gap-3 p-4 bg-slate-900/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      {/* Anchored right next to the card as flex siblings, not fixed to the
          viewport's own edges — this dialog tops out at max-w-md (448px)
          and sits centered in the full window, so pinning the arrows to
          left-4/right-4 (Google Photos' pattern, for a photo that usually
          fills most of the screen) left them stranded near the screen
          edges, often hundreds of pixels from the card itself on a wide
          monitor. */}
      {showNav && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate!(-1) }}
          disabled={!hasPrev}
          aria-label="Previous listing"
          // active:bg-slate-100 — one step past hover's slate-50, same
          // escalation ListingActionsMenu's kebab uses for its own state
          // layer, so this circular icon button darkens visibly for the
          // instant it's actually pressed rather than only on hover.
          // transition-[opacity,background-color], not the original plain
          // transition-opacity: the disabled fade still needs its own
          // transition, but background-color now needs one too, or the
          // hover→active darkening above would snap instead of easing.
          className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg ring-1 ring-slate-900/10 transition-[opacity,background-color] hover:bg-slate-50 active:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer disabled:cursor-default"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
      )}
      {/* The dialog and the edit bar as one positioned unit. The bar is
          hung off this wrapper with `absolute top-full` rather than being a
          third flex child of the overlay, and that is load-bearing: the
          overlay is `items-center`, so any element stacked below the dialog
          re-centres the whole column and drags the ‹ › arrows down with it —
          they'd sit on the midline of "dialog + bar" instead of the dialog's
          own, roughly half a bar-height too low. Out of flow, the dialog
          stays exactly where it was and the arrows never move.
          The width classes (and their transition) live here rather than on
          the dialog so the bar grows with it when the form opens. */}
      <div
        className={`relative flex w-full transition-[max-width] duration-200 ease-in-out ${formOpen ? 'max-w-xl' : 'max-w-md'}`}
        // The dialog ROLE lives on this wrapper, not on the white card
        // inside it, so that the edit bar hanging below is inside the
        // dialog's own boundary. aria-modal="true" tells assistive tech to
        // ignore everything outside the element carrying it — a bar left on
        // the far side of that line would be invisible to a screen reader
        // while being the most prominent control on screen for everyone
        // else. The card keeps its own visual styling and nothing else.
        role="dialog"
        aria-modal="true"
        aria-label={formOpen ? (removalOpen ? `Request removal of ${name}` : 'Suggest an edit') : name}
      >
      <div
        // max-w-md (448px) — this went 512 (cramped, page had room to
        // spare) → 672 (fixed that, but read too wide/short the other way)
        // → 576 → here. The narrower widths above all sized the dialog for
        // its widest-content listing; a sparse one (an address, a phone, no
        // description) then rendered short *and* wide at that same fixed
        // width — proportioned like a business card lying on its side, not
        // like a focused dialog. 448px is narrow enough that even a sparse
        // listing reads as a normal vertical card shape, and was checked
        // against the busiest real case (4 action buttons + a cert badge)
        // to confirm nothing wraps awkwardly at this width.
        //
        // Widens to max-w-xl (576px, matching ActionDialog's own width)
        // while formOpen — a real form (address/hours/photo fields) needs
        // more room than the detail view — animated via transition-[max-width]
        // so it reads as this SAME dialog growing, not a different one
        // replacing it. That's the entire point of keeping this one element
        // mounted instead of swapping to ActionDialog: a resize is still
        // continuous, a close-then-reopen never is.
        // max-h shrinks by the bar's own height (44px pill + 12px gap +
        // breathing room) whenever the bar is showing, so a long listing
        // can't grow to the full 85vh and push the bar off the bottom of
        // the window. Nothing hangs below while formOpen, so the form gets
        // the full height back.
        className={`dialog-in flex w-full flex-col ${showEditBar ? 'max-h-[calc(85vh-4.5rem)]' : 'max-h-[85vh]'} bg-white border border-slate-200 rounded-xl shadow-xl`}
      >
        {/* Badges live inside this same block, under the subtitle — not as
            their own section below a divider. They're facts about this
            place (Open, Restaurant, kosher cert), the same category of
            information as the name and address right above them; putting a
            hard rule between "who this is" and "what it is" read as if the
            badges belonged with the action icons below instead. The divider
            now marks the real boundary: identity above it, actions below. */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-slate-200 shrink-0">
          {formOpen ? (
            // Replaces the name/icon block while editing — same "Back"
            // wording and chevron MapPlaceDetail's own formOpen uses (see
            // that component's doc): this returns to the detail view you
            // were just on, not up to some other screen, so it doesn't
            // name a destination the way "Back to list" elsewhere does.
            // The title below stands in for ListingForm's own heading
            // (suppressed by `embedded`) — every other edit surface
            // (ActionDialog, MobileSheet) shows this same
            // title in its own header; this and MapPlaceDetail's identical
            // morph-in-place were the two gaps, confirmed live to read as
            // unfinished next to the other four once compared side by side.
            // Becomes "Request removal of {name}" once ListingForm reports
            // (via onRemovalOpenChange) that it's swapped to that panel —
            // one title that changes, not a second smaller one nested
            // inside the form repeating the same fact.
            <div className="min-w-0">
              <button
                onClick={closeForm}
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Back
              </button>
              <h2 className="mt-1 font-semibold text-slate-900 text-lg">
                {removalOpen ? `Request removal of ${name}` : 'Suggest an edit'}
              </h2>
            </div>
          ) : (
            <div className="flex items-start gap-3 min-w-0">
              <CategoryIcon
                icon={category.icon}
                categoryId={category.id}
                iconImageUrl={iconImageUrl}
                color={color}
                className="h-10 w-10 text-xl shrink-0"
              />
              <div className="min-w-0">
                {/* Two columns, not one wrapping flex row — matching the
                    collapsed card behind this dialog exactly (see that
                    component's own headerUrlFields comment): the name gets its
                    own flexible column and wraps onto a second line there if
                    it needs to, while the pill stays put in a fixed column at
                    the right, instead of the two crowding onto the same line
                    and the pill getting pushed wherever there happened to be
                    room. Was rendered as one of the actions-row icon buttons
                    below instead (Directions/Call style) via
                    includeHeaderUrlFields; moved back to sit with the name
                    specifically because that row was the one place this
                    dialog didn't otherwise match the card it opened from, and
                    PlaceDetailBody's own default (excluding a showInHeader
                    field from that row) already assumes there's a header spot
                    like this one showing it instead. */}
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 font-semibold text-slate-900 text-lg">{name}</h2>
                  {headerUrlFields.length > 0 && (
                    <div className="flex shrink-0 items-center gap-2">
                      {headerUrlFields.map(({ f, href }) => (
                        <a
                          key={f.key}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex shrink-0 items-center rounded-full border border-primary px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-white transition-colors whitespace-nowrap"
                        >
                          {f.linkLabel ?? f.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                {subtitle && <p className="text-sm text-muted truncate">{subtitle}</p>}
                {badgeRow && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {badgeRow}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Pin/Share/Set as location used to live in a kebab here too, same
              spot MapPlaceDetail gives it next to the name — removed: those
              are all pre-opening actions, already one click away on the
              card behind this dialog (dimmed but a click away once you
              close this), so having them here too was pure duplication.
              Edit then moved up here in their place, still as a kebab —
              and that was the mistake this corner is now free of. A kebab
              is where people look for Share and Save, never for "I can
              change this," so the one action we most want found was the
              one hidden behind a control that says "overflow." It lives
              below the dialog now, as its own object (ListingEditBar), and
              this corner is back to holding nothing but Close. */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Closes the WHOLE dialog regardless of formOpen — a second,
                faster way out beyond stepping back with Escape/the Back
                button above, not a second meaning for this one control. */}
            <button
              onClick={onClose}
              // hover:bg-slate-100/active:bg-slate-200 — same state-layer
              // treatment as ListingActionsMenu's kebab: this had a text-color
              // hover but nothing behind it, so a tap gave no visual
              // acknowledgment at all before the whole dialog closed.
              // rounded-full (was plain `rounded`) to match that same
              // circular treatment now that there's a fill to round.
              className="shrink-0 text-muted hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 transition-colors cursor-pointer p-1 rounded-full"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {formOpen === 'edit' ? (
            <ListingForm category={category} mode="edit" existing={item} onUp={closeForm} onSubmitted={closeForm} onRemovalOpenChange={setRemovalOpen} embedded />
          ) : (
            <>
              <PlaceDetailBody
                item={item}
                category={category}
                onTagClick={onTagClick}
                onFilterOpen={onFilterOpen}
                onFilterBool={onFilterBool}
                onFilterSelect={onFilterSelect}
                hideOpenStatus
                hiddenBadgeKeys={headerBadgeKeys}
                hideCountBadge
                // Not includeHeaderUrlFields here — that field now has a home in
                // this dialog's own header, next to the name (see above), the
                // same reason PlaceDetailBody's default excludes it from this
                // row for GenericListingCard's mobile accordion too.
              />

              <div className="pt-3 border-t border-slate-200 space-y-2.5">
                <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} />
                {/* No onSuggestCorrection here any more: that 12px grey link was
                    the only visible way in to Edit while Edit itself sat in a
                    kebab, and it carried that job badly — same weight as the
                    timestamp beside it. ListingEditBar below the dialog is the
                    visible way in now, so repeating it here would be the same
                    duplication the header's kebab was removed for. The freshness
                    STATUS stays: "Confirmed 3 days ago · Still right?" is a
                    different, one-tap contribution, not a second door to the form.
                    MapPlaceDetail still passes the prop — the map has no bar of
                    its own yet (see this component's counterpart there). */}
              </div>
            </>
          )}
        </div>
      </div>
      {showEditBar && (
        // pointer-events-none on the strip, auto on the button: the strip
        // spans the dialog's full width, and a click on the empty part of it
        // should still reach the backdrop and close the dialog the way a
        // click anywhere else outside the card does.
        <div className="pointer-events-none absolute inset-x-0 top-full mt-3 flex">
          <ListingEditBar onEdit={() => openForm('edit')} className="pointer-events-auto" />
        </div>
      )}
      </div>
      {showNav && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate!(1) }}
          disabled={!hasNext}
          aria-label="Next listing"
          // See "Previous listing"'s own doc just above for active:bg-slate-100
          // and the transition-[opacity,background-color] swap.
          className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg ring-1 ring-slate-900/10 transition-[opacity,background-color] hover:bg-slate-50 active:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer disabled:cursor-default"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
