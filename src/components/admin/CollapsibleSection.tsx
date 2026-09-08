'use client'

import { useState } from 'react'

// ── A collapsed-by-default "Show ▸ / Hide ▾" card — the same disclosure
// pattern the Metrics tab's Google sync coverage report introduced
// (originally a one-off `Section` local to SyncCoveragePanel.tsx, which now
// imports this instead of keeping its own copy). Reused anywhere an admin
// page has grown into several sizable blocks stacked on one screen (Site/
// Desktop/Mobile's settings tabs, a community's admin roster): closed by
// default keeps the page scannable — a list of what's editable here — and
// still gets everything's full state (a half-finished edit in a section
// that's since been collapsed isn't lost, since closing is just a CSS
// toggle over React state that was always there).
//
// `count`, not `children.length` or similar: some callers (a list of
// flagged listings) have a real, meaningful count to show next to the
// title; most (a settings form) don't, and `undefined` here just omits the
// "(N)" suffix rather than forcing a caller to compute a number that means
// nothing. When a count of exactly 0 is given, the content still doesn't
// render if opened — same as the original Sync Coverage behavior, where an
// empty list has nothing to show even if clicked open.
export default function CollapsibleSection({
  title,
  description,
  count,
  defaultOpen = false,
  contentClassName = 'divide-y divide-slate-100',
  children,
}: {
  title: string
  description?: string
  count?: number
  defaultOpen?: boolean
  /** The open content wrapper's own classes — defaults to Sync Coverage's
   *  own original shape (a list of rows, each with its own padding, with a
   *  divider between them). A settings form instead wants plain padding —
   *  pass `'p-4'`. */
  contentClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const hasContent = count === undefined || count > 0

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        // Without this, the button's accessible name is its ENTIRE text
        // content (title + description + "Show"/"Hide") — every section's
        // toggle then has a different, unpredictable name, and a test or a
        // screen reader user asking for "the Show button" has no reliable
        // way to find one among several. Naming it explicitly also says
        // which section it opens, not just "Show" in the abstract.
        aria-label={`${open ? 'Hide' : 'Show'} ${title}`}
        className="w-full flex items-center justify-between gap-3 p-4 text-left cursor-pointer"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">
            {title}
            {count !== undefined && <span className="font-normal text-muted"> ({count})</span>}
          </h3>
          {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
        </div>
        <span aria-hidden="true" className="text-xs text-muted shrink-0">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && hasContent && <div className={`border-t border-slate-100 ${contentClassName}`}>{children}</div>}
    </div>
  )
}
