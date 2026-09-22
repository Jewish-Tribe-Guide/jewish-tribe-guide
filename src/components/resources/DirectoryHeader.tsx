import type { ReactNode } from 'react'
import AddressPrompt from './AddressPrompt'
import { PinIcon } from '@/components/icons'

type Props = {
  /** The category/section title (e.g. "Synagogues", "Which hospital?"). */
  title: string
  /** Listing count shown after a dot separator. Omit to hide the count entirely
   *  (e.g. the hospitals list, which isn't a counted directory). */
  count?: number
  /** Same distinction the home screen's category tiles make (see
   *  home/sections.tsx's `cardCount`): a category whose listings have no
   *  address isn't a set of places you can go to — WhatsApp Groups and
   *  Networking are the live cases — so the count reads "N listings" there
   *  and "N places" everywhere else, rather than always saying "listings"
   *  regardless of what the category actually is. Defaults to true (most
   *  categories have addresses), matching `hasAddress !== false` elsewhere. */
  hasAddress?: boolean
  /** Location label shown under the title once a location is set (typed address
   *  or hospital name). Takes precedence over the address prompt. */
  anchorLabel?: string
  /** When true and no anchorLabel, show the "Set location" prompt under the
   *  title — desktop only; mobile's own copy lives at the top of the page
   *  instead (GenericDirectory). */
  addressPrompt?: boolean
  /** Right-aligned action buttons (Map, Add). Wrapped in a shrink-0 flex row. */
  actions?: ReactNode
  /** True for a caller whose title is also shown in SiteHeader on mobile
   *  (GenericDirectory, via useSetScreenHeader) — visually hiding a second,
   *  identical "Food" directly under a mobile header already reading "‹
   *  Food" recovers real space with nothing lost, since the h1 role still
   *  needs to exist for a screen reader (`sr-only`, not removed) even where
   *  it's redundant to a sighted visitor. Desktop's header never swaps to a
   *  per-screen title the way mobile's does, so the h1 there stays visible
   *  regardless of this prop. Left `false` for a caller like
   *  HospitalsDirectory that still has its own mobile UpButton instead of a
   *  header title — hiding its only visible title would leave mobile with
   *  none at all. */
  titleInHeader?: boolean
  /** Desktop-only category icon badge, shown above everything else in this
   *  header — see GenericDirectory's own doc on how this pairs (a matching
   *  ViewTransition name) with the same badge on the category's home-screen
   *  row, so clicking it visibly grows into this one instead of a flat
   *  crossfade. Omitted entirely (not just visually hidden) when the
   *  category has no icon, or on mobile, where the home->category move
   *  already communicates hierarchy via its own directional slide instead. */
  banner?: ReactNode
}

// Shared heading block for every directory: the title plus the location/count
// subline. Consolidated here so the subline's layout — and its mobile-density
// rules — live in ONE place instead of being copy-pasted (and drifting) across
// the synagogue, generic, and hospital directories.
//
// Mobile density: the RESOLVED location label, the listing count, AND the
// unset "Set location" prompt are all desktop-only now (`hidden desktop:*`).
// The resolved address and the count don't need repeating here on mobile:
// the address stays reachable exactly the way it always has been, one tap on
// the header's own location pin (see LocationControl), and the count moved
// nowhere in particular — it just isn't shown twice. The unset prompt used
// to be the exception (a real call to action, so it kept its mobile presence
// and grew to fill this row instead of shrinking away) — it now has its own
// full-width, bigger `banner` variant at the very top of the mobile page
// instead (GenericDirectory), separated from the search bar it used to sit
// right above here. Desktop is unchanged either way: there's room, and
// desktop's compact `inline` variant stays right here next to the title.
export default function DirectoryHeader({ title, count, hasAddress, anchorLabel, addressPrompt, actions, titleInHeader, banner }: Props) {
  const noun = hasAddress === false ? 'listing' : 'place'
  const countText = count != null ? `${count} ${noun}${count !== 1 ? 's' : ''}` : null

  return (
    <div>
      {banner}
      {/* Holds open the vertical space the desktop-only Breadcrumb used to
          take up here (removed — it repeated the title text right below it,
          e.g. "All resources / Grocery" directly above an h1 that already
          said "Grocery"). Kept as a bare spacer, not deleted outright: the
          icon badge above and the heading below read as glued together
          without it, sized to match Breadcrumb's own box exactly (its
          text-sm line height plus its default mb-2). mb-[0.5rem], not mb-2 —
          same 8px margin, but a literal-value class so this element doesn't
          also match a `.mb-2` selector meant for the row below (see this
          component's own test). */}
      <div className="hidden desktop:block h-5 mb-[0.5rem]" aria-hidden="true" />
      <div className="flex items-end justify-between gap-2 mb-2">
        {/* w-full desktop:w-auto: harmless leftover from when the unset
            AddressPrompt below needed this column to stretch on mobile —
            that branch is desktop-only now (see its own comment), so
            nothing here actually needs the mobile stretch any more, but it
            doesn't hurt the other branches either, which size to their own
            content either way. Reverts on desktop so this stays a normal
            auto-width flex item there, same as `actions` beside it. */}
        <div className="w-full desktop:w-auto">
          {/* h1, not h2: this is the page's own main heading (every category
              directory, the synagogue/hospitals directories, all share this
              component) — every other top-level screen in the app (home,
              All Categories, Inbox, admin, the error/offline pages) already
              uses h1 for the same role. A real gap, not a style choice: axe's
              page-has-heading-one caught every one of these pages having no
              h1 at all. */}
          <h1 className={`text-xl font-semibold text-slate-800 ${titleInHeader ? 'sr-only desktop:not-sr-only' : ''}`}>{title}</h1>
          {anchorLabel ? (
            // desktop:flex, not shown on mobile at all — see this file's
            // own doc above on why a resolved address no longer repeats
            // here on mobile (it's a tap away via the header's own location
            // pin regardless). Plain text-sm text-muted here — the
            // text-base/font-medium/slate-600 weight bump this briefly went
            // through was aimed at mobile, where this line used to be the
            // only content in the row; that reasoning never applied to
            // desktop, which still has the visible h1 and a real Add button
            // doing the heavy lifting, so it's reverted back to how it
            // looked before that sequence of changes.
            <p className="hidden desktop:flex items-center gap-1 text-sm text-muted mt-0.5">
              {/* Without this, a named-place anchor (a hospital, or an
                  address typed as a landmark) reads as plain text right
                  under the heading — easy to mistake for content rather
                  than "this is where you're anchored." The unset state
                  right below (AddressPrompt) already pairs its own prompt
                  with this same pin; this just matches it once a location
                  actually is set. */}
              <PinIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {anchorLabel}
              {countText && (
                <>
                  <span aria-hidden="true" className="hidden desktop:inline mx-1.5">·</span>
                  <span className="hidden desktop:inline">{countText}</span>
                </>
              )}
            </p>
          ) : addressPrompt ? (
            // Desktop only now — mobile's own copy of this moved to the very
            // top of the page (GenericDirectory's `banner` variant), away
            // from the search bar it used to sit right above. This compact
            // pill next to the title is desktop-only chrome and always has
            // been; it just needs its own `hidden desktop:*` now that
            // there's no longer a mobile instance sharing this component.
            <div className="hidden desktop:flex items-center gap-1.5 mt-1.5 flex-wrap">
              <AddressPrompt variant="inline" />
              {countText && (
                <span className="text-sm text-muted">
                  <span aria-hidden="true" className="mr-1">·</span>{countText}
                </span>
              )}
            </div>
          ) : countText ? (
            <p className="hidden desktop:block text-sm text-muted mt-0.5">
              <span aria-hidden="true" className="mr-1.5">·</span>{countText}
            </p>
          ) : null}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
