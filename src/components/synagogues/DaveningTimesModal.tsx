'use client'

import { useEffect, useState } from 'react'
import type { DirectoryResource } from '@/types'
import {
  type Minyan,
  type MinyanDayKey,
  isMinyanim,
  groupByDay,
  parseTimeToMinutes,
  TEFILLAH_ORDER,
  TEFILLAH_LABELS,
  ALL_MINYAN_DAYS,
} from '@/lib/davening'
import { useZmanAnchors, geoKey, geoOrCommunityDefault, resolveAnchorTime } from '@/lib/useZmanAnchors'
import { useZmanim } from '@/lib/useZmanim'
import { useNow } from '@/lib/useNow'
import { calendarDaysFor } from '@/lib/calendarDays'
import { community } from '@/community.config'
import { directionsUrl, destinationQuery } from '@/lib/googleMapsLinks'
import { roundMiles } from '@/lib/geo'
import { useOptionalLocation } from '@/lib/locationContext'
import DenominationFilter from './DenominationFilter'

const DAY_PILL_LABELS: Record<MinyanDayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  rosh_chodesh: 'Rosh Chodesh',
  holiday: 'Holiday',
}

// Most `time` values are a clock time ("7:30am"), which reads fine bold and
// right-aligned next to the days. Some are relative/freeform text instead
// ("10 minutes before sundown", "Please call to confirm…") — bolding and
// right-aligning a whole sentence produces a ragged, hard-to-read block, so
// those get lighter weight and left-aligned text instead (still right-
// anchored as a block, so it doesn't jump around relative to other rows).
const isClockTime = (time: string) => Number.isFinite(parseTimeToMinutes(time))

// Both a plain clock time and a calculated time share this same FIXED width
// (not just a minimum) so the days label beside it lands at the same x
// position on every row in a section, whether or not that particular row
// happens to be calculated — a calculated row's rule text ("20 min before
// Sunset") is otherwise long enough to widen its column and shove the days
// label further left than on a plain clock-time row. Fixed width means the
// rule text wraps onto its own second (or third) line instead.
const TIME_COL = 'w-16 shrink-0'

// A row anchored to a zman (sunset/candle-lighting/havdalah) with a resolved
// calculated time gets that time in the normal bold/right-aligned clock slot
// (it IS today's real time, just derived) — the official rule text drops into
// the secondary/italic slot beneath it, prefixed "≈" so it never reads as an
// exact, shul-confirmed time.
function TimeValue({ time, calculated }: { time: string; calculated?: string | null }) {
  if (calculated) {
    return (
      <span className={`flex flex-col items-end ${TIME_COL}`}>
        <span className="text-sm font-semibold text-slate-800 text-right">{calculated}</span>
        <span className="text-[11px] text-muted italic text-right leading-snug">≈ {time}</span>
      </span>
    )
  }
  return (
    <span
      className={[
        'text-sm font-semibold text-slate-800',
        isClockTime(time) ? `${TIME_COL} text-right` : 'max-w-[220px] sm:max-w-xs text-left',
      ].join(' ')}
    >
      {time}
    </span>
  )
}

type Props = {
  items: DirectoryResource[]
  isOpen: boolean
  onClose: () => void
  /** Pre-select a denomination when the modal opens (mirrors the parent's filter). */
  initialDenomination?: string
}

function shulsFromItems(items: DirectoryResource[]) {
  return items
    .filter((item) => isMinyanim(item.minyanim) && (item.minyanim as Minyan[]).length > 0)
    .map((item) => ({
      name: item.name,
      denomination: item.denomination as string | undefined,
      driveMinutes: item.driveMinutes as number | null | undefined,
      walkMinutes: item.walkMinutes as number | null | undefined,
      /** Straight-line miles from the visitor's set address (address-anchor
       *  mode) — see ResourceLoader. Distinct from driveMinutes/walkMinutes,
       *  which only exist in hospital-anchor mode. */
      milesFromAddress: item.milesFromAddress as number | undefined,
      address: item.address as string | undefined,
      geo: item.geo,
      minyanim: item.minyanim as Minyan[],
      verifiedPlaceId: item.verifiedPlaceId,
    }))
}

/** Drive + walk chips rendered below the shul name. */
function TravelLine({
  driveMinutes,
  walkMinutes,
}: {
  driveMinutes?: number | null
  walkMinutes?: number | null
}) {
  if (driveMinutes == null && walkMinutes == null) return null
  return (
    <div className="flex items-center gap-2 mt-0.5">
      {driveMinutes != null && (
        <span className="text-xs text-muted">🚗 {driveMinutes} min</span>
      )}
      {walkMinutes != null && (
        <span className="text-xs text-muted">🚶 {walkMinutes} min</span>
      )}
    </div>
  )
}

/** Expandable per-row panel — "how far is it and how do I get there" — shown
 *  when a row is tapped. Prefers straight-line miles from the visitor's set
 *  address; falls back to hospital-anchor drive/walk minutes when that's the
 *  active mode instead. Directions still shows even with no location set at
 *  all — Google Maps can route from the device's own GPS at that point. */
function DistanceDirections({
  name,
  address,
  geo,
  milesFromAddress,
  driveMinutes,
  walkMinutes,
  verifiedPlaceId,
}: {
  name: string
  address?: string
  geo?: { lat: number; lng: number } | null
  milesFromAddress?: number
  driveMinutes?: number | null
  walkMinutes?: number | null
  /** Google place id confirmed by name+address match (see types.ts) — only
   *  present when we've verified it's actually the right place. A shul's name
   *  almost never appears verbatim in its street address, so without a
   *  verified match the destination falls back to address-only rather than
   *  risking Google fuzzy-matching the name to a same-named place elsewhere
   *  (see destinationQuery's own doc). */
  verifiedPlaceId?: string
}) {
  const dest = address
    ? destinationQuery(name, address, { alwaysIncludeName: !!verifiedPlaceId })
    : geo || null
  const hasDistance = milesFromAddress != null || driveMinutes != null || walkMinutes != null
  const location = useOptionalLocation()
  const origin = location?.directionsOrigin ?? null

  return (
    <div className="mt-1.5 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
      {dest && (
        <a
          href={directionsUrl(dest, { origin, placeId: verifiedPlaceId })}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          Directions
        </a>
      )}
      {hasDistance ? (
        <span className="ml-auto text-xs text-slate-600">
          {milesFromAddress != null ? (
            `📍 ${roundMiles(milesFromAddress)} mi away`
          ) : (
            <span className="flex items-center gap-2">
              {driveMinutes != null && <span>🚗 {driveMinutes} min</span>}
              {walkMinutes != null && <span>🚶 {walkMinutes} min</span>}
            </span>
          )}
        </span>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); document.dispatchEvent(new CustomEvent('jpc:open-location')) }}
          className="ml-auto text-xs text-primary hover:underline cursor-pointer"
        >
          Set your location to see distance
        </button>
      )}
    </div>
  )
}

/**
 * Bordered-card modal showing all minyanim from every synagogue, grouped by
 * day (each day's rows further sub-grouped by tefillah with a banner, so
 * shacharis / mincha / maariv never appear inline). Drive + walk time sit
 * under the shul name.
 */
// Persisted across visits, same as the other "prompts you've already
// dismissed" state this site keeps locally (see LiveLocationPrompt) — this
// component fully unmounts on close (`if (!isOpen) return null` below), so
// in-memory state alone wouldn't survive even a single close/reopen, let
// alone a repeat visit. Reading it in the initializer rather than an effect
// is safe here specifically because this component never renders anything
// until a real client-side interaction (opening the modal) has already
// happened — unlike page content, there's no SSR pass of this markup for a
// synchronous localStorage read to mismatch against.
const CALC_DISCLAIMER_DISMISSED_KEY = 'davening-calc-disclaimer-dismissed'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * What the "Today" pill selects: today's weekday, plus whichever pseudo-days
 * the calendar actually says apply — see calendarDays.ts, which owns that
 * judgement and the rule that it never narrows on missing data.
 *
 * This used to include both pseudo-days unconditionally, because nothing
 * evaluated them; it now includes Rosh Chodesh only on Rosh Chodesh and
 * Holiday only on a secular holiday, and still falls back to including Rosh
 * Chodesh whenever Hebcal hasn't answered. Rows that do appear keep their own
 * "Rosh Chodesh" / "Holiday" heading, so what's being claimed stays visible
 * either way.
 */
/** Today is a MODE, not a seeded selection. It has to re-derive, because what
 *  counts as today changes underneath it twice: when Hebcal answers on Rosh
 *  Chodesh (narrowing the fallback), and at midnight on a tab left open. A
 *  selection captured once would go stale on both and, worse, would leave the
 *  pill reading "off" for a filter the visitor never touched. `custom` holds
 *  an explicit list — empty means no day filter, i.e. the full week. */
type DayFilter = { mode: 'today' } | { mode: 'custom'; days: MinyanDayKey[] }

export default function DaveningTimesModal({ items, isOpen, onClose, initialDenomination = '' }: Props) {
  const [selectedDenominations, setSelectedDenominations] = useState<string[]>(initialDenomination ? [initialDenomination] : [])
  const [calcDisclaimerDismissed, setCalcDisclaimerDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem(CALC_DISCLAIMER_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })

  function dismissCalcDisclaimer() {
    setCalcDisclaimerDismissed(true)
    try {
      localStorage.setItem(CALC_DISCLAIMER_DISMISSED_KEY, '1')
    } catch {
      // Storage can throw (private browsing, quota) — dismissal still holds
      // for the rest of this session via the state above, just not future ones.
    }
  }
  // Live clock, so the Today pill still means today on a tab left open across
  // midnight rather than whatever day the modal was first mounted on.
  const now = useNow()

  // Hebrew date + parsha for the header's context line. Keyed to the community
  // centre rather than the visitor's own location: this is a calendar fact,
  // not a zman, so it doesn't vary across a city, and the header shouldn't go
  // blank for someone who never set a location. Passing null while closed
  // keeps it from fetching for a modal nobody has opened.
  const { data: zmanim } = useZmanim(isOpen ? community.mapCenter : null)
  const today = calendarDaysFor(now, zmanim)
  // One joined string rather than nested spans: it reads as a single line, so
  // it should be a single text node — a reader (or a test) shouldn't have to
  // reassemble it across elements.
  const todayContext = [
    WEEKDAY_NAMES[new Date(now).getDay()],
    zmanim?.hebrewDate,
    ...today.labels,
    zmanim?.parsha,
  ]
    .filter(Boolean)
    .join(' · ')

  // Empty = no day filter (show every day). Multiple days can be selected at
  // once; clicking an already-selected chip deselects just that one.
  //
  // Seeded to today rather than empty: someone opening this is overwhelmingly
  // asking "where can I daven now", not reading a week's reference table, and
  // HoursDisplay already sets the precedent of defaulting to today with the
  // full view one tap behind. Seeded in the initializer rather than reset on
  // each open, so the deliberate choice documented below — that the day filter
  // persists across opens while denomination doesn't — still holds.
  const [dayFilter, setDayFilter] = useState<DayFilter>({ mode: 'today' })
  // Which row's "how far / directions" panel is open — accordion-style, one
  // at a time. Keyed by day+tefillah+index since the same shul can appear in
  // more than one row across the modal.
  const [openRowKey, setOpenRowKey] = useState<string | null>(null)

  // Sync denomination each time the modal opens so it mirrors the parent's filter
  // (seeds the multi-select with just that one value — the visitor can add more
  // from there without it getting stomped, since this only fires on open).
  // The textbook fix for "reset state on a prop change" is a `key` on this
  // component instead of this effect, but that would reset `selectedDays`
  // too (currently untouched here, deliberately — day filter persists across
  // opens while denomination doesn't), which is a real behavior change, not
  // just a lint fix.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setSelectedDenominations(initialDenomination ? [initialDenomination] : [])
    else setOpenRowKey(null)
  }, [isOpen, initialDenomination])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Touching any individual day takes the filter off Today and into an
  // explicit list, starting from whatever was on screen — so clicking Mon
  // while Today is active reads as "today, and also Mondays", which is what
  // the highlighted pills then show.
  const toggleDay = (d: MinyanDayKey) => {
    setDayFilter((prev) => {
      const base = prev.mode === 'today' ? today.dayKeys : prev.days
      return { mode: 'custom', days: base.includes(d) ? base.filter((x) => x !== d) : [...base, d] }
    })
  }

  const todayActive = dayFilter.mode === 'today'
  const selectedDays = todayActive ? today.dayKeys : dayFilter.days
  // Toggles like every other pill: on turns the day filter off entirely (empty
  // = every day), which is also the route back to the full reference table now
  // that it isn't the default any more.
  const toggleToday = () => setDayFilter(todayActive ? { mode: 'custom', days: [] } : { mode: 'today' })

  const allShuls = isOpen ? shulsFromItems(items) : []
  const denominations = Array.from(
    new Set(allShuls.map((s) => s.denomination).filter((d): d is string => !!d)),
  ).sort()

  const filtered = selectedDenominations.length
    ? allShuls.filter((s) => s.denomination && selectedDenominations.includes(s.denomination))
    : allShuls
  const byDay = groupByDay(filtered)
  const hasData = filtered.some((s) => s.minyanim.length > 0)

  const visibleByDay = selectedDays.length === 0 ? byDay : byDay.filter((g) => selectedDays.includes(g.day))
  const noDayMatches = hasData && selectedDays.length > 0 && visibleByDay.length === 0

  // Address/geo for the "how far / directions" panel — keyed by shul name,
  // same pattern as shulGeo below (a row only carries tefillah/time fields,
  // not the shul's own address or milesFromAddress).
  const shulInfoByName = new Map(filtered.map((s) => [s.name, s]))
  // Lower = closer. Prefers straight-line miles (address mode); falls back to
  // drive/walk minutes (hospital mode) when that's the active anchor instead.
  // Used only to break ties between rows at the same time — see below.
  const distanceScore = (shulName: string): number => {
    const info = shulInfoByName.get(shulName)
    if (!info) return Infinity
    return info.milesFromAddress ?? info.driveMinutes ?? info.walkMinutes ?? Infinity
  }

  // Only shuls with at least one anchor-based minyan need a location resolved
  // — most shuls are plain clock times and shouldn't trigger a fetch at all.
  const shulGeo = new Map(
    filtered
      .filter((s) => s.minyanim.some((m) => m.anchor))
      .map((s) => [s.name, geoOrCommunityDefault(s.geo)] as const),
  )
  const anchorMap = useZmanAnchors(Array.from(shulGeo.values()))
  const calcFor = (row: { shul: string; anchor?: Minyan['anchor']; offsetMinutes?: number }) => {
    const geo = shulGeo.get(row.shul)
    if (!geo) return null
    return resolveAnchorTime(row, anchorMap[geoKey(geo)])
  }
  const hasCalculatedRows = visibleByDay.some((g) => g.rows.some((r) => calcFor(r)))

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className="flex flex-col w-full max-w-2xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="All davening times"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">All Davening Times</h2>
            {/* What the app believes today is. Pure context, no filtering
                depends on it — but it's the thing that lets a visitor catch
                the app being wrong once the Today pill above starts making
                claims on their behalf. Weekday comes from their own device so
                it's always there; the Hebrew date and parsha are Hebcal's and
                simply don't render if that fetch hasn't landed or failed. */}
            <p className="text-xs text-muted mt-0.5">{todayContext}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-slate-700 transition-colors cursor-pointer p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Controls ────────────────────────────────────────────────────── */}
        {/* relative + z so the denomination dropdown overlays the scrolling list. */}
        <div className="relative z-20 flex items-center gap-2 px-5 py-3 border-b border-slate-100 shrink-0 flex-wrap">
          {denominations.length > 1 && (
            <DenominationFilter
              value={selectedDenominations}
              options={denominations}
              onChange={setSelectedDenominations}
            />
          )}

          {filtered.length > 0 && (
            <span className="text-xs text-muted ml-auto">
              {filtered.length} shul{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ── Day-of-week pills — one horizontally-scrolling row (no wrap) so
            it stays a single line even with Rosh Chodesh/Holiday added; no
            "All" chip — zero selected means "show every day", clicking a
            selected chip again clears just that one, and any number can be
            active at once. ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 pl-5 py-2 border-b border-slate-100 shrink-0 overflow-x-auto">
          <button
            onClick={toggleToday}
            aria-pressed={todayActive}
            className={[
              'shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap',
              todayActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            Today
          </button>
          {/* Hairline between the Today shortcut and the days it's a shortcut
              for — they're the same control, but Today sets a selection while
              the rest toggle within one. */}
          <span aria-hidden className="shrink-0 self-stretch w-px bg-slate-200 mx-0.5" />
          {ALL_MINYAN_DAYS.map((d) => {
            const active = selectedDays.includes(d)
            return (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={[
                  'shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
                  active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                {DAY_PILL_LABELS[d]}
              </button>
            )
          })}
          {/* Trailing spacer, and why the row uses pl-5 rather than px-5: a
              horizontal scroll container's padding-right is dropped once its
              content overflows, so on a phone (where these pills always
              overflow) the last chip ended up flush against the modal edge
              while the first still had its inset — lopsided. An empty flex
              item can't be dropped that way. 14px + the row's 6px gap gives
              back the same 20px as the pl-5 on the other side. */}
          <span aria-hidden className="w-3.5 shrink-0" />
        </div>

        {/* One-time disclaimer, not per-row — only shown when at least one
            visible row is a calculated (not shul-confirmed) time, and only
            until the visitor dismisses it (sticks across visits). */}
        {hasCalculatedRows && !calcDisclaimerDismissed && (
          <div className="flex items-center gap-2 pl-5 pr-3 py-1.5 bg-slate-50 border-b border-slate-100 shrink-0">
            <p className="flex-1 text-[11px] text-muted">
              Times marked ≈ are calculated from today&apos;s sunset/candle-lighting and may not exactly match the shul&apos;s posted time.
            </p>
            <button
              type="button"
              onClick={dismissCalcDisclaimer}
              aria-label="Dismiss"
              className="shrink-0 text-[11px] text-muted hover:text-slate-700 cursor-pointer leading-none p-0.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Content — grouped by day, each day sub-grouped by tefillah ──── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!hasData ? (
            <p className="text-sm text-muted text-center py-16">No structured davening data available yet.</p>
          ) : noDayMatches ? (
            <p className="text-sm text-muted text-center py-16">
              No davening times on {selectedDays.map((d) => DAY_PILL_LABELS[d]).join(', ')}.
            </p>
          ) : (
            <div className="space-y-6">
              {visibleByDay.map((group) => (
                <section key={group.day}>
                  {/* Day header — deliberately louder than the tefillah
                      sub-banners below it (bigger, bolder, darker, thicker
                      rule) so the day reads as the primary heading and
                      tefillah as the secondary one, matching their roles. */}
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-3 pb-1.5 border-b-2 border-slate-200">
                    {group.label}
                  </h3>

                  {/* Sub-group each day's rows by tefillah */}
                  <div className="space-y-3">
                    {TEFILLAH_ORDER
                      .map((t) => ({
                        tefillah: t,
                        label: TEFILLAH_LABELS[t],
                        // Same time (or both non-clock, e.g. two "call to
                        // confirm" rows) → closer shul first.
                        rows: group.rows
                          .filter((r) => r.tefillah === t)
                          .sort((a, b) =>
                            parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time) ||
                            distanceScore(a.shul) - distanceScore(b.shul),
                          ),
                      }))
                      .filter((sub) => sub.rows.length > 0)
                      .map((sub) => (
                        <div key={sub.tefillah}>
                          {/* Tefillah sub-banner — label centered, rule on both sides */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="flex-1 border-b border-slate-100" />
                            <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">
                              {sub.label}
                            </span>
                            <div className="flex-1 border-b border-slate-100" />
                          </div>

                          {/* Rows — no tefillah label needed on each row. Each
                              row is a button: tap to reveal distance +
                              directions, so "how far / how do I get there"
                              isn't cluttering every row by default. */}
                          <div className="divide-y divide-slate-50">
                            {sub.rows.map((row, i) => {
                              const rowKey = `${group.day}|${sub.tefillah}|${i}`
                              const rowOpen = openRowKey === rowKey
                              const info = shulInfoByName.get(row.shul)
                              return (
                              <div key={i} className="py-1.5 first:pt-0">
                                <button
                                  type="button"
                                  onClick={() => setOpenRowKey((k) => (k === rowKey ? null : rowKey))}
                                  aria-expanded={rowOpen}
                                  className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-1 text-left cursor-pointer"
                                >
                                  {/* Left: name, then denomination, then notes — each
                                      on its own line rather than crammed inline. */}
                                  <div className="min-w-0 flex-1">
                                    <span className="font-medium text-sm text-slate-900">{row.shul}</span>
                                    {row.denomination && (
                                      <p className="text-xs text-muted">{row.denomination}</p>
                                    )}
                                    {row.notes && (
                                      <p className="text-xs text-slate-500 italic">{row.notes}</p>
                                    )}
                                    <TravelLine driveMinutes={row.driveMinutes} walkMinutes={row.walkMinutes} />
                                  </div>
                                  {/* Right: time, then a chevron hinting the row expands.
                                      No nowrap/shrink-0 on the wrapper — `time` sometimes
                                      carries a long freeform note instead of a short time
                                      (see TimeValue). */}
                                  <div className="ml-auto flex max-w-full items-center gap-1.5">
                                    <TimeValue time={row.time} calculated={calcFor(row)} />
                                    <svg
                                      className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${rowOpen ? 'rotate-180' : ''}`}
                                      fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </button>

                                {rowOpen && (
                                  <DistanceDirections
                                    name={row.shul}
                                    address={info?.address}
                                    geo={info?.geo}
                                    milesFromAddress={info?.milesFromAddress}
                                    driveMinutes={row.driveMinutes}
                                    walkMinutes={row.walkMinutes}
                                    verifiedPlaceId={info?.verifiedPlaceId}
                                  />
                                )}
                              </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
