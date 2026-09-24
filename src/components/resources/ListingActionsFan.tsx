'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { useIsMobile } from '@/lib/useIsMobile'
import { CheckIcon, DotsIcon, ExternalIcon, PinIcon, ThumbtackIcon } from '@/components/icons'
import { useListingActions, type ListingAction } from './useListingActions'

// ── The overflow beside an open listing's "Suggest an edit" pill ─────────
//
// Pin / Share / Set as location, as a fan of floating circles rather than a
// dropdown card — so everything in this layer (the Add "+", the edit pill,
// these) reads as one family of floating controls instead of a pill with a
// menu stapled to it.
//
// **Every circle carries a visible caption, always.** That isn't decoration
// and it isn't negotiable: Pin and Set-as-location are a thumbtack and a
// map-marker, two glyphs this codebase already had to split apart on purpose
// (see ActionIcon in ListingActionsMenu), and stripped of text they are a
// coin toss. The same lesson is written on the Add button itself, which
// grew a visible label on desktop precisely because a bare icon floating in
// a corner was "invisible unless you already knew to hover-and-guess".
//
// Mobile brings its own dim backdrop; desktop doesn't, because the dialog's
// own scrim is already there. Both still render a full-viewport backdrop
// element — on desktop it's simply transparent. That element is what makes
// outside-tap dismissal work at all: it's the actual topmost thing at that
// screen position, so a tap hits IT by the browser's own hit-testing rather
// than reaching the card, map, or Add button underneath. ListingActionsMenu
// has the long version of why every other approach to this failed.
const CIRCLE = 46
const GAP = 12
/** Generous enough for the longest label ("Set as location") plus its gap. */
const CAPTION = 132
/** The ‹ › listing arrows flank the dialog as flex siblings — 44px wide plus
 *  the overlay's own gap-3. The column has to start past them, because it
 *  rises from the bar at the dialog's BOTTOM while the arrows sit at its
 *  vertical MIDDLE: for any listing shorter than about twice the column
 *  (roughly 320px — a sparse one with an address and a phone and no hours)
 *  the two would land on each other. Applied unconditionally rather than
 *  only when the arrows render: it costs a few pixels of gap on a directory
 *  with a single result, and it removes a whole class of "only on short
 *  listings" bug. */
const NAV_CLEARANCE = 56
/** Clearance the trigger needs to its right before the column fits there. */
const SIDE_NEEDS = GAP + NAV_CLEARANCE + CIRCLE + CAPTION
const EDGE = 12

type Placement =
  /** Vertical column beside the trigger, captions to its right. The good one:
   *  every circle and caption sits on scrim rather than over the dialog, so
   *  white-on-white never comes up. */
  | { kind: 'side'; left: number; bottom: number }
  /** Horizontal row under the trigger, captions beneath each circle. Needs no
   *  side clearance at all — three circles are ~162px, which fits under the
   *  bar at any width — so it's what a narrow window falls back to. */
  | { kind: 'row'; right: number; top: number }
  /** Mobile: column rising from the trigger, captions to the LEFT so they
   *  never run off the right edge of a phone. */
  | { kind: 'stack'; right: number; bottom: number }

function ActionGlyph({ action }: { action: ListingAction }) {
  const cls = 'h-5 w-5'
  if (action.id === 'pin') return <ThumbtackIcon filled={action.active} className={cls} />
  if (action.id === 'share') return <ExternalIcon className={cls} />
  return action.active ? <CheckIcon className={cls} /> : <PinIcon className={cls} />
}

export default function ListingActionsFan({
  item,
  category,
  path,
}: {
  item: DirectoryResource
  category: CategoryConfig
  path: string
}) {
  const actions = useListingActions(item, category, path)
  const isMobile = useIsMobile()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  /** Where the page was when the fan opened — see the scroll handler. */
  const scrollAnchor = useRef(0)
  const open = placement !== null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlacement(null)
        triggerRef.current?.focus()
      }
    }
    // Same reasoning as ListingActionsMenu's: a scroll means the visitor has
    // moved on, and leaving a floating thing behind while the page slides
    // under it reads as stuck rather than dismissed.
    //
    // But "a scroll event fired" is NOT the same as "the page moved", and
    // the difference is a real bug rather than a technicality. A scroll
    // position changes synchronously; the event announcing it is queued and
    // arrives a frame or more later — measured at 26ms for a plain
    // scrollIntoView. So anything that scrolls this trigger into view and
    // then activates it — a phone still coasting through momentum scrolling
    // when the thumb comes down, and every automated click, which scrolls
    // its target into view first — opens the fan and is then closed by the
    // event belonging to the scroll that had already finished. It reads as
    // the fan flashing and vanishing for no reason.
    //
    // So compare positions instead of counting events. The anchor is taken
    // when the fan opens, by which time a synchronous scroll has already
    // landed, so a late event for it reports no movement and is ignored,
    // while genuine scrolling always differs. A scroll inside some nested
    // element still closes outright: nothing here ever scrolls one of those
    // programmatically, so those events can only mean a real visitor.
    const onScroll = (e: Event) => {
      const target = e.target
      const isPageScroll = target === document || target === document.scrollingElement
      if (isPageScroll && window.scrollY === scrollAnchor.current) return
      setPlacement(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  if (actions.length === 0) return null

  function openFan() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    scrollAnchor.current = window.scrollY
    const n = actions.length
    const columnHeight = n * CIRCLE + (n - 1) * GAP

    if (isMobile) {
      setPlacement({ kind: 'stack', right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.top + GAP })
      return
    }
    // Desktop tier 1: is there room beside the dialog for the column and its
    // captions? At a normal desktop width there's ~300-400px of scrim each
    // side of a 448px dialog, so this is the usual answer.
    const fitsSide =
      rect.right + SIDE_NEEDS + EDGE <= window.innerWidth && rect.bottom - columnHeight >= EDGE
    if (fitsSide) {
      setPlacement({ kind: 'side', left: rect.right + GAP + NAV_CLEARANCE, bottom: window.innerHeight - rect.bottom })
      return
    }
    // Tier 2: under the trigger instead. Trades the width constraint for a
    // height one, and a row of three is narrow enough to always fit.
    setPlacement({ kind: 'row', right: window.innerWidth - rect.right, top: rect.bottom + GAP })
  }

  const circleClass =
    'flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition-transform cursor-pointer hover:bg-slate-50 active:scale-95'
  // A text shadow rather than a chip behind the words: these sit on the
  // dialog's scrim (desktop) or this fan's own dim backdrop (mobile), both
  // dark, so the words read cleanly without another box around them.
  const captionClass =
    'text-[13.5px] font-semibold text-white whitespace-nowrap [text-shadow:0_1px_4px_rgba(0,0,0,0.7),0_0_14px_rgba(0,0,0,0.45)]'

  function select(action: ListingAction) {
    action.onSelect()
    // Share swaps its own label to "Copied!" as the confirmation — closing
    // the fan would take that away before anyone reads it.
    if (action.id !== 'share') setPlacement(null)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // "Actions for", NOT "More actions for" — that exact string is the
        // collapsed row's kebab (ListingActionsMenu), which is still in the
        // DOM behind this until the card loses it. Two controls sharing an
        // accessible name is a real problem for anyone navigating by name,
        // and it has bitten this codebase before (the floating Add button vs
        // the empty-state Add button). "More" was also never accurate here:
        // it implies some of the set is already visible, and none of it is.
        aria-label={open ? `Close actions for ${item.name}` : `Actions for ${item.name}`}
        onClick={(e) => {
          e.stopPropagation()
          if (open) setPlacement(null)
          else openFan()
        }}
        className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full shadow-lg transition-colors cursor-pointer ${
          open ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        {open ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <DotsIcon className="h-5 w-5" />
        )}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              // Dimmed on mobile only — desktop already has the dialog's own
              // scrim behind this. Transparent or not, it's the element that
              // catches an outside tap.
              onClick={(e) => {
                e.stopPropagation()
                setPlacement(null)
              }}
              className={`fixed inset-0 z-[55] ${isMobile ? 'bg-slate-900/55' : ''}`}
              aria-hidden="true"
            />
            <div
              role="menu"
              aria-label={`Actions for ${item.name}`}
              style={
                placement.kind === 'side'
                  ? { position: 'fixed', left: placement.left, bottom: placement.bottom }
                  : placement.kind === 'row'
                    ? { position: 'fixed', right: placement.right, top: placement.top }
                    : { position: 'fixed', right: placement.right, bottom: placement.bottom }
              }
              className={`z-[56] flex gap-3 ${
                placement.kind === 'row' ? 'flex-row items-start' : 'flex-col-reverse'
              } ${placement.kind === 'stack' ? 'items-end' : 'items-start'}`}
            >
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    select(action)
                  }}
                  className={`flex cursor-pointer items-center gap-3 ${
                    placement.kind === 'row' ? 'w-[74px] flex-col' : placement.kind === 'stack' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <span className={circleClass}>
                    <ActionGlyph action={action} />
                  </span>
                  <span className={`${captionClass} ${placement.kind === 'row' ? 'text-center text-[12px] whitespace-normal leading-tight' : ''}`}>
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
