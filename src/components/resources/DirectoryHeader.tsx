import type { ReactNode } from 'react'
import Breadcrumb from '@/components/Breadcrumb'
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
  /** When true and no anchorLabel, show the "Set location" prompt under the title. */
  addressPrompt?: boolean
  /** Right-aligned action buttons (Map, Add). Wrapped in a shrink-0 flex row. */
  actions?: ReactNode
  /** Ancestor label for the desktop-only Breadcrumb above the heading —
   *  mirrors the UpButton every caller already renders beside this component
   *  ("Home" on mobile, "All resources" on desktop for most callers; see
   *  GenericDirectory's own upLabel doc). Both this and onUp are required
   *  together or omitted together; a caller that doesn't pass them just gets
   *  no breadcrumb line, same as before this existed. */
  upLabel?: string
  onUp?: () => void
  /** True for a caller whose title is also shown in SiteHeader on mobile
   *  (GenericDirectory, via useSetScreenHeader) — visually hiding a second,
   *  identical "Food" directly under a mobile header already reading "‹
   *  Food" recovers real space with nothing lost, since the h1 role still
   *  needs to exist for a screen reader (`sr-only`, not removed) even where
   *  it's redundant to a sighted visitor. Desktop never shows the title in
   *  its header (Breadcrumb only names the "up" path, not this screen), so
   *  the h1 there stays visible regardless of this prop. Left `false` for a
   *  caller like HospitalsDirectory that still has its own mobile UpButton
   *  instead of a header title — hiding its only visible title would leave
   *  mobile with none at all. */
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
// Mobile density: the RESOLVED location label and the listing count are
// desktop-only now (`hidden desktop:*`); the unset "Set location" prompt
// stays on mobile but goes full-width (see AddressPrompt's own doc). All
// three used to share mobile density rules with this component's own
// `actions` (Add) sitting right beside them — a real bordered/colored
// button next to plain text that wasn't even this page's main content,
// which read unevenly no matter how the text itself was styled. The
// resolved address doesn't need repeating here on mobile: it stays
// reachable exactly the way it always has been, one tap on the header's own
// location pin (see LocationControl) — same pattern most directory apps
// use. The UNSET prompt is different: it's a real call to action (nothing
// works right until someone answers it), not a standing copy of something
// shown elsewhere, so it keeps its mobile presence and grows to fill the
// row instead of shrinking away. Desktop is unchanged either way: there's
// room, and desktop's `actions` sits in this same row rather than moving
// elsewhere (see GenericDirectory's own doc on where mobile's Add moved to).
export default function DirectoryHeader({ title, count, hasAddress, anchorLabel, addressPrompt, actions, upLabel, onUp, titleInHeader, banner }: Props) {
  const noun = hasAddress === false ? 'listing' : 'place'
  const countText = count != null ? `${count} ${noun}${count !== 1 ? 's' : ''}` : null

  return (
    <div>
      {banner}
      {upLabel && onUp && <Breadcrumb upLabel={upLabel} onUp={onUp} title={title} />}
      <div className="flex items-end justify-between gap-2 mb-2">
        {/* w-full desktop:w-auto: only the unset AddressPrompt below needs
            this column to actually stretch (it goes full-width on mobile —
            see that component's own doc); harmless for the other two
            branches, which size to their own content either way. Reverts
            on desktop so this stays a normal auto-width flex item there,
            same as `actions` beside it. */}
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
            // pin regardless). text-base font-medium text-slate-600, not
            // text-sm text-muted, is still right for the desktop rendering:
            // it sits beside a real button there (`actions`, e.g. Add:
            // bordered, colored, padded), and needs enough presence not to
            // read as an afterthought next to it.
            <p className="hidden desktop:flex items-center gap-1 text-base font-medium text-slate-600 mt-0.5">
              {/* Without this, a named-place anchor (a hospital, or an
                  address typed as a landmark) reads as plain text right
                  under the heading — easy to mistake for content rather
                  than "this is where you're anchored." The unset state
                  right below (AddressPrompt) already pairs its own prompt
                  with this same pin; this just matches it once a location
                  actually is set. */}
              <PinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {anchorLabel}
              {countText && (
                <>
                  <span aria-hidden="true" className="hidden desktop:inline mx-1.5">·</span>
                  <span className="hidden desktop:inline">{countText}</span>
                </>
              )}
            </p>
          ) : addressPrompt ? (
            <div className="flex w-full desktop:w-auto items-center gap-1.5 mt-1.5 flex-wrap">
              <AddressPrompt />
              {countText && (
                <span className="hidden desktop:inline text-sm text-muted">
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
