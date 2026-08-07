'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Community } from '@/lib/communityStore'
import { useIsMobile } from '@/lib/useIsMobile'

// ── The community switcher ───────────────────────────────────────────────────
// Wraps the header's site name and turns it into the control that changes
// which community you're reading. The name already tells you where you are, so
// making it tappable costs no new real estate — the pattern Slack and Notion
// use for workspaces, and the reason this isn't a hamburger drawer (drawers
// hold destinations *within* a context; headers hold *which* context) or a
// bottom tab (tabs are peer destinations; a community switch re-scopes all of
// them at once).
//
// Renders its children untouched while there's only one community, so a
// single-community site looks and behaves exactly as it did before any of this
// existed — no chevron, no tap target, nothing to explain.

export default function CommunitySwitcher({
  communities,
  activeSlug,
  onSelect,
  children,
}: {
  communities: Community[] | null
  activeSlug: string | null
  onSelect: (slug: string) => void
  /** The header's existing name/tagline block. */
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const wrapRef = useRef<HTMLDivElement>(null)

  // Desktop dropdown: dismiss on an outside click or Escape, the way any
  // menu should. The mobile sheet has its own backdrop for this.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // One community (or still loading) — the switcher doesn't exist.
  if (!communities || communities.length < 2) return <>{children}</>

  const pick = (slug: string) => {
    setOpen(false)
    if (slug !== activeSlug) onSelect(slug)
  }

  const list = (
    <ul className="py-1">
      {communities.map((c) => {
        const active = c.slug === activeSlug
        return (
          <li key={c.slug}>
            <button
              type="button"
              onClick={() => pick(c.slug)}
              aria-current={active ? 'true' : undefined}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors sm:py-2.5 ${
                active ? 'bg-primary/5' : 'hover:bg-slate-50'
              } cursor-pointer`}
            >
              <span className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-transparent'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-sm font-medium ${active ? 'text-primary' : 'text-slate-900'}`}>
                  {c.name}
                </span>
                {c.region && <span className="block truncate text-xs text-muted">{c.region}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div ref={wrapRef} className="relative flex min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch community"
        className="flex min-w-0 flex-1 items-center gap-1 text-left cursor-pointer"
      >
        {children}
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open &&
        (isMobile ? (
          // Bottom sheet on a phone: the header sits at the top of a tall
          // screen, so a dropdown anchored to it lands out of thumb reach.
          //
          // Portaled to <body> because the header carries `backdrop-blur`, and
          // a backdrop-filter establishes a containing block for `position:
          // fixed` descendants — inside the header, `bottom-0` anchors to the
          // 65px header rather than the viewport and the sheet lands off-screen
          // above it. The portal takes it out of that containing block.
          createPortal(
            <>
              <div className="fixed inset-0 z-50 bg-slate-900/40" onClick={() => setOpen(false)} />
              <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
                <div className="flex justify-center py-2">
                  <span className="h-1 w-9 rounded-full bg-slate-300" aria-hidden="true" />
                </div>
                <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Community
                </p>
                {list}
              </div>
            </>,
            document.body,
          )
        ) : (
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            {list}
          </div>
        ))}
    </div>
  )
}
