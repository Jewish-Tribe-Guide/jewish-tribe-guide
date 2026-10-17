'use client'

import { useEffect, useState } from 'react'
import type { HostedEditor } from './ListingEditor'
import dynamic from 'next/dynamic'
import { GlobeIcon, MailIcon, PencilIcon, PhoneIcon } from '@/components/icons'
import { dialable, eruvView, type Eruv } from '@/lib/eruv'
import { TONE_DOT, TONE_WORDS } from '@/lib/eruvTone'
import { initialsOf } from '@/lib/listingRow'
import CategoryIcon from '@/components/CategoryIcon'
import SaveButton from '@/components/SaveButton'
import SavedBadge from '@/components/SavedBadge'
import { usePinned } from '@/lib/pinnedContext'
import { useCategories } from '@/lib/useCategories'
import { ui } from '@/lib/uiConfig'
import BackIconButton from '@/components/BackIconButton'
import { Card } from './listingParts'

// ── One eruv's listing (Oct 7; its own file Oct 13) ─────────────────────────
// Shown by the Eruv page (EruvInfo) and the Map tab's Eruvim layer
// (MapEruvDetail). Its own file so the Map page, which the desktop home
// prefetches, carries the listing and not the whole Eruv page
// (budgets.spec counts it).

// Loaded on the first tap of "Suggest an edit", for the same reason.
const EruvEditor = dynamic(() => import('./EruvEditor'), { loading: () => null })

/** "● Up for this Shabbos", and under it when the guide checked. */
export function EruvStatusLine({ eruv, now, timezone, candles }: { eruv: Eruv; now: Date; timezone: string; candles: number | null }) {
  const view = eruvView(eruv, now, timezone, candles)
  return (
    <div data-testid="eruv-status" data-tone={view.tone}>
      <p className="mt-1 flex items-baseline gap-2">
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[view.tone]}`} />
        <span className={`text-[15px] font-extrabold ${TONE_WORDS[view.tone]}`}>{view.label}</span>
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
 *  site, hotline and alerts; Save beside its name (Oct 15), as on any
 *  listing, so You and Today say whether it's up; under it, "Suggest an edit" (Oct 13), which
 *  turns the listing into its edit form (EruvEditor), hosted
 *  as MapPlaceDetail hosts a listing's: a ‹ and "Suggest an edit" over it,
 *  and its own step in the history, so Back (and a phone's back swipe)
 *  returns to the listing. On the desktop map (onEditor) the ‹ is the
 *  sidebar's: the ← in its search box, which steps back the same way. */
export function EruvListing(props: {
  eruv: Eruv
  color: string
  now: Date
  timezone: string
  candles: number | null
  onEditingChange?: (editing: boolean) => void
  onEditor?: (editor: HostedEditor | null) => void
}) {
  const { onEditingChange, onEditor, ...listing } = props
  const [editing, setEditing] = useState(false)
  const [changed, setChanged] = useState(false)
  // Another eruv opened in its place starts as its listing.
  const [shownId, setShownId] = useState(props.eruv.id)
  if (shownId !== props.eruv.id) {
    setShownId(props.eruv.id)
    setEditing(false)
  }
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setEditing((e.state as { mapSheetForm?: string } | null)?.mapSheetForm === 'edit')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    onEditingChange?.(editing)
  }, [editing, onEditingChange])
  const openEditor = () => {
    window.history.pushState({ ...(window.history.state ?? {}), mapSheetForm: 'edit' }, '')
    setChanged(false)
    setEditing(true)
  }
  const closeEditor = () => window.history.back()
  useEffect(() => {
    if (!onEditor) return
    onEditor(editing ? { back: () => window.history.back(), label: 'Back to listing', changed } : null)
  }, [onEditor, editing, changed])
  useEffect(() => () => onEditor?.(null), [onEditor])
  if (editing) {
    return (
      <div data-testid="eruv-editing">
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* Hosted (the desktop sidebar), the way back is its search
              box's ←; the empty cell still keeps the title centred. */}
          <span>{!onEditor && <BackIconButton onClick={closeEditor} />}</span>
          <h2 className="truncate text-base font-semibold text-slate-900">Edit listing</h2>
        </div>
        <EruvEditor eruv={props.eruv} onClose={closeEditor} onHasChanges={setChanged} />
      </div>
    )
  }
  return (
    <div className="space-y-3.5">
      <EruvDetails {...listing} />
      <button
        type="button"
        onClick={openEditor}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg transition-transform active:scale-[0.98]"
      >
        <PencilIcon className="h-4 w-4 shrink-0" />
        Edit listing
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
  // Saved as a place of the Eruv page's: it's found again among the
  // eruvim (usePinnedPlaces).
  const { isPinned, toggle } = usePinned()
  const page = useCategories()?.find((c) => c.kind === 'eruv') ?? null
  const saved = !!page && isPinned(eruv.id)
  return (
    <div className="space-y-3.5" data-testid="eruv-listing">
      <div className="flex items-start gap-3.5">
        <span className="relative shrink-0">
          <CategoryIcon icon="" initials={initialsOf(eruv.name)} shape="square" color={color} className="h-16 w-16 shrink-0 text-2xl" sizePx={64} />
          {saved && <SavedBadge />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">{eruv.name}</h2>
            {ui.map.pins && page && <SaveButton saved={saved} onToggle={() => toggle({ id: eruv.id, categoryId: page.id })} name={eruv.name} />}
          </div>
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
