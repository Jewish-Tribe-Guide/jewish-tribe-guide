'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { GlobeIcon, MailIcon, PencilIcon, PhoneIcon } from '@/components/icons'
import { dialable, eruvView, type Eruv, type EruvTone } from '@/lib/eruv'
import { initialsOf } from '@/lib/listingRow'
import CategoryIcon from '@/components/CategoryIcon'
import { Card } from './listingParts'

// ── One eruv's listing (Oct 7; its own file Oct 13) ─────────────────────────
// Shown by the Eruv page (EruvInfo) and the Map tab's Eruvim layer
// (MapEruvDetail). Its own file so the Map page, which the desktop home
// prefetches, carries the listing and not the whole Eruv page
// (budgets.spec counts it).

// Loaded on the first tap of "Suggest an edit", for the same reason.
const EruvSuggestEdit = dynamic(() => import('./EruvSuggestEdit'))

const DOT: Record<EruvTone, string> = { green: 'bg-green-700', amber: 'bg-amber-700', red: 'bg-red-700', grey: 'bg-slate-500' }
const WORDS: Record<EruvTone, string> = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700', grey: 'text-slate-700' }

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
