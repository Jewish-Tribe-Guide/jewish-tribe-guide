'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { haversineMiles } from '@/lib/geo'
import CategoryIcon from '@/components/CategoryIcon'
import { ExternalIcon, PinIcon } from '@/components/icons'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { categoryTint } from '@/lib/categoryColor'
import { PHOTO_FIELD_KEY } from '@/lib/categories'
import { usePinned } from '@/lib/pinnedContext'
import { useCommunitySlug } from '@/lib/communityContext'
import { useShareLink } from '@/lib/useShareLink'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import type { MapPoint } from './ResourceMap'
import type { DirectoryResource } from '@/types'

// Width of one action button revealed behind a row when it's swiped left,
// matching the reveal-and-tap pattern iOS Mail uses for its row actions —
// swiping exposes the buttons rather than firing an action at a drag
// threshold, so a visitor scrolling the sheet vertically can't pin or share
// something by accident.
const ACTION_WIDTH = 84
// Share sits left of Pin, which stays at the row's edge — that's the button
// a visitor already has muscle memory for, so a small swipe still reveals it
// first, same as before Share existed.
const REVEAL_WIDTH = ACTION_WIDTH * 2

// Mouse/trackpad users get the desktop convention instead of the touch one:
// hovering reveals the row action (iMessage/Mail-on-Mac style) and it stays
// up for as long as the pointer sits over the row, no drag-and-hold required.
// useSyncExternalStore (not state+effect) because this is genuinely reading
// an external source of truth — starts false to match SSR (getServerSnapshot),
// then the real value on the client, same hydration-safety reasoning as
// PinnedProvider.
const HOVER_QUERY = '(hover: hover) and (pointer: fine)'
function subscribeHoverCapable(callback: () => void) {
  const mql = window.matchMedia(HOVER_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}
function getHoverCapableSnapshot() {
  return window.matchMedia(HOVER_QUERY).matches
}
function getHoverCapableServerSnapshot() {
  return false
}

type LatLng = { lat: number; lng: number }
type InputPoint = MapPoint & { filterId: string; raw?: DirectoryResource }
export type ScoredPoint = InputPoint & { miles: number | null }

// Hospitals are curated data — they have no directory listing to open.
const HOSPITALS_FILTER_ID = '__hospitals__'

type Props = {
  points: InputPoint[]
  userLocation: LatLng | null
  /** Called when the user taps a listing row — opens that listing's detail card
   *  in the category directory. Not fired for hospitals (no directory entry).
   *  Ignored when `onSelectPlace` is provided. */
  onViewListing?: (categoryId: string, listingId: string) => void
  /** When provided, tapping a row calls this instead of onViewListing — the
   *  mobile map's bottom sheet uses it to show details inline over the map
   *  instead of navigating away to the category directory. Desktop's Nearby
   *  tab leaves this unset and keeps the normal navigate-away behavior. */
  onSelectPlace?: (point: ScoredPoint) => void
}

function distanceLabel(miles: number): string {
  if (miles < 0.05) return 'You are here'
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`
  return `${(Math.round(miles * 10) / 10).toFixed(1)} mi`
}

export default function NearbyList({ points, userLocation, onViewListing, onSelectPlace }: Props) {
  const { toggle } = usePinned()
  // Only one row's pin action stays revealed at a time — opening a second
  // row snaps the first shut, same as iOS Mail's swipe actions.
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  const hoverCapable = useSyncExternalStore(subscribeHoverCapable, getHoverCapableSnapshot, getHoverCapableServerSnapshot)

  const sorted = useMemo<ScoredPoint[]>(() => {
    const scored = points.map((p) => ({
      ...p,
      miles: userLocation ? haversineMiles(userLocation, { lat: p.lat, lng: p.lng }) : null,
    }))
    return scored.sort((a, b) => {
      // Pinned listings always float to the top, ahead of distance/upvote
      // ordering — that's the whole point of pinning something from here.
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      if (a.miles === null && b.miles === null) {
        return (b.raw?.upvotes ?? 0) - (a.raw?.upvotes ?? 0) || a.name.localeCompare(b.name)
      }
      if (a.miles === null) return 1
      if (b.miles === null) return -1
      return a.miles - b.miles
    })
  }, [points, userLocation])

  if (sorted.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        No places to show. Turn on a category above.
      </p>
    )
  }

  return (
    <div className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-900/5 bg-white overflow-hidden">
      {sorted.map((p) => {
        const canViewListing = !!(onSelectPlace || onViewListing) && p.filterId !== HOSPITALS_FILTER_ID
        // Hospitals have no directory entry, so there's nothing to pin either.
        const canPin = p.filterId !== HOSPITALS_FILTER_ID

        return (
          <NearbyRow
            key={p.id}
            point={p}
            canViewListing={canViewListing}
            canPin={canPin}
            hoverCapable={hoverCapable}
            isOpen={openRowId === p.id}
            onOpenChange={(open) => setOpenRowId(open ? p.id : null)}
            onSelect={() => (onSelectPlace ? onSelectPlace(p) : onViewListing!(p.filterId, p.id))}
            onTogglePin={() => {
              toggle({ id: p.id, categoryId: p.filterId })
              setOpenRowId(null)
            }}
          />
        )
      })}
    </div>
  )
}

type RowProps = {
  point: ScoredPoint
  canViewListing: boolean
  canPin: boolean
  hoverCapable: boolean
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSelect: () => void
  onTogglePin: () => void
}

function NearbyRow({ point: p, canViewListing, canPin, hoverCapable, isOpen, onOpenChange, onSelect, onTogglePin }: RowProps) {
  const [dragX, setDragX] = useState(0)
  const dragXRef = useRef(0)
  // True while a touch drag or a trackpad swipe gesture is actively moving
  // the row — covers both so the sync effect below doesn't fight either one.
  const activeGestureRef = useRef(false)
  const movedRef = useRef(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const startDragXRef = useRef(0)
  const wheelSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Sharing needs the same real directory entry pinning does — hospitals
  // (canPin false, no `raw`) have neither. listingPath is '' in that case;
  // the hook is still called unconditionally (rules of hooks), it's just
  // never reachable since the Share button isn't rendered for that row.
  const community = useCommunitySlug()
  const listingPath = canPin ? routes.listing(community, p.filterId, p.raw ? listingSlug(p.raw) : p.id) : ''
  const { share, copied } = useShareLink(listingPath, p.name)

  // Keeps the row in sync when it's closed externally (another row opened,
  // the pin button fired, or an outside click landed) without fighting an
  // in-progress drag/swipe.
  useEffect(() => {
    if (!activeGestureRef.current) {
      dragXRef.current = isOpen ? -REVEAL_WIDTH : 0
      setDragX(dragXRef.current)
    }
  }, [isOpen])

  // Closes the row when a swipe has left it open and the visitor clicks
  // anywhere else on the page — the trackpad-swipe equivalent of iOS Mail's
  // "tap elsewhere to dismiss," since desktop has no separate tap-to-close.
  useEffect(() => {
    if (!hoverCapable || !isOpen) return
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('click', onDocClick, true)
    return () => document.removeEventListener('click', onDocClick, true)
  }, [hoverCapable, isOpen, onOpenChange])

  function onPointerDown(e: React.PointerEvent) {
    // Desktop uses a trackpad swipe (onWheel below), not a held-mouse drag —
    // there's no natural "release" moment on a mouse the way lifting a
    // finger reads as committing to the action.
    if (hoverCapable || !canPin) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    startDragXRef.current = dragX
    activeGestureRef.current = false
    movedRef.current = false
  }

  function onPointerMove(e: React.PointerEvent) {
    if (hoverCapable || !canPin || startXRef.current === undefined) return
    const delta = e.clientX - startXRef.current
    if (!activeGestureRef.current) {
      // Claims the gesture only once it's CLEARLY horizontal — not just past
      // a flat threshold, but past it with more horizontal movement than
      // vertical. A plain `abs(delta) >= 8` check (what this used to be)
      // still let a mostly-vertical drag claim the row the moment its
      // horizontal component ticked past 8px, even while the same drag was
      // also moving the sheet up/down — which is exactly the "swiping left
      // still triggers the up/down scroll" feel Spotify/WhatsApp don't have.
      // Comparing against deltaY is what actually locks the two apart: a
      // vertical-dominant drag never satisfies this, so it never captures
      // here and never calls stopPropagation below, leaving the sheet's own
      // vertical handling (an ancestor's bubbled listener) completely
      // unaffected for that gesture.
      const deltaY = e.clientY - startYRef.current
      if (Math.abs(delta) < 8 || Math.abs(delta) <= Math.abs(deltaY)) return
      activeGestureRef.current = true
      movedRef.current = true
      // Can throw if the pointer was already released between events (fast
      // flicks) — capture is a nicety here, not required for the drag math.
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
    }
    // Claimed as horizontal (this event or an earlier one in the same
    // gesture) — stop it from also bubbling to MobileNearbySheet's own
    // vertical-drag listener on an ancestor, the other half of the same
    // axis-lock: once a gesture is horizontal, it should never also read as
    // a vertical drag/scroll for the sheet, the same way Spotify/WhatsApp's
    // row swipes don't fight their list's own vertical scroll.
    e.stopPropagation()
    dragXRef.current = Math.min(0, Math.max(-REVEAL_WIDTH, startDragXRef.current + delta))
    setDragX(dragXRef.current)
  }

  function endDrag(e: React.PointerEvent) {
    if (hoverCapable) return
    if (activeGestureRef.current) {
      // Same reasoning as onPointerMove's own stopPropagation — without it,
      // MobileNearbySheet's onContentPointerUp (an ancestor's bubbled
      // listener) could still resolve a snap-point change from whatever
      // small residual vertical delta it saw before this gesture locked
      // itself to horizontal, turning a pure row-swipe into an unwanted
      // sheet-height change too.
      e.stopPropagation()
      const shouldOpen = dragX < -REVEAL_WIDTH / 2
      onOpenChange(shouldOpen)
      dragXRef.current = shouldOpen ? -REVEAL_WIDTH : 0
      setDragX(dragXRef.current)
    }
    activeGestureRef.current = false
  }

  // Registered as a native, non-passive listener (see effect below) rather
  // than React's onWheel prop — React attaches wheel handlers passively by
  // default, which silently ignores preventDefault() and lets the sidebar
  // scroll sideways underneath the swipe.
  //
  // On `wrapperRef`, not `contentRef` — once a row is open, the content div
  // has slid REVEAL_WIDTH out from under the cursor, and the Pin/Share
  // buttons revealed behind it sit in a separate sibling with no wheel
  // listener of their own. A swipe-to-close gesture starting with the
  // pointer already over those buttons landed on that sibling instead and
  // never reached this handler at all — it simply did nothing. `wrapperRef`
  // spans the whole row (content and the revealed strip both) regardless of
  // dragX, so a swipe closes the row no matter where over it it starts.
  useEffect(() => {
    if (!hoverCapable || !canPin) return
    const el = wrapperRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      // Any real horizontal component gets prevented, not just events where
      // it dominates deltaY — Chrome/Safari decide whether to hijack the
      // *whole* gesture as swipe-navigation from its first couple of ticks,
      // which often start diagonal before settling into a clean horizontal
      // swipe. Waiting for deltaX to clearly win before calling
      // preventDefault() left those opening ticks unconsumed, which was
      // enough on its own to trigger the browser's back gesture — most
      // noticeable swiping right to close a row that's already open. A tiny
      // noise floor keeps genuine vertical scrolling (deltaX ~ 0) untouched.
      if (Math.abs(e.deltaX) < 2) return
      e.preventDefault()
      activeGestureRef.current = true
      // Trackpad "swipe left" reports positive deltaX under macOS's default
      // natural-scrolling direction — subtracting it moves the row left, the
      // same direction the fingers moved, mirroring the touch-drag math above.
      dragXRef.current = Math.min(0, Math.max(-REVEAL_WIDTH, dragXRef.current - e.deltaX))
      setDragX(dragXRef.current)
      if (wheelSettleTimer.current) clearTimeout(wheelSettleTimer.current)
      // Wheel events have no discrete "end" the way pointerup does — treat a
      // short gap since the last tick as the gesture finishing, then snap
      // open or closed the same way a touch drag resolves on release.
      wheelSettleTimer.current = setTimeout(() => {
        activeGestureRef.current = false
        const shouldOpen = dragXRef.current < -REVEAL_WIDTH / 2
        onOpenChange(shouldOpen)
        dragXRef.current = shouldOpen ? -REVEAL_WIDTH : 0
        setDragX(dragXRef.current)
      }, 150)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hoverCapable, canPin, onOpenChange])

  function onRowClickCapture(e: React.MouseEvent) {
    // Swallow the click that follows a drag/swipe, and use a click on an
    // already-open row to close it instead of firing the row's normal
    // action — same "dismiss before you can act again" rule on both touch
    // and desktop.
    if (movedRef.current || isOpen) {
      e.preventDefault()
      e.stopPropagation()
      movedRef.current = false
      if (isOpen) onOpenChange(false)
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="relative overflow-hidden bg-white touch-pan-y"
      // Pointer handlers live here, not on the content div below, for the
      // same reason the wheel listener moved up (see its own comment): once
      // a row is open, a swipe/drag starting over the revealed Pin/Share
      // buttons needs to close it too, and only this wrapper spans that area
      // regardless of dragX. `touch-pan-y` matches — a touch beginning on
      // those buttons needs the same "vertical scroll stays native, I claim
      // horizontal" contract the content div already declared for itself.
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {canPin && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: REVEAL_WIDTH }}>
          {/* Doesn't close the row on its own, unlike Pin below — the
              clipboard-copy fallback's "Copied!" feedback renders on this
              same button, so closing immediately would hide it before the
              visitor sees it. The native share sheet (when available)
              doesn't need this row for feedback at all. */}
          <button
            onClick={share}
            aria-label={`Share ${p.name}`}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: '#0f172a' }}
          >
            <ExternalIcon className="h-4 w-4" />
            {copied ? 'Copied!' : 'Share'}
          </button>
          <button
            onClick={onTogglePin}
            aria-label={p.pinned ? `Unpin ${p.name}` : `Pin ${p.name}`}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: p.pinned ? '#64748b' : '#2563eb' }}
          >
            <PinIcon filled={p.pinned} className="h-4 w-4" />
            {p.pinned ? 'Unpin' : 'Pin'}
          </button>
        </div>
      )}
      <div
        ref={contentRef}
        className="relative flex items-stretch gap-2 bg-white px-4 py-3 touch-pan-y"
        style={{
          transform: `translateX(${dragX}px)`,
          // Deliberately a ref, not state: every write above is paired with a
          // setDragX call that already re-renders this, except the two resets
          // to `false` (pointerdown, end-of-drag-when-never-dragged) — both are
          // no-ops for this style either way, so there's no stale-read case
          // that actually changes what renders. Converting to state would risk
          // a real regression instead: reading state in these pointer-event
          // closures can lag behind rapid-fire move events across renders in a
          // way a ref never does, and that's exactly the drag math this file's
          // comments above are tuned around.
          // eslint-disable-next-line react-hooks/refs
          transition: activeGestureRef.current ? 'none' : 'transform 200ms ease',
        }}
        onClickCapture={onRowClickCapture}
      >
        {/* Name + category + address — tappable when a directory exists.
            Icon lives inside the button too so the whole left cluster is
            one tap target, Google-Maps-style, not just the text. */}
        <button
          onClick={canViewListing ? onSelect : undefined}
          disabled={!canViewListing}
          className={`flex min-w-0 flex-1 items-center gap-3 text-left ${canViewListing ? 'cursor-pointer group' : 'cursor-default'}`}
        >
          <CategoryIcon
            icon={p.glyph ?? '📍'}
            categoryId={p.filterId}
            iconImageUrl={
              (typeof p.raw?.[PHOTO_FIELD_KEY] === 'string' && (p.raw[PHOTO_FIELD_KEY] as string).trim()
                ? (p.raw[PHOTO_FIELD_KEY] as string)
                : p.glyphSrc) ?? undefined
            }
            color={p.color}
            className="h-9 w-9 text-lg"
            sizePx={36}
          />
          <span className="min-w-0 flex-1">
            <p className={`text-sm font-semibold leading-tight ${canViewListing ? 'text-slate-900 group-hover:text-blue-600 transition-colors' : 'text-slate-900'}`}>
              {p.name}
              {canViewListing && (
                <span className="ml-1 text-slate-300 group-hover:text-blue-400 transition-colors text-xs">›</span>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {p.categoryLabel}
              {p.address ? ` · ${p.address}` : ''}
            </p>
          </span>
        </button>

        {/* A small category badge + distance — a quiet color-tinted
            glyph, not a directions shortcut: the row's own tap already
            opens full details (including a real directions link), so a
            second action here just competed with it. The badge repeats
            the left icon's color/glyph in miniature purely so the
            category still reads at a glance once the photo/logo (not
            always present) isn't what's showing on the left. Badge on
            top, distance below — the badge is the more glanceable of the
            two (color/shape read faster than digits), same as the pin
            markers on the map themselves sit above their labels. */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 ml-1">
          <span
            className="relative flex h-6 w-6 items-center justify-center rounded-full text-xs"
            style={{ backgroundColor: categoryTint(p.color), color: p.color }}
            aria-hidden="true"
          >
            <CategoryGlyph categoryId={p.filterId} icon={p.glyph ?? '📍'} className="h-3.5 w-3.5" />
            {/* Same small badge, same blue, as the pinned marker gets on
                the map itself (see ResourceMap's buildPin) — this row's
                own category badge is the closest equivalent spot to
                overlay it here, so "pinned" reads the same way in both
                places. */}
            {p.pinned && (
              <span
                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white text-[8px] leading-none text-white"
                style={{ backgroundColor: '#2563eb' }}
              >
                📌
              </span>
            )}
          </span>
          {p.miles !== null && (
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: p.color }}>
              {distanceLabel(p.miles)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
