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
import { FieldsBox, fieldText } from './FieldsBox'
import { eruvValues, withEruvFields } from '@/lib/eruvFields'
import { fieldBoxes } from '@/lib/fieldBoxes'
import { parseListingParts } from '@/lib/listingParts'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import type { DirectoryResource } from '@/types'

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
  /** Opens on its Edit listing: the admin preview's Editing tab. */
  startEditing?: boolean
}) {
  const { onEditingChange, onEditor, startEditing = false, ...listing } = props
  const [editing, setEditing] = useState(startEditing)
  // Opened by Edit listing, the editor is a step in the history and Back
  // closes it; opened on it (startEditing), there's no step to go back
  // over, and Back would leave the page it's in.
  const [stepped, setStepped] = useState(false)
  const [changed, setChanged] = useState(false)
  // Another eruv opened in its place starts as its listing.
  const [shownId, setShownId] = useState(props.eruv.id)
  if (shownId !== props.eruv.id) {
    setShownId(props.eruv.id)
    setEditing(startEditing)
    setStepped(false)
  }
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setEditing((e.state as { mapSheetForm?: string } | null)?.mapSheetForm === 'edit')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    onEditingChange?.(editing)
  }, [editing, onEditingChange])
  const eruvPage = useCategories()?.find((c) => c.kind === 'eruv') ?? null
  const openEditor = () => {
    window.history.pushState({ ...(window.history.state ?? {}), mapSheetForm: 'edit' }, '')
    setChanged(false)
    setStepped(true)
    setEditing(true)
  }
  const closeEditor = () => {
    if (!stepped) return setEditing(false)
    setStepped(false)
    window.history.back()
  }
  useEffect(() => {
    if (!onEditor) return
    onEditor(editing ? { back: stepped ? () => window.history.back() : () => setEditing(false), label: 'Back to listing', changed } : null)
  }, [onEditor, editing, changed, stepped])
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
        <EruvEditor eruv={props.eruv} page={eruvPage ?? FALLBACK_PAGE} onClose={closeEditor} onHasChanges={setChanged} />
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
  // Saved as a place of the Eruv page's: it's found again among the
  // eruvim (usePinnedPlaces).
  const { isPinned, toggle } = usePinned()
  const page = useCategories()?.find((c) => c.kind === 'eruv') ?? null
  const saved = !!page && isPinned(eruv.id)
  // Its boxes are the Eruv page's Fields (Nov 9, eruvFields.ts): never
  // saved, the ones an eruv always had. Its name and status come first.
  const shown = withEruvFields(page ?? FALLBACK_PAGE)
  const fields = shown.detailFields
  const boxes = fieldBoxes({ fields, hasAddress: false, hasPhone: false }, parseListingParts(shown.listingParts))
  const values = eruvValues(eruv)
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const inBox = (keys: string[]) => keys.map((k) => byKey.get(k)).filter((f): f is CategoryField => !!f)
  const topWords = inBox(boxes.find((b) => b.id === 'top')?.fields ?? [])
    .map((f) => fieldText(f, values[f.key]))
    .filter(Boolean)
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
          <p className="mt-1 text-[14.5px] leading-snug text-muted">{['Eruv', ...topWords].join(' · ')}</p>
        </div>
      </div>
      <Card>
        <div className="py-2">
          <EruvStatusLine eruv={eruv} now={now} timezone={timezone} candles={candles} />
        </div>
      </Card>
      {boxes.map((box) => {
        if (box.id === 'top' || box.id === 'hidden') return null
        if (box.id === 'contact') {
          const rows = inBox(box.fields).flatMap((f) => contactRow(f, values[f.key]) ?? [])
          return rows.length > 0 ? <Card key={box.id}>{rows}</Card> : null
        }
        // About is a listing's description; an eruv has none, so a lone
        // long-text field there is headed by its own name ("Certified by").
        // Several are each named under About (FieldsBox).
        const title = box.id === 'about' && box.fields.length === 1 ? (byKey.get(box.fields[0])?.label ?? box.title) : box.title
        return <FieldsBox key={box.id} item={values as unknown as DirectoryResource} title={title} fields={inBox(box.fields)} />
      })}
    </div>
  )
}

/** Before the categories load (or with no Eruv page at all), the fields an
 *  eruv always had. */
const FALLBACK_PAGE: CategoryConfig = { id: 'eruv', label: 'Eruv', pluralLabel: 'Eruv', icon: '', description: '', detailFields: [], kind: 'eruv' }

/** A field in the contact box: its icon and what it holds, to tap. The
 *  eruv's own website, hotline and alerts as they always were. */
function contactRow(f: CategoryField, v: unknown): React.ReactNode | null {
  const text = fieldText(f, v)
  if (!text) return null
  if (f.key === 'alertsUrl') {
    return (
      <ListingRow key={f.key} icon={<MailIcon className="h-[17px] w-[17px]" />}>
        <a href={text} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Email alerts from the eruv
        </a>
      </ListingRow>
    )
  }
  if (f.type === 'url') {
    return (
      <ListingRow key={f.key} icon={<GlobeIcon className="h-[17px] w-[17px]" />}>
        <a href={text} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {f.key === 'website' ? siteLabel(text) : (f.linkLabel ?? f.label)}
        </a>
      </ListingRow>
    )
  }
  if (f.type === 'tel') {
    // The hotline as the eruv writes it ("215-EIRUV-11"), dialled as digits.
    const raw = String(v).trim()
    return (
      <ListingRow key={f.key} icon={<PhoneIcon className="h-[17px] w-[17px]" />}>
        <a href={`tel:${dialable(raw)}`} className={linkClass}>
          {f.key === 'hotline' ? raw : text}
        </a>
      </ListingRow>
    )
  }
  return (
    <ListingRow key={f.key} icon={<span aria-hidden="true" className="block h-[17px] w-[17px]" />}>
      {f.type === 'boolean' ? (
        text
      ) : (
        <>
          <span className="text-muted">{f.label}: </span>
          {text}
        </>
      )}
    </ListingRow>
  )
}
