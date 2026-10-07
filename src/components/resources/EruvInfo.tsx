'use client'

import { useEffect, useMemo, useState } from 'react'
import type { EruvRecord } from '@/types'
import DirectoryHeader from './DirectoryHeader'
import { CategoryBandFrame, CategoryBandBadge } from './CategoryBandFrame'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { ChevronRightIcon, ExternalIcon, GlobeIcon, MailIcon, PhoneIcon } from '@/components/icons'
import { community } from '@/community.config'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'
import { useCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { dialable, eruvView, localParts, type Eruv, type EruvTone } from '@/lib/eruv'
import { initialsOf } from '@/lib/listingRow'
import CategoryIcon from '@/components/CategoryIcon'
import MobileSheet from './MobileSheet'
import ActionDialog from './ActionDialog'
import { Card } from './listingParts'
import EruvMap from './EruvMap'
import { locator, type Where } from '@/lib/eruvShape'
import { useOptionalLocation } from '@/lib/locationContext'
import { CrosshairIcon } from '@/components/icons'

// ── The Eruv page (Oct 7, canvas page "eruv") ───────────────────────────────
// The eruvim's own lines on a map with the visitor's dot; whether they're
// inside one ("Where you are"); then each eruv, whether it's up, and when
// the guide checked: nothing else on the page. A row, the card, or an eruv
// on the map opens its listing (where it goes, its site, hotline, alerts).
// "Inside" only well clear of the line (eruvShape.ts): closer, "at the
// edge". Outside every mapped eruv, the card isn't shown: an eruv with no
// line on the map could still be there. The statuses come from /api/eruv, which reads each
// eruv's own page; until migration 074 is run there are none, and the page
// shows the old list with its links.

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
}

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
 *  site, hotline and alerts. */
function WhereLine({ where }: { where: Where }) {
  if (where === 'outside') return null
  return (
    <div className="mt-2 flex items-start gap-3 border-t border-slate-100 pt-2.5 text-[15px] leading-snug" data-testid="eruv-where">
      <CrosshairIcon className="mt-0.5 h-[17px] w-[17px] shrink-0 text-slate-400" />
      {where === 'inside' ? (
        <p className="font-bold text-slate-900">You’re inside it</p>
      ) : (
        <div>
          <p className="font-bold text-amber-700">You’re at its edge</p>
          <p className="mt-0.5 text-[13px] text-muted">Too close to the line to tell which side you’re on.</p>
        </div>
      )}
    </div>
  )
}

export function EruvListing({ eruv, color, now, timezone, candles, where = 'outside' }: { eruv: Eruv; color: string; now: Date; timezone: string; candles: number | null; where?: Where }) {
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
          <WhereLine where={where} />
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

export default function EruvInfo({ eruvim, onUp, title = 'Eruv Information', icon, color = '#64748b', bandImageUrl }: Props) {
  // Puts "‹ {title}" in SiteHeader on mobile — see GenericDirectory's
  // identical call, which this mirrors now that this screen has the same gap
  // it used to (its own mobile UpButton, no header title).
  useSetScreenHeader(true, title, onUp)
  const isMobile = useIsMobile()
  const slug = useCommunitySlug()
  const clock = useNow()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

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

  // Where the visitor is, against each eruv with a line on the map.
  const location = useOptionalLocation()
  const you = location?.coords ?? null
  const accuracy = location?.accuracyM ?? null
  const locators = useMemo(() => new Map((loaded?.available ? loaded.eruvim : []).filter((e) => e.line?.lines.length).map((e) => [e.id, locator(e.line!)])), [loaded])
  const whereIn = (id: string): Where => (you && locators.get(id) ? locators.get(id)!([you.lat, you.lng], accuracy) : 'outside')
  const yours = ready ? (ready.eruvim.find((e) => whereIn(e.id) === 'inside') ?? ready.eruvim.find((e) => whereIn(e.id) === 'edge') ?? null) : null
  const others = ready ? ready.eruvim.filter((e) => e.id !== yours?.id) : []
  const mapped = ready && now ? ready.eruvim.filter((e) => e.line?.lines.length).map((e) => ({ id: e.id, name: e.name, tone: eruvView(e, now, ready.timezone, ready.candles).tone, line: e.line! })) : []

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
            {isMobile && mapped.length > 0 && <EruvMap eruvim={mapped} you={you} focusId={yours?.id ?? null} fallbackCenter={community.mapCenter} onSelect={setOpenId} className="h-[300px]" />}
            {yours && (
              <button type="button" onClick={() => setOpenId(yours.id)} className="flex w-full cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left" data-testid="eruv-yours">
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-extrabold tracking-[0.06em] text-muted">WHERE YOU ARE</span>
                  <span className="mt-0.5 block text-lg font-extrabold text-slate-900">{whereIn(yours.id) === 'inside' ? `Inside the ${yours.name}` : `At the edge of the ${yours.name}`}</span>
                  {whereIn(yours.id) === 'edge' && <span className="mt-0.5 block text-[14px] text-slate-700">Too close to the line to tell which side you’re on.</span>}
                  <EruvStatusLine eruv={yours} now={now} timezone={ready.timezone} candles={ready.candles} />
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            )}
            {others.length > 0 && (
              <Card title={yours ? 'The other eruvim' : shabbosSide ? 'This Shabbos' : 'Eruvim'} testId="eruv-list">
                {others.map((eruv) => (
                  <button
                    key={eruv.id}
                    type="button"
                    onClick={() => setOpenId(eruv.id)}
                    className="flex w-full cursor-pointer items-center gap-2 border-t border-slate-100 py-3 text-left first:border-t-0"
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
            )}
          </div>
          {!isMobile && mapped.length > 0 && <EruvMap eruvim={mapped} you={you} focusId={yours?.id ?? null} fallbackCenter={community.mapCenter} onSelect={setOpenId} className="sticky top-4 h-[640px]" />}
        </div>
      )}

      {ready && now && open && (isMobile ? (
        <MobileSheet isOpen onClose={() => setOpenId(null)} title={open.name} titleHidden draggable>
          <EruvListing eruv={open} color={color} now={now} timezone={ready.timezone} candles={ready.candles} where={whereIn(open.id)} />
        </MobileSheet>
      ) : (
        <ActionDialog isOpen onClose={() => setOpenId(null)} title={open.name}>
          <EruvListing eruv={open} color={color} now={now} timezone={ready.timezone} candles={ready.candles} where={whereIn(open.id)} />
        </ActionDialog>
      ))}
    </CategoryBandFrame>
  )
}
