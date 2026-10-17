'use client'

import { useEffect, useMemo, useRef } from 'react'
import { haversineMiles } from '@/lib/geo'
import CategoryIcon from '@/components/CategoryIcon'
import SavedBadge from '@/components/SavedBadge'
import SwipeRow, { SwipeRowGroup, type SwipeAction } from '@/components/SwipeRow'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { categoryTint } from '@/lib/categoryColor'
import { PHOTO_FIELD_KEY, type CategoryConfig } from '@/lib/categories'
import { usePinned } from '@/lib/pinnedContext'
import { useCategories } from '@/lib/useCategories'
import { useNow } from '@/lib/useNow'
import { listingRowFacts, type RowFact } from '@/lib/listingRow'
import { neighborhoodsFor, placeName, townsFrom } from '@/lib/places'
import { FACT_TONE } from '@/components/resources/rowFactTone'
import { useCommunitySlug } from '@/lib/communityContext'
import { useShareLink } from '@/lib/useShareLink'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { TONE_DOT, TONE_WORDS } from '@/lib/eruvTone'
import type { EruvTone } from '@/lib/eruv'
import type { MapPoint } from './ResourceMap'
import type { DirectoryResource } from '@/types'
import { pointerHover } from '@/lib/pointerHover'

// Rows swipe to reveal Save/Share through SwipeRow, the one swipe
// implementation both lists share — the gesture's tuning (thresholds, flick
// velocity, the trackpad path) and the reveal's look live there now.

type LatLng = { lat: number; lng: number }
type InputPoint = MapPoint & { filterId: string; raw?: DirectoryResource }
export type ScoredPoint = InputPoint & { miles: number | null }
/** An eruv whose lines are on the map, with its status now. */
export type NearbyEruv = { id: string; name: string; tone: EruvTone; label: string }

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
  /** The eruvim drawn on the map, listed when they're all it shows (the
   *  Eruv chip from everything): the lines alone are a view, so the list
   *  has what's on the map rather than "nothing to show". */
  eruvim?: NearbyEruv[]
  onSelectEruv?: (id: string) => void
  /** The row under the pointer, or null once it leaves: its pin lifts on
   *  the map beside the list, as a category page's does (the user, Oct
   *  16). The computer's sidebar only; a phone has no pointer to follow. */
  onHover?: (id: string | null) => void
}

function distanceLabel(miles: number): string {
  if (miles < 0.05) return 'You are here'
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`
  return `${(Math.round(miles * 10) / 10).toFixed(1)} mi`
}

export default function NearbyList({ points, userLocation, onViewListing, onSelectPlace, eruvim, onSelectEruv, onHover }: Props) {
  const { toggle } = usePinned()
  // A row opened with a click unmounts the list before the pointer leaves
  // it, so its mouseleave never comes: let go of the pin as the list goes,
  // or it would stay lifted after Back.
  const onHoverRef = useRef(onHover)
  useEffect(() => {
    onHoverRef.current = onHover
  })
  useEffect(() => () => onHoverRef.current?.(null), [])
  // What each row says, as a category page's row says it (the user, Oct
  // 15: the map's rows felt small beside the category pages'): where it is
  // beside the name, and the facts line, open or when it opens, then its
  // hechsher and the like, instead of its category and a street address cut
  // off halfway.
  const categories = useCategories()
  const community = useCommunitySlug()
  const clock = useNow()
  const byId = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const places = useMemo(() => {
    const listings = points.flatMap((p) => (p.raw ? [p.raw] : []))
    const hoods = neighborhoodsFor(community)
    const towns = townsFrom(listings)
    return new Map(listings.map((l) => [l.id, placeName(l, hoods, towns)]))
  }, [points, community])
  // Which kind of place each row is, said first on its second line, in its
  // pins' colour, wherever the list mixes kinds (the user, Oct 16: "people
  // will want to know which category a given listing is"). Not where it's
  // all one: "Food" on every row of a Food list says nothing.
  const mixed = new Set(points.map((p) => p.filterId)).size > 1

  const sorted = useMemo<ScoredPoint[]>(() => {
    const scored = points.map((p) => ({
      ...p,
      miles: userLocation ? haversineMiles(userLocation, { lat: p.lat, lng: p.lng }) : null,
    }))
    return scored.sort((a, b) => {
      // Saved places keep their place (Oct 14): nearest first means nearest
      // first. Their badge is how they stand out.
      if (a.miles === null && b.miles === null) {
        return (b.raw?.upvotes ?? 0) - (a.raw?.upvotes ?? 0) || a.name.localeCompare(b.name)
      }
      if (a.miles === null) return 1
      if (b.miles === null) return -1
      return a.miles - b.miles
    })
  }, [points, userLocation])

  // The eruvim drawn on the map, first, each with its status: whether
  // they're up is what turning the lines on asks. They stay at the top when
  // a category is on too, rather than giving way to its places (the user,
  // Oct 15: they "disappear" once something else is selected).
  const eruvRows = eruvim && eruvim.length > 0 && (
    <div className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-900/5 bg-white overflow-hidden" data-testid="nearby-eruvim">
      {eruvim.map((e) => (
        <button key={e.id} type="button" onClick={() => onSelectEruv?.(e.id)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50">
          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[e.tone]}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-slate-900">{e.name}</span>
            <span className={`block text-[13.5px] font-semibold ${TONE_WORDS[e.tone]}`}>{e.label}</span>
          </span>
        </button>
      ))}
    </div>
  )

  if (sorted.length === 0 && eruvRows) return eruvRows

  if (sorted.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        No places to show. Turn on a category above.
      </p>
    )
  }

  return (
    // SwipeRowGroup: only one row's actions stay revealed at a time.
    <SwipeRowGroup>
      {eruvRows && <div className="mb-3">{eruvRows}</div>}
      <div className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-900/5 bg-white overflow-hidden">
        {sorted.map((p) => {
          const canViewListing = !!(onSelectPlace || onViewListing) && p.filterId !== HOSPITALS_FILTER_ID
          // Hospitals have no directory entry, so there's nothing to pin either.
          const canPin = p.filterId !== HOSPITALS_FILTER_ID

          return (
            <div key={p.id} {...(onHover ? pointerHover(() => onHover(p.id), () => onHover(null)) : {})}>
            <NearbyRow
              point={p}
              category={byId.get(p.filterId) ?? null}
              place={places.get(p.id) ?? null}
              now={clock === null ? null : new Date(clock)}
              showCategory={mixed}
              canViewListing={canViewListing}
              canPin={canPin}
              onSelect={() => (onSelectPlace ? onSelectPlace(p) : onViewListing!(p.filterId, p.id))}
              onTogglePin={() => toggle({ id: p.id, categoryId: p.filterId })}
            />
            </div>
          )
        })}
      </div>
    </SwipeRowGroup>
  )
}

type RowProps = {
  point: ScoredPoint
  /** Its category, for the facts line; null for a hospital, which has none. */
  category: CategoryConfig | null
  /** Where it is, in the row's words: "Bella Vista". */
  place: string | null
  now: Date | null
  /** Say its category first on the second line (a list of several kinds). */
  showCategory: boolean
  canViewListing: boolean
  canPin: boolean
  onSelect: () => void
  onTogglePin: () => void
}

/** The row's facts, as a category page's row has them, less its distance:
 *  this list says how far from the visitor, at the row's end. */
function rowFacts(p: ScoredPoint, category: CategoryConfig | null, now: Date | null): RowFact[] {
  if (!p.raw || !category) return []
  const item = { ...p.raw, milesFromAddress: undefined, milesFromCenter: undefined }
  return listingRowFacts(item, category, now).filter((f) => !f.ownLine)
}

function NearbyRow({ point: p, category, place, now, showCategory, canViewListing, canPin, onSelect, onTogglePin }: RowProps) {
  // Sharing needs the same real directory entry pinning does — hospitals
  // (canPin false, no `raw`) have neither. listingPath is '' in that case;
  // the hook is still called unconditionally (rules of hooks), it's just
  // never reachable since the Share button isn't rendered for that row.
  const community = useCommunitySlug()
  const listingPath = canPin ? routes.listing(community, p.filterId, p.raw ? listingSlug(p.raw) : p.id) : ''
  const { share, copied } = useShareLink(listingPath, p.name)
  const facts = rowFacts(p, category, now)

  const swipeActions: SwipeAction[] = [
    { id: 'share', label: copied ? 'Copied!' : 'Share', ariaLabel: `Share ${p.name}`, active: copied, onSelect: share },
    {
      id: 'save',
      label: p.pinned ? 'Saved' : 'Save',
      ariaLabel: p.pinned ? `Saved ${p.name}` : `Save ${p.name}`,
      active: !!p.pinned,
      onSelect: onTogglePin,
    },
  ]

  return (
    // Hospitals (canPin false) have no directory entry, so nothing to pin or
    // share, and no swipe at all.
    <SwipeRow
      rowId={p.id}
      actions={swipeActions}
      enabled={canPin}
      className="bg-white"
      contentClassName="relative flex items-stretch gap-2 bg-white px-4 py-3.5 touch-pan-y"
    >
      {/* Name and where, then the facts line: tappable when a directory
          exists. Icon lives inside the button too so the whole left cluster
          is one tap target, Google-Maps-style, not just the text. */}
      <button
        onClick={canViewListing ? onSelect : undefined}
        disabled={!canViewListing}
        className={`flex min-w-0 flex-1 items-center gap-3 text-left ${canViewListing ? 'cursor-pointer group' : 'cursor-default'}`}
      >
        {/* Same SavedBadge the category page's card puts on its own
            avatar (see GenericListingCard). The category's icon, not the
            place's initials as on a category page: down a list of every
            kind of place, it says which kind. 40px, as a category page's. */}
        <span className="relative shrink-0">
          <CategoryIcon
            icon={p.glyph ?? '📍'}
            categoryId={p.filterId}
            iconImageUrl={
              (typeof p.raw?.[PHOTO_FIELD_KEY] === 'string' && (p.raw[PHOTO_FIELD_KEY] as string).trim()
                ? (p.raw[PHOTO_FIELD_KEY] as string)
                : p.glyphSrc) ?? undefined
            }
            color={p.color}
            className="h-10 w-10 text-xl"
            sizePx={40}
          />
          {p.pinned && <SavedBadge />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-semibold ${canViewListing ? 'text-slate-900 group-hover:text-blue-600 transition-colors' : 'text-slate-900'}`} data-testid="nearby-name">
            {p.name}
            {place && <span className="text-[13.5px] font-normal text-slate-500"> · {place}</span>}
          </span>
          {facts.length > 0 ? (
            <span className="block truncate text-[13.5px] text-slate-600" data-testid="nearby-facts">
              {showCategory && p.categoryLabel && (
                <>
                  <span className="font-semibold" style={{ color: p.color }} data-testid="nearby-category">
                    {p.categoryLabel}
                  </span>
                  <span aria-hidden="true" className="px-1 text-slate-400">·</span>
                </>
              )}
              {facts.map((fact, i) => (
                <span key={`${fact.text}:${i}`}>
                  {i > 0 && <span aria-hidden="true" className="px-1 text-slate-400">·</span>}
                  <span className={FACT_TONE[fact.tone]}>{fact.text}</span>
                </span>
              ))}
            </span>
          ) : (
            // Nothing to say about it (a hospital, a place with no hours or
            // badges): what kind of place, and where, as before. Its kind
            // in its pins' colour too in a mixed list, as on a row with
            // facts: grey here, a hotel with no hours read differently
            // from one with them (the user, Oct 16).
            <span className="block truncate text-[13.5px] text-slate-500" data-testid="nearby-facts">
              {showCategory && p.categoryLabel ? (
                <span className="font-semibold" style={{ color: p.color }} data-testid="nearby-category">
                  {p.categoryLabel}
                </span>
              ) : (
                p.categoryLabel
              )}
              {!place && p.address ? ` · ${p.address}` : ''}
            </span>
          )}
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
        {/* No pinned sub-badge here any more — the row's own left avatar
            (see the CategoryIcon/SavedBadge pairing above) already shows
            it, and duplicating it on this second, smaller badge too just
            repeated the same fact twice on one row. */}
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
          style={{ backgroundColor: categoryTint(p.color), color: p.color }}
          aria-hidden="true"
        >
          <CategoryGlyph categoryId={p.filterId} icon={p.glyph ?? '📍'} className="h-4 w-4" />
        </span>
        {p.miles !== null && (
          <span className="text-xs font-semibold tabular-nums" style={{ color: p.color }}>
            {distanceLabel(p.miles)}
          </span>
        )}
      </div>
    </SwipeRow>
  )
}
