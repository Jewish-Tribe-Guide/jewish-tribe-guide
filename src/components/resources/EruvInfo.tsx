'use client'

import { useEffect, useState } from 'react'
import type { ParamsOpts } from './GenericDirectory'
import { ListingBar } from './ListingColumn'
import { mapQueryString, routes } from '@/lib/routes'
import type { EruvRecord } from '@/types'
import DirectoryHeader from './DirectoryHeader'
import { CategoryBandFrame, CategoryBandBadge } from './CategoryBandFrame'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { ChevronRightIcon, ExternalIcon } from '@/components/icons'
import { community } from '@/community.config'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'
import { useCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { eruvView, localParts, type Eruv } from '@/lib/eruv'
import MobileSheet from './MobileSheet'
import ListHeading from './ListHeading'
import { useWide } from './CategoryMap'
import { useListMapSplit } from './useListMapSplit'
import { useSharedPreference } from '@/lib/useSharedPreference'
import { EruvListing, EruvStatusLine } from './EruvListing'
import EruvMap from './EruvMap'
import { useOptionalLocation } from '@/lib/locationContext'
import { useEruvMaps } from '@/lib/useEruvStatuses'

// ── The Eruv page (Oct 7, canvas page "eruv") ───────────────────────────────
// The eruvim's own maps, as each eruv draws them, with the visitor's dot;
// then each eruv, whether it's up, and when the guide checked: nothing
// else on the page. A row, or an eruv on the map, opens its listing (where
// it goes, its site, hotline, alerts) as any listing opens (Oct 13): on
// desktop in the list's column, ‹ Back and ‹ 2 of 5 › over it, the map
// beside it come to that eruv; on a phone in a sheet, the map above it on
// that eruv. The address names it (?item=), so Back closes it and a link
// opens it. Each eruv's name is on the map; on
// desktop, pointing at a row picks out its eruv on the map, and pointing
// at an eruv picks out its row. The guide doesn't say whether someone is
// inside an eruv (Oct 12): they see their dot on the eruv's own map. The
// statuses come from /api/eruv, which reads each eruv's own page, and the
// maps from /api/eruv/maps; until migration 074 is run there are none,
// and the page shows the old list with its links.

type Props = {
  /** The old list, shown until the eruv table exists. */
  eruvim: EruvRecord[]
  onUp: () => void
  /** The category's own (admin-editable) name — falls back to the historical
   *  copy while categories are still loading. */
  title?: string
  /** This pseudo-category's own icon/color/photo — see CategoryConfig. Falls
   *  back to a neutral slate (matching getCategoryColor's own fallback) and
   *  no icon while categories are still loading, same as `title` above. */
  icon?: string
  color?: string
  bandImageUrl?: string | null
  /** `?item=`: the eruv open. */
  itemId?: string | null
  onParamsChange?: (changes: Record<string, string | null>, opts?: ParamsOpts) => void
}

const ERUV_STEP = 'eruv'

type Loaded = { available: false } | { available: true; timezone: string; candles: number | null; eruvim: Eruv[] }

function OldCard({ eruv }: { eruv: EruvRecord }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{eruv.name}</h2>
      <p className="text-xs text-muted mb-2">{eruv.area}</p>
      <p className="text-sm text-slate-700">{eruv.notes}</p>

      <a
        href={eruv.statusLink}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
      >
        Check status &amp; boundary map
        <ExternalIcon />
      </a>
    </div>
  )
}

export default function EruvInfo({ eruvim, onUp, title = 'Eruv Information', icon, color = '#64748b', bandImageUrl, itemId = null, onParamsChange }: Props) {
  // Puts "‹ {title}" in SiteHeader on mobile — see GenericDirectory's
  // identical call, which this mirrors now that this screen has the same gap
  // it used to (its own mobile UpButton, no header title).
  useSetScreenHeader(true, title, onUp)
  const isMobile = useIsMobile()
  const slug = useCommunitySlug()
  const clock = useNow()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [pointedId, setPointedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(itemId)
  // Its Suggest an edit open: the editor's own ‹ is the way back, so the
  // column's bar goes, as a listing's does (ListingColumn).
  const [editing, setEditing] = useState(false)
  // The address is the open eruv: a link to one, Back, Forward (which
  // write to the address before this hears of it).
  const [seenItemId, setSeenItemId] = useState(itemId)
  if (itemId !== seenItemId) {
    setSeenItemId(itemId)
    setOpenId(itemId)
  }
  // Back and Forward over a step this page pushed: Next doesn't always hand
  // the address back as a new ?item=, so it's read here (as GenericDirectory
  // does).
  // Only where the address carries it: the admin's preview has none, and
  // Back out of an eruv's edit there would read as no eruv open.
  const addressed = !!onParamsChange
  useEffect(() => {
    if (!addressed) return
    const onPop = () => setOpenId(new URLSearchParams(window.location.search).get('item'))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [addressed])

  useEffect(() => {
    let live = true
    fetch(`/api/eruv?community=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((body) => {
        if (!live) return
        setLoaded(body?.ok && body.available ? { available: true, timezone: body.timezone, candles: body.candles ?? null, eruvim: body.eruvim } : { available: false })
      })
      .catch(() => live && setLoaded({ available: false }))
    return () => {
      live = false
    }
  }, [slug])

  const banner = !isMobile && icon ? (
    <CategoryBandBadge color={color}>
      <CategoryGlyph categoryId={undefined} icon={icon} className="h-[55%] w-[55%]" />
    </CategoryBandBadge>
  ) : null

  const now = clock === null ? null : new Date(clock)
  const ready = loaded?.available && now ? loaded : null
  const open = ready?.eruvim.find((e) => e.id === openId) ?? null
  const shabbosSide = ready && now ? [5, 6].includes(localParts(now, ready.timezone).weekday) : false
  const openIndex = ready && open ? ready.eruvim.indexOf(open) : -1

  // Opened from the list: a step Back undoes, on a computer, as a listing's
  // is (GenericDirectory). Another one in its place, or on a phone, replaces.
  const openEruv = (id: string) => {
    const stepping = !isMobile && !openId
    setOpenId(id)
    onParamsChange?.({ item: id }, stepping ? { step: ERUV_STEP } : { replace: true })
  }
  const closeEruv = () => {
    if ((window.history.state as { step?: string } | null)?.step === ERUV_STEP) {
      window.history.back()
      return
    }
    setOpenId(null)
    onParamsChange?.({ item: null }, { replace: true })
  }
  const stepEruv = (direction: 1 | -1) => {
    const next = ready?.eruvim[openIndex + direction]
    if (next) openEruv(next.id)
  }
  // Escape goes back, and ← → step, as on any opened listing; never from
  // inside a text field.
  const column = !isMobile && !!open
  useEffect(() => {
    if (!column) return
    const onKey = (e: KeyboardEvent) => {
      // While editing, Escape steps back out of the edit; the arrows are
      // the form's.
      if ((window.history.state as { mapSheetForm?: string } | null)?.mapSheetForm) {
        if (e.key === 'Escape') window.history.back()
        return
      }
      const target = e.target as HTMLElement | null
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return
      if (e.key === 'Escape') closeEruv()
      else if (e.key === 'ArrowLeft') stepEruv(-1)
      else if (e.key === 'ArrowRight') stepEruv(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The visitor's dot, on the eruvim's own maps.
  const you = useOptionalLocation()?.coords ?? null
  const maps = useEruvMaps(slug, !!loaded?.available)
  // Desktop only: a phone has nothing to point with.
  const pointAt = (id: string) => (isMobile ? {} : { onMouseEnter: () => setPointedId(id), onMouseLeave: () => setPointedId(null), onFocus: () => setPointedId(id), onBlur: () => setPointedId(null) })
  // Beside the list where it's wide enough and not hidden, as on every
  // category page (the same remembered Hide map).
  const wide = useWide()
  const [mapHidden, storeMapHidden] = useSharedPreference('jpc:map-hidden', (raw) => raw === '1')
  const setMapHidden = (hidden: boolean) => storeMapHidden(hidden ? '1' : null)
  const { gridRef: splitRef, gridStyle: splitStyle, handleProps: splitHandle } = useListMapSplit({ onHideMap: () => setMapHidden(true) })
  const mapped = ready && now && maps ? ready.eruvim.flatMap((e) => (maps.get(e.id) ? [{ id: e.id, name: e.name, tone: eruvView(e, now, ready.timezone, ready.candles).tone, map: maps.get(e.id)! }] : [])) : []
  const mapBeside = wide && !mapHidden && mapped.length > 0
  // The Map tab with the eruv lines on, the open one open there too.
  const fullMapHref = `${routes.map(slug)}${mapQueryString({ eruvim: true, place: open ? `eruv:${open.id}` : null })}`
  const eruvMap = (className: string, onHide?: () => void) => (
    <EruvMap
      eruvim={mapped}
      you={you}
      fallbackCenter={community.mapCenter}
      onSelect={openEruv}
      highlightId={open?.id ?? pointedId}
      onHover={isMobile ? undefined : setPointedId}
      focusId={open?.id ?? null}
      fullMapHref={fullMapHref}
      onHide={onHide}
      className={className}
    />
  )

  return (
    <CategoryBandFrame color={color} imageUrl={bandImageUrl}>
      <DirectoryHeader title={title} titleInHeader banner={banner} />

      {loaded && !loaded.available && (
        <>
          <p className="mb-4 text-sm text-muted">Check the current status of the {community.region}-area eruvim before Shabbos.</p>
          <div className="space-y-3">
            {eruvim.map((eruv) => (
              <OldCard key={eruv.id} eruv={eruv} />
            ))}
          </div>
        </>
      )}

      {!loaded && <p className="text-sm text-muted" role="status">Checking each eruv…</p>}

      {ready && now && (
        // A category page's list and map (GenericDirectory): the map beside
        // the list from a wide screen up, the line between them dragged to
        // share the width, Hide map and Show map remembered with every
        // category's. Narrower, the map above the list: the lines are what
        // people come here for.
        <div ref={splitRef} className={mapBeside ? 'group/split lg:grid lg:items-start' : undefined} style={mapBeside ? splitStyle : undefined}>
          <div className="min-w-0 space-y-3.5">
            {!mapBeside && !(wide && mapHidden) && mapped.length > 0 && eruvMap('h-[300px]')}
            {column && open && (
              <section aria-label={open.name} data-testid="eruv-column">
                {!editing && (
                  <ListingBar
                    backLabel={title}
                    onBack={closeEruv}
                    position={{ index: openIndex, total: ready.eruvim.length }}
                    onStep={stepEruv}
                    onShowMap={wide && mapHidden ? () => setMapHidden(false) : undefined}
                  />
                )}
                <EruvListing eruv={open} color={color} now={now} timezone={ready.timezone} candles={ready.candles} onEditingChange={setEditing} />
              </section>
            )}
            {ready.eruvim.length > 0 && (
              // Kept while one is open, hidden, as a category's list is.
              <div hidden={column} data-testid="eruv-list">
                <ListHeading
                  label={shabbosSide ? 'This Shabbos' : undefined}
                  noun
                  count={ready.eruvim.length}
                  total={ready.eruvim.length}
                  units={['eruv', 'eruvim']}
                  onShowMap={wide && mapHidden && mapped.length > 0 ? () => setMapHidden(false) : undefined}
                />
                {/* One box, the eruvim as its rows: here the map and
                    whether each is up are the point, not the listings. */}
                <ul className="rounded-2xl border border-slate-200 bg-white px-2 py-1">
                  {ready.eruvim.map((eruv) => (
                    <li key={eruv.id} className="border-t border-slate-100 first:border-t-0">
                      <button
                        type="button"
                        onClick={() => openEruv(eruv.id)}
                        {...pointAt(eruv.id)}
                        className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 ${pointedId === eruv.id ? 'bg-slate-50' : ''}`}
                        data-pointed={pointedId === eruv.id || undefined}
                        data-testid="eruv-row"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15.5px] font-bold text-slate-900">{eruv.name}</span>
                          <EruvStatusLine eruv={eruv} now={now} timezone={ready.timezone} candles={ready.candles} />
                        </span>
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {/* The line between list and map: drag it to share the width
              differently, double-click it for half and half. */}
          {mapBeside && (
            <div
              {...splitHandle}
              className="group hidden cursor-col-resize touch-none items-center justify-center outline-none lg:sticky lg:top-[4.5rem] lg:flex lg:h-[min(calc(100vh-6rem),720px)]"
            >
              <span className="h-12 w-1.5 rounded-full bg-slate-300 transition-colors group-hover:bg-slate-500 group-focus-visible:bg-primary group-focus-visible:ring-2 group-focus-visible:ring-primary/40" />
            </div>
          )}
          {mapBeside && (
            <div className="relative hidden lg:sticky lg:top-[4.5rem] lg:block lg:h-[min(calc(100vh-6rem),720px)]">
              <div className="h-full transition-opacity group-data-[snap=map]/split:opacity-30">{eruvMap('h-full', () => setMapHidden(true))}</div>
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden items-center justify-center group-data-[snap=map]/split:flex">
                <span className="rounded-full bg-slate-900/85 px-4 py-2 text-[14px] font-semibold text-white shadow-lg">Let go to hide the map</span>
              </div>
            </div>
          )}
        </div>
      )}

      {ready && now && open && isMobile && (
        <MobileSheet isOpen onClose={closeEruv} title={open.name} titleHidden draggable>
          <EruvListing eruv={open} color={color} now={now} timezone={ready.timezone} candles={ready.candles} />
        </MobileSheet>
      )}
    </CategoryBandFrame>
  )
}
