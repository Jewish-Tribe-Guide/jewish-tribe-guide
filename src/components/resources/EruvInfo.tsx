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
import { Card } from './listingParts'
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
  useEffect(() => {
    const onPop = () => setOpenId(new URLSearchParams(window.location.search).get('item'))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

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
  const mapped = ready && now && maps ? ready.eruvim.flatMap((e) => (maps.get(e.id) ? [{ id: e.id, name: e.name, tone: eruvView(e, now, ready.timezone, ready.candles).tone, map: maps.get(e.id)! }] : [])) : []
  // The Map tab on the eruvim alone, the open one open there too.
  const fullMapHref = `${routes.map(slug)}${mapQueryString({ eruvim: 'all', place: open ? `eruv:${open.id}` : null })}`
  const eruvMap = (className: string) => (
    <EruvMap
      eruvim={mapped}
      you={you}
      fallbackCenter={community.mapCenter}
      onSelect={openEruv}
      highlightId={open?.id ?? pointedId}
      onHover={isMobile ? undefined : setPointedId}
      focusId={open?.id ?? null}
      fullMapHref={fullMapHref}
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
        <div className="md:grid md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:items-start md:gap-7">
          <div className="space-y-3.5">
            {isMobile && mapped.length > 0 && eruvMap('h-[300px]')}
            {column && open && (
              <section aria-label={open.name} data-testid="eruv-column">
                <ListingBar backLabel={title} onBack={closeEruv} position={{ index: openIndex, total: ready.eruvim.length }} onStep={stepEruv} />
                <EruvListing eruv={open} color={color} now={now} timezone={ready.timezone} candles={ready.candles} />
              </section>
            )}
            {ready.eruvim.length > 0 && (
              // Kept while one is open, hidden, as a category's list is.
              <div hidden={column}>
                <Card title={shabbosSide ? 'This Shabbos' : 'Eruvim'} testId="eruv-list">
                  {ready.eruvim.map((eruv) => (
                    <button
                      key={eruv.id}
                      type="button"
                      onClick={() => openEruv(eruv.id)}
                      {...pointAt(eruv.id)}
                      className={`-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-2 rounded-lg border-t border-slate-100 px-2 py-3 text-left first:border-t-0 ${pointedId === eruv.id ? 'bg-slate-50' : ''}`}
                      data-pointed={pointedId === eruv.id || undefined}
                      data-testid="eruv-row"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] font-bold text-slate-900">{eruv.name}</span>
                        <EruvStatusLine eruv={eruv} now={now} timezone={ready.timezone} candles={ready.candles} />
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </Card>
              </div>
            )}
          </div>
          {!isMobile && mapped.length > 0 && eruvMap('sticky top-4 h-[640px]')}
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
