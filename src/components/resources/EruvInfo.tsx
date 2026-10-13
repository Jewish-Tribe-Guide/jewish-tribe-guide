'use client'

import { useEffect, useState } from 'react'
import type { ParamsOpts } from './GenericDirectory'
import { ListingBar } from './ListingColumn'
import { mapQueryString, routes } from '@/lib/routes'
import type { EruvRecord } from '@/types'
import DirectoryHeader from './DirectoryHeader'
import { CategoryBandFrame, CategoryBandBadge } from './CategoryBandFrame'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { ChevronRightIcon, ExternalIcon, GlobeIcon, MailIcon, PencilIcon, PhoneIcon } from '@/components/icons'
import { community } from '@/community.config'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'
import { useCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { dialable, eruvView, localParts, type Eruv, type EruvTone } from '@/lib/eruv'
import { initialsOf } from '@/lib/listingRow'
import CategoryIcon from '@/components/CategoryIcon'
import MobileSheet from './MobileSheet'
import { Card } from './listingParts'
import EruvMap from './EruvMap'
import EruvSuggestEdit from './EruvSuggestEdit'
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

const DOT: Record<EruvTone, string> = { green: 'bg-green-700', amber: 'bg-amber-700', red: 'bg-red-700', grey: 'bg-slate-500' }
const WORDS: Record<EruvTone, string> = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700', grey: 'text-slate-700' }

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

/** "● Up for this Shabbos", and under it when the guide checked. */
export function EruvStatusLine({ eruv, now, timezone, candles }: { eruv: Eruv; now: Date; timezone: string; candles: number | null }) {
  const view = eruvView(eruv, now, timezone, candles)
  return (
    <div data-testid="eruv-status" data-tone={view.tone}>
      <p className="mt-1 flex items-baseline gap-2">
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[view.tone]}`} />
        <span className={`text-[15px] font-extrabold ${WORDS[view.tone]}`}>{view.label}</span>
      </p>
      {view.checked && <p className="mt-0.5 text-[13px] leading-snug text-muted">{view.checked}</p>}
    </div>
  )
}

function ListingRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t border-slate-100 py-2.5 text-[15px] leading-snug text-slate-800 first:border-t-0">
      <span className="mt-0.5 w-[17px] shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const linkClass = 'font-semibold text-primary hover:underline'
const siteLabel = (url: string) => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')

/** One eruv's listing: its status, where it goes, and the eruv's own
 *  site, hotline and alerts; under it, "Suggest an edit" (Oct 13), which
 *  turns the listing into its rows to fix and send (EruvSuggestEdit). */
export function EruvListing(props: { eruv: Eruv; color: string; now: Date; timezone: string; candles: number | null }) {
  const [editing, setEditing] = useState(false)
  // Another eruv opened in its place starts as its listing.
  const [shownId, setShownId] = useState(props.eruv.id)
  if (shownId !== props.eruv.id) {
    setShownId(props.eruv.id)
    setEditing(false)
  }
  if (editing) return <EruvSuggestEdit eruv={props.eruv} onClose={() => setEditing(false)} />
  return (
    <div className="space-y-3.5">
      <EruvDetails {...props} />
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg transition-transform active:scale-[0.98]"
      >
        <PencilIcon className="h-4 w-4 shrink-0" />
        Suggest an edit
      </button>
    </div>
  )
}

function EruvDetails({ eruv, color, now, timezone, candles }: { eruv: Eruv; color: string; now: Date; timezone: string; candles: number | null }) {
  const contact = [
    eruv.website && (
      <ListingRow key="web" icon={<GlobeIcon className="h-[17px] w-[17px]" />}>
        <a href={eruv.website} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {siteLabel(eruv.website)}
        </a>
      </ListingRow>
    ),
    eruv.hotline && (
      <ListingRow key="call" icon={<PhoneIcon className="h-[17px] w-[17px]" />}>
        <a href={`tel:${dialable(eruv.hotline)}`} className={linkClass}>
          {eruv.hotline}
        </a>
      </ListingRow>
    ),
    eruv.alertsUrl && (
      <ListingRow key="alerts" icon={<MailIcon className="h-[17px] w-[17px]" />}>
        <a href={eruv.alertsUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Email alerts from the eruv
        </a>
      </ListingRow>
    ),
  ].filter(Boolean)
  return (
    <div className="space-y-3.5" data-testid="eruv-listing">
      <div className="flex items-start gap-3.5">
        <CategoryIcon icon="" initials={initialsOf(eruv.name)} shape="square" color={color} className="h-16 w-16 shrink-0 text-2xl" sizePx={64} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">{eruv.name}</h2>
          <p className="mt-1 text-[14.5px] leading-snug text-muted">Eruv</p>
        </div>
      </div>
      <Card>
        <div className="py-2">
          <EruvStatusLine eruv={eruv} now={now} timezone={timezone} candles={candles} />
        </div>
      </Card>
      {eruv.covers && (
        <Card title="Where it goes">
          <p className="pb-1 text-[15px] leading-relaxed text-slate-800">{eruv.covers}</p>
        </Card>
      )}
      {contact.length > 0 && <Card>{contact}</Card>}
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
