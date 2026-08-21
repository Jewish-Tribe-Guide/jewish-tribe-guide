import type { ReactNode } from 'react'
import AddressPrompt from './AddressPrompt'

type Props = {
  /** The category/section title (e.g. "Synagogues", "Which hospital?"). */
  title: string
  /** Listing count shown after a dot separator. Omit to hide the count entirely
   *  (e.g. the hospitals list, which isn't a counted directory). */
  count?: number
  /** Location label shown under the title once a location is set (typed address
   *  or hospital name). Takes precedence over the address prompt. */
  anchorLabel?: string
  /** When true and no anchorLabel, show the "Set location" prompt under the title. */
  addressPrompt?: boolean
  /** Right-aligned action buttons (Map, Add). Wrapped in a shrink-0 flex row. */
  actions?: ReactNode
}

// Shared heading block for every directory: the title plus the location/count
// subline. Consolidated here so the subline's layout — and its mobile-density
// rules — live in ONE place instead of being copy-pasted (and drifting) across
// the synagogue, generic, and hospital directories.
//
// Mobile density: the listing count is supplementary, so it's hidden on small
// screens (`hidden desktop:*`) to keep the header from crowding next to the
// location label or the "Set location" prompt. The count always shows on
// desktop.
export default function DirectoryHeader({ title, count, anchorLabel, addressPrompt, actions }: Props) {
  const countText = count != null ? `${count} listing${count !== 1 ? 's' : ''}` : null

  return (
    <div className="flex items-end justify-between gap-2 mb-2">
      <div>
        {/* h1, not h2: this is the page's own main heading (every category
            directory, the synagogue/hospitals directories, all share this
            component) — every other top-level screen in the app (home,
            All Categories, Inbox, admin, the error/offline pages) already
            uses h1 for the same role. A real gap, not a style choice: axe's
            page-has-heading-one caught every one of these pages having no
            h1 at all. */}
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        {anchorLabel ? (
          <p className="text-sm text-muted mt-0.5">
            {anchorLabel}
            {countText && (
              <>
                <span aria-hidden="true" className="hidden desktop:inline mx-1.5">·</span>
                <span className="hidden desktop:inline">{countText}</span>
              </>
            )}
          </p>
        ) : addressPrompt ? (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
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
  )
}
