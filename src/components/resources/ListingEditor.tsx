'use client'

import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, fieldIsVisible, resolveCapabilities, selectValues, type CategoryConfig, type CategoryField, type FieldType } from '@/lib/categories'
import { changedHoursDays, listingChanges, sameFieldValue, type ListingChange } from '@/lib/listingDiff'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { useCommunitySlug } from '@/lib/communityContext'
import { dayLabel, formatTodayHours, getOpenStatus, syncedLabel, CLOSURE_LABELS } from '@/lib/hours'
import { formatPhone, normalizeUrl } from '@/lib/validation'
import { useNow } from '@/lib/useNow'
import { ui } from '@/lib/uiConfig'
import CategoryIcon from '@/components/CategoryIcon'
import ImageUploadField from '@/components/ImageUploadField'
import AddressInput from '@/components/intake/AddressInput'
import HoursInput from '@/components/intake/HoursInput'
import MinyanimInput from '@/components/intake/MinyanimInput'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget from '@/components/TurnstileWidget'
import PrivacyNote from '@/components/PrivacyNote'
import { CameraIcon, ClockIcon, DirectionsIcon, ExternalIcon, GlobeIcon, PhoneIcon, PinIcon, PlusIcon } from '@/components/icons'
import DaveningTimes, { hasDaveningTimes } from './DaveningTimes'
import TagsInput from './TagsInput'
import RemovalRequest from './RemovalRequest'
import { DetailFieldInput } from './ListingForm'
import { useListingDraft, type ListingDraft } from './useListingDraft'
import { TURNSTILE_ACTIVE, useListingSubmit } from './useListingSubmit'
import { SUBMIT_PILL } from './submitPill'

type Props = {
  /** The listing being edited. Omitted, the editor adds a new one: the
   *  same layout, starting from `draft` (a Google pick, see ListingAdd) or
   *  empty, sent as a new listing rather than an edit. */
  item?: DirectoryResource
  category: CategoryConfig
  /** A draft the host already started — ListingAdd's, which its Google
   *  search step filled in. Omitted, the editor starts its own from `item`. */
  draft?: ListingDraft
  /** Adding only: the draft came from a Google pick, so the line at the top
   *  says to check it rather than just that it's reviewed. */
  fromGoogle?: boolean
  /** Adding only: the category's listings, to say when what's being added
   *  looks like one that's already there (same name, same link, same
   *  Google place). */
  existingListings?: DirectoryResource[]
  /** Leaves the editor: Back after sending, or after a removal request. */
  onClose: () => void
  /** Where the Send button goes, when the host wants it outside the scrolling
   *  content — the desktop dialog floats it under the dialog, in the spot
   *  "Suggest an edit" occupied. Omitted (mobile sheet, map), it's the last
   *  thing in the content, the same "part of the list" rule the edit bar
   *  follows there. */
  sendSlot?: HTMLElement | null
  /** Where the title ("Suggest an edit", or "Request removal") goes: the
   *  host's own header row, beside Back, which would otherwise be an empty
   *  band. Omitted, the title leads the content instead. */
  titleSlot?: HTMLElement | null
  /** See ListingForm's prop of the same name. */
  sharedTurnstile?: { token: string; reset: () => void }
  /** See ListingForm's prop of the same name. */
  onRemovalOpenChange?: (open: boolean) => void
  /** Whether the Request removal screen is showing, when the host owns
   *  that — so its Back can step out of removal into the edit, rather than
   *  out of editing altogether, and removal can have its own history entry
   *  (the phone's back swipe, the browser's Back). The editor asks for a
   *  change through onRemovalOpenChange. A host that owns it gets no Cancel
   *  button on the removal screen: its Back is the way out. Omitted, the
   *  editor keeps it itself and the removal screen has a Cancel. */
  removalOpen?: boolean
}

// ── Pieces ────────────────────────────────────────────────────────────────

/** What makes edit mode look like edit mode without moving anything: a
 *  light dashed outline on everything you can tap to change. */
const TAPPABLE = 'outline-dashed outline-1 outline-offset-2 outline-slate-300 hover:outline-slate-400'

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary'

function placement(field: CategoryField): 'badge' | 'row' | 'hidden' {
  return field.renderAs ?? (field.type === 'boolean' ? 'badge' : 'row')
}

/** Where each field type is edited. A Record on purpose: adding a FieldType
 *  is a compile error here until someone decides where it goes, so a new
 *  type can't quietly go missing from edit mode (the same guarantee
 *  SubmissionCard.test gives the moderation queue). "badge or row" follows
 *  the field's own placement, as the listing does. */
const EDITED_AS: Record<FieldType, 'photo' | 'link button' | 'hours line' | 'davening' | 'tags' | 'badge or row' | 'row'> = {
  image: 'photo',
  url: 'link button',
  hours: 'hours line',
  minyanim: 'davening',
  tags: 'tags',
  boolean: 'badge or row',
  select: 'badge or row',
  text: 'row',
  textarea: 'row',
  tel: 'row',
  number: 'row',
}

const isSpecial = (f: CategoryField) => EDITED_AS[f.type] !== 'badge or row' && EDITED_AS[f.type] !== 'row'

/** A badge the listing's badge row can hold: a yes/no, or a choice. Text and
 *  number fields set to show as badges are edited as rows instead — they
 *  have no options to pick between. */
const isBadgeField = (f: CategoryField) => !isSpecial(f) && placement(f) === 'badge' && (f.type === 'boolean' || f.type === 'select')

type Lookalike = { listing: DirectoryResource; reason: string }

/** The first listing that looks like the one being added, and why: the
 *  same Google place (certain), the same link in one of its link fields —
 *  a WhatsApp group's invite, a website (near-certain) — or the same name
 *  (likely). Exported for its tests. */
export function findLookalike(
  listings: DirectoryResource[],
  draft: { name: string; placeId: string | null; details: Record<string, unknown> },
  fields: CategoryField[],
): Lookalike | null {
  if (draft.placeId) {
    const hit = listings.find((l) => l.placeId === draft.placeId)
    if (hit) return { listing: hit, reason: 'It’s the same place on Google.' }
  }
  for (const f of fields.filter((x) => x.type === 'url')) {
    const v = draft.details[f.key]
    if (typeof v !== 'string' || !v.trim()) continue
    const hit = listings.find((l) => typeof l[f.key] === 'string' && sameFieldValue('url', l[f.key], v))
    if (hit) return { listing: hit, reason: `It has the same ${f.label.toLowerCase()} link.` }
  }
  const name = draft.name.trim().toLowerCase()
  if (name) {
    const hit = listings.find((l) => l.name.trim().toLowerCase() === name)
    if (hit) return { listing: hit, reason: 'It has the same name.' }
  }
  return null
}

function AlreadyListed({ listing, reason, category }: { listing: DirectoryResource; reason: string; category: CategoryConfig }) {
  const community = useCommunitySlug()
  return (
    <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="font-semibold">{listing.name} is already in the guide.</span> {reason}{' '}
      <Link href={routes.listing(community, category.id, listingSlug(listing))} className="font-semibold text-primary hover:underline">
        View it
      </Link>{' '}
      to suggest an edit instead, or carry on if this is a different place.
    </div>
  )
}

/** No answer at all — the server's own test for a required field. */
function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (Array.isArray(v)) return v.length === 0
  return String(v).trim() === ''
}

function textOf(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') return ''
  return String(v)
}

/** A changed value: a blue edge down its left side, what it used to be
 *  crossed out underneath, and its own Undo. The same element whether or not
 *  anything changed, only restyled: swapping the wrapper in on the first
 *  keystroke that makes a change would remount the input inside it, and
 *  the field would lose focus mid-word. */
function Changed({ change, before, onUndo, children }: { change?: ListingChange; before?: ReactNode; onUndo: () => void; children: ReactNode }) {
  return (
    <div className={change ? '-mx-2 rounded-r-md border-l-[3px] border-primary bg-gradient-to-r from-blue-50 to-transparent py-1 pl-[5px] pr-2' : ''}>
      {children}
      {change && (
        <div className="mt-1 flex items-baseline justify-between gap-3 text-xs">
          <span className="min-w-0 text-slate-400 line-through">{before ?? (textOf(change.before) || '—')}</span>
          <button type="button" onClick={onUndo} className="shrink-0 cursor-pointer font-semibold text-primary hover:underline">
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

/** An editor opened in place, just under the badge or button that opened
 *  it, pushing the rest of the listing down rather than covering it. */
function InlinePanel({ title, onDone, children }: { title: string; onDone: () => void; children: ReactNode }) {
  return (
    <div className="-mx-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        <button type="button" onClick={onDone} className="cursor-pointer text-xs font-semibold text-primary hover:underline">
          Done
        </button>
      </div>
      {children}
    </div>
  )
}

/** What typing `text` into a field's "Other…" adds: the listed option it
 *  names, if it names one ("ou" is OU), otherwise the text itself — or
 *  nothing, if it's blank or already picked. */
function otherValue(field: CategoryField, chosen: string[], text: string): string | null {
  const v = text.trim()
  if (!v || chosen.some((c) => c.toLowerCase() === v.toLowerCase())) return null
  const match = (field.options ?? []).find((o) => o.label.toLowerCase() === v.toLowerCase())
  if (match && chosen.includes(match.value)) return null
  return match?.value ?? v
}

/** "+ Other…", and the box it opens for typing a choice that isn't listed
 *  — a certifier the admin hasn't added, say. Sits among a field's pills;
 *  the box takes a line of its own. */
function OtherChoice({ field, chosen, onAdd }: { field: CategoryField; chosen: string[]; onAdd: (value: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  function commit() {
    const value = otherValue(field, chosen, text)
    setAdding(false)
    setText('')
    if (value !== null) onAdd(value)
  }
  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="cursor-pointer rounded-full border border-dashed border-slate-400 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        + Other…
      </button>
    )
  }
  return (
    <div className="flex basis-full gap-1.5">
      <input
        aria-label={`Other ${field.label.toLowerCase()}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            setAdding(false)
            setText('')
          }
        }}
        placeholder="Type it in…"
        autoFocus
        className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button type="button" onClick={commit} className="shrink-0 cursor-pointer rounded-md bg-primary px-3 text-xs font-semibold text-white">
        Add
      </button>
    </div>
  )
}

/** A choice field's options as pills: one pick replaces the other for a
 *  single choice, several can be on for a multi-choice. A field that allows
 *  "Other" (see CategoryField.allowOther) ends with "+ Other…" (OtherChoice).
 *  What's typed becomes a pill of its own, the same as in the form. */
function OptionPills({ field, value, onChange }: { field: CategoryField; value: unknown; onChange: (v: unknown) => void }) {
  const chosen = selectValues(value)
  const options = field.options ?? []
  const known = new Set(options.map((o) => o.value))
  const custom = chosen.filter((v) => !known.has(v))
  const pills = [...options, ...custom.map((v) => ({ value: v, label: v }))]
  function pick(v: string) {
    const on = chosen.includes(v)
    if (field.multiSelect) onChange(on ? chosen.filter((x) => x !== v) : [...chosen, v])
    else onChange(on ? '' : v)
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={field.label}>
      {pills.map((o) => {
        const on = chosen.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => pick(o.value)}
            className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              on ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {o.label}
          </button>
        )
      })}
      {field.allowOther && <OtherChoice field={field} chosen={chosen} onAdd={(v) => onChange(field.multiSelect ? [...chosen, v] : v)} />}
    </div>
  )
}

/** A dashed "+ …" control for something the listing doesn't have yet. */
function AddButton({ label, onClick, id }: { label: string; onClick: () => void; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-blue-300 bg-blue-50/40 px-3 py-2 text-left text-sm text-primary hover:bg-blue-50"
    >
      <PlusIcon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  )
}

/** Takes you to a field from something that comes from it (Directions →
 *  the address, Call → the phone, the orange note → its editor): scrolls it
 *  into view, puts the cursor in it, and flashes it, because on a phone the
 *  scroll can be too small to notice and you'd otherwise not know where
 *  you'd landed. The id can be on the field or on a box around it. */
function focusAndReveal(id: string) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null
  if (!el) return
  const target = el.matches('input, textarea, select, button') ? el : (el.querySelector<HTMLElement>('input, textarea, select, button') ?? el)
  target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  target.focus({ preventScroll: true })
  target.animate?.(
    [{ boxShadow: '0 0 0 4px rgba(29, 78, 216, 0.45)' }, { boxShadow: '0 0 0 0 rgba(29, 78, 216, 0)' }],
    { duration: 1400, easing: 'ease-out' },
  )
}

// ── The editor ────────────────────────────────────────────────────────────

/**
 * "Suggest an edit" as the listing itself: the same layout, order and
 * pieces as PlaceDetailBody, with every value editable where it's read —
 * Option A from the edit-in-place mockups. Nothing moves when you switch
 * from reading to editing; what's tappable gets a light dashed outline,
 * and the photo gets a camera.
 *
 * - Badges stay in their row. Tapping one opens its group's editor just
 *   below the row; the "+" at the end adds one that isn't there (a "no"
 *   never shows on the listing, so there'd be no other way to turn one on).
 *   The kosher caveat's question and note open with the certification
 *   badge they colour amber, and nowhere else.
 * - "Open", the item count, Directions and Call come from other fields, so
 *   they stay in place, faded or plain, and tapping one goes to its source.
 * - Link buttons (Website, Certification) edit from the button; a missing
 *   one is a dashed "+" button in its usual place.
 * - Hours read as they do on the listing (today's line; tap for the week).
 *
 * Every change is marked where it happened, with what it replaced crossed
 * out and its own Undo, and counted on Send. What counts as a change is
 * listingChanges'; what gets sent is useListingDraft's, the same as the
 * form's.
 */
export default function ListingEditor({
  item: itemProp,
  category,
  draft: draftProp,
  fromGoogle = false,
  existingListings,
  onClose,
  sendSlot,
  titleSlot,
  sharedTurnstile,
  onRemovalOpenChange,
  removalOpen: removalOpenProp,
}: Props) {
  // Adding: nothing to compare against, so every value is simply what's
  // there — no change marks, no Undo, no crossed-out "before". A blank
  // listing stands in for `item` so the reads below don't each need a
  // guard; `creating` switches off what only makes sense for an edit.
  const creating = !itemProp
  const item: DirectoryResource = itemProp ?? { id: '', category: category.id, name: '', anchorId: 'all', distance: 0, address: '' }
  const ownDraft = useListingDraft(category, itemProp)
  const draft = draftProp ?? ownDraft
  const { hasAddress, hasPhone, syncEligible, name, setName, address, setAddress, phone, setPhone, details, setDetail } = draft
  const { ownTurnstileRef, setOwnTurnstileToken, ...sender } = useListingSubmit({ mode: creating ? 'create' : 'edit', existing: itemProp, sharedTurnstile })
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const [openHours, setOpenHours] = useState<Record<string, boolean>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [removalOpenState, setRemovalOpenState] = useState(false)
  const removalControlled = removalOpenProp !== undefined
  const removalOpen = removalOpenProp ?? removalOpenState
  const [sent, setSent] = useState<ListingChange[]>([])
  const now = new Date(useNow())

  const setRemovalOpen = (open: boolean) => {
    setRemovalOpenState(open)
    onRemovalOpenChange?.(open)
  }

  const fields = category.detailFields
  const visible = (f: CategoryField) => fieldIsVisible(f, details)
  // Only fields that still apply are compared. One that stopped applying
  // because of another change — the caveat's note once "Everything here is
  // kosher?" says Yes, a mikvah's women's hours once Women's Tevillah is
  // off — isn't a change of its own: it's part of the change that hid it,
  // which is already counted.
  const changes = listingChanges(
    item,
    { name, address: hasAddress ? address : '', phone: hasPhone ? phone : '', details: draft.visibleDetails() },
    fields.filter((f) => fieldIsVisible(f, details)),
  )
  const changeFor = (key: string) => (creating ? undefined : changes.find((c) => c.key === key))
  const current: DirectoryResource = { ...item, name, address, phone, ...details }

  function undo(key: string) {
    if (key === 'name') setName(item.name)
    else if (key === 'address') setAddress(item.address ?? '')
    else if (key === 'phone') setPhone(item.phone ?? '')
    else {
      setDetail(key, item[key])
      const f = fields.find((x) => x.key === key)
      if (f?.type === 'tags') setDetail(`${key}_sometimes`, item[`${key}_sometimes`])
    }
  }

  const togglePanel = (key: string) => setOpenPanel((p) => (p === key ? null : key))

  // ── Fields, grouped the way PlaceDetailBody lays them out ──────────────
  const hoursFields = fields.filter((f) => f.type === 'hours' && visible(f))
  const tagFields = fields.filter((f) => f.type === 'tags' && visible(f))
  const urlFields = fields.filter((f) => f.type === 'url' && visible(f))
  const minyanimField = fields.find((f) => f.type === 'minyanim' && visible(f))
  const badgeFields = fields.filter((f) => isBadgeField(f) && visible(f))
  const rowFields = fields.filter((f) => !isSpecial(f) && !isBadgeField(f) && placement(f) !== 'hidden' && visible(f))
  // The caveat's own two fields (its yes/no and its note) are placed
  // `hidden` and edit from their certification badge. Any other hidden
  // field still needs somewhere to be edited; it goes last.
  const caveatParts = new Set(fields.flatMap((f) => (f.caveat ? [f.caveat.flagField, f.caveat.noteField] : [])))
  const otherHidden = fields.filter((f) => placement(f) === 'hidden' && !caveatParts.has(f.key) && visible(f))
  const photoField = fields.find((f) => f.key === PHOTO_FIELD_KEY && f.type === 'image')

  const { isOpen: openNow, closure } = getOpenStatus(current, hoursFields.map((f) => f.key), now)
  const countField = tagFields.find((f) => f.showCountInHeader)
  const count = countField ? selectValues(details[countField.key]).length + selectValues(details[`${countField.key}_sometimes`]).length : 0
  const suppressedBadgeKey = count > 0 ? countField?.countReplacesKey : undefined
  const isAmber = (f: CategoryField) => !!f.caveat && !!details[f.caveat.flagField]

  // Adding: one that looks like a listing the guide already has — the same
  // Google place, the same link (a WhatsApp group's invite, a website), or
  // the same name. Said, not blocked: two places can share a name (a
  // chain's two branches), and the way on is plainly an edit of the
  // existing one instead.
  const lookalike = creating ? findLookalike(existingListings ?? [], { name, placeId: draft.placeId, details }, fields) : null

  // ── Done: a receipt of what was sent ──────────────────────────────────
  if (sender.done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-5">
        <h2 className="text-lg font-semibold text-green-800">Thank you!</h2>
        {sender.doneKind === 'removal' ? (
          <p className="mt-1 text-sm text-green-700">Your removal request was received. A moderator will review it before anything changes.</p>
        ) : creating ? (
          <p className="mt-1 text-sm text-green-700">Sent for review. A moderator checks it before it goes live.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-green-700">Sent for review. A moderator checks it before it goes live.</p>
            <ul className="mt-3 space-y-1 text-sm text-green-900">
              {sent.map((c) => (
                <li key={c.key}>
                  <span className="font-medium">{c.label}:</span> {c.summary}
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" onClick={onClose} className="mt-4 cursor-pointer text-sm font-semibold text-primary hover:underline">
          {creating ? 'Back to the list' : 'Back to the listing'}
        </button>
      </div>
    )
  }

  // Adding: what a listing can't go without — a name, an address where the
  // category has one, and whatever the admin marked required — named on
  // Send until it's there, the way an edit's Send says "No changes yet".
  // The same rules the server applies (resourceStore's validateSubmission),
  // so Send is never on for something that would be refused.
  const missing = creating
    ? [
        !name.trim() && 'Name',
        hasAddress && !address.trim() && 'Address',
        ...fields
          .filter((f) => f.required && visible(f) && isBlank(details[f.key]))
          .map((f) => f.label),
      ].filter((x): x is string => !!x)
    : []
  const nothingToSend = creating ? missing.length > 0 : changes.length === 0

  async function send() {
    if (nothingToSend || sender.submitting || sender.verifying) return
    sender.setErrors([])
    setSent(changes)
    await sender.submit(draft.buildSubmission())
  }

  const sendLabel = sender.submitting
    ? 'Sending…'
    : nothingToSend
      ? creating
        ? `Still needed: ${missing.join(', ')}`
        : 'No changes yet'
      : sender.verifying
        ? 'Verifying…'
        : creating
          ? 'Send for review'
          : `Send ${changes.length} change${changes.length === 1 ? '' : 's'}`
  const sendButton = (
    <button
      type="button"
      onClick={send}
      disabled={nothingToSend || sender.submitting || sender.verifying}
      className={SUBMIT_PILL}
    >
      {sendLabel}
    </button>
  )

  const canRequestRemoval = !creating && ui.contributions.report && resolveCapabilities(category.capabilities).report

  // ── Header: photo and name ────────────────────────────────────────────
  const photo = photoField ? textOf(details[photoField.key]) : ''
  const header = (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {photoField ? (
          <button
            type="button"
            onClick={() => togglePanel('photo')}
            aria-label={photo ? 'Change photo' : 'Add a photo'}
            aria-expanded={openPanel === 'photo'}
            className="group relative shrink-0 cursor-pointer rounded-full"
          >
            {photo ? (
              <CategoryIcon icon={category.icon} categoryId={category.id} iconImageUrl={photo} color="#94a3b8" className="h-12 w-12 text-2xl" sizePx={48} />
            ) : (
              <span className="block h-12 w-12 rounded-full border-[1.5px] border-dashed border-slate-400 bg-slate-50" />
            )}
            {/* Desktop's hover cue; the corner badge is the one a phone gets. */}
            <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-900/0 transition-colors group-hover:bg-slate-900/25" />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-700 shadow ring-1 ring-slate-900/10">
              <CameraIcon className="h-3 w-3" />
            </span>
          </button>
        ) : (
          <CategoryIcon icon={category.icon} categoryId={category.id} iconImageUrl={category.iconImageUrl} color="#94a3b8" className="h-12 w-12 text-2xl" sizePx={48} />
        )}
        <div className="min-w-0 flex-1">
          <Changed change={changeFor('name')} onUndo={() => undo('name')}>
            <input
              id="edit-name"
              aria-label="Name"
              placeholder="Name"
              // Adding by hand: the name is the first thing to fill in.
              autoFocus={creating && !fromGoogle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-lg font-bold leading-tight text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Changed>
        </div>
      </div>
      {photoField && openPanel === 'photo' && (
        <InlinePanel title="Photo" onDone={() => setOpenPanel(null)}>
          <Changed change={changeFor(photoField.key)} before={changeFor(photoField.key)?.before ? 'Previous photo' : 'No photo'} onUndo={() => undo(photoField.key)}>
            <ImageUploadField
              value={photo}
              onChange={(v) => setDetail(photoField.key, v)}
              uploadUrl="/api/submissions/photo"
              shape="circle"
              showRepositionHint={false}
              collapseUrlInput
            />
          </Changed>
        </InlinePanel>
      )}
    </div>
  )

  // ── Badge row ─────────────────────────────────────────────────────────
  const originalValues = (f: CategoryField) => (f.type === 'boolean' ? (item[f.key] ? ['__on'] : []) : selectValues(item[f.key]))
  const currentValues = (f: CategoryField) => (f.type === 'boolean' ? (details[f.key] ? ['__on'] : []) : selectValues(details[f.key]))
  const chipText = (f: CategoryField, v: string) =>
    v === '__on' ? (f.filterLabel ?? f.label) : (f.options?.find((o) => o.value === v)?.label ?? v)

  function removeBadge(f: CategoryField, v: string) {
    if (f.type === 'boolean') setDetail(f.key, false)
    else if (f.multiSelect) setDetail(f.key, selectValues(details[f.key]).filter((x) => x !== v))
    else setDetail(f.key, '')
  }
  function restoreBadge(f: CategoryField, v: string) {
    if (f.type === 'boolean') setDetail(f.key, true)
    else if (f.multiSelect) setDetail(f.key, [...selectValues(details[f.key]), v])
    else setDetail(f.key, v)
  }

  const badgeChips = badgeFields.flatMap((f) => {
    if (f.key === suppressedBadgeKey) return []
    const before = originalValues(f)
    const nowValues = currentValues(f)
    const amber = isAmber(f)
    const panelOpen = openPanel === `badge:${f.key}`
    // Every badge carries an ×, the way a chip you can change does anywhere
    // else — one that was already there as much as one you just added, or
    // adding one teaches "chips come off with ×" and the old ones then look
    // fixed. Tapping the badge itself still opens its group's panel. The ×
    // is fainter on an existing badge so the row still reads as the
    // listing first. Removing the last certification needs nothing extra
    // for its caveat: the listing only shows a caveat beside a badge it
    // has, so it goes quiet, and comes back with the badge.
    const chips = nowValues.map((v) => {
      const label = chipText(f, v)
      // When adding, everything is new, so nothing is marked as such.
      const isNew = !creating && !before.includes(v)
      // The blue edge says "new"; the fill is what the listing will show —
      // amber when the caveat applies, like the badges beside it.
      const tone = isNew
        ? `border-primary ${amber ? 'bg-caution/10 text-caution' : 'bg-blue-50 text-primary'}`
        : amber
          ? 'border-caution/30 bg-caution/10 text-caution'
          : 'border-slate-200 bg-slate-100 text-slate-600'
      const outline = panelOpen ? 'outline-solid outline-2 outline-offset-1 outline-primary' : isNew ? '' : TAPPABLE
      return (
        <span
          key={`${f.key}:${v}`}
          className={`inline-flex items-center rounded-full border text-xs font-medium ${tone} ${outline}`}
        >
          <button type="button" onClick={() => togglePanel(`badge:${f.key}`)} aria-expanded={panelOpen} className="cursor-pointer py-0.5 pl-2 pr-1">
            {label}
          </button>
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={() => removeBadge(f, v)}
            // A 16px circle with a 24px hit area (the ::after), so it's
            // tappable on a phone without making the chip any bigger.
            className={`relative mr-1 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full after:absolute after:-inset-1 after:content-[''] ${isNew ? 'text-primary hover:bg-primary/15' : 'opacity-50 hover:bg-slate-900/10 hover:opacity-100'}`}
          >
            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>
      )
    })
    // A removed badge stays, crossed out, so the change is visible where it
    // happened — and a tap brings it back.
    const removed = before
      .filter((v) => !nowValues.includes(v))
      .map((v) => (
        <button
          key={`${f.key}:was:${v}`}
          type="button"
          aria-label={`Bring back ${chipText(f, v)}`}
          onClick={() => restoreBadge(f, v)}
          className="cursor-pointer rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-400 line-through hover:text-slate-600"
        >
          {chipText(f, v)}
        </button>
      ))
    return [...removed, ...chips]
  })

  // What the "+" can add: every yes/no that's off, every option not picked.
  const addable = badgeFields
    .map((f) => ({
      f,
      options:
        f.type === 'boolean'
          ? details[f.key]
            ? []
            : [{ value: '__on', label: f.filterLabel ?? f.label }]
          : (f.options ?? []).filter((o) => !selectValues(details[f.key]).includes(o.value)),
    }))
    // A field that takes a typed-in choice is always addable: its "+
    // Other…" is the only way to add a certifier that isn't listed to a
    // listing that has none yet, since there's no badge to open.
    .filter((x) => (x.options.length > 0 || (x.f.type === 'select' && !!x.f.allowOther)) && (x.f.type === 'boolean' || x.f.multiSelect || selectValues(details[x.f.key]).length === 0))
    // Adding: a group with nothing picked has its own named chip (below),
    // so the "+" only offers more for groups that already have a badge.
    .filter((x) => !creating || currentValues(x.f).length > 0)

  // Adding: every badge group with nothing in it yet, as a named dashed
  // chip ("+ Food Type") where it'll sit. On an edit the listing's own
  // badges are there to tap and a bare "+" covers the rest; a new listing
  // has none, so a lone "+" would hide every choice behind it. A yes/no
  // turns on from its chip; a choice opens its panel, the same one Edit
  // uses.
  const emptyGroups = creating ? badgeFields.filter((f) => f.key !== suppressedBadgeKey && currentValues(f).length === 0) : []

  function addBadge(f: CategoryField, v: string) {
    if (f.type === 'boolean') setDetail(f.key, true)
    else if (f.multiSelect) setDetail(f.key, [...selectValues(details[f.key]), v])
    else setDetail(f.key, v)
  }

  const openBadgeField = openPanel?.startsWith('badge:') ? badgeFields.find((f) => `badge:${f.key}` === openPanel) : undefined
  const flagField = (f: CategoryField) => (f.caveat ? fields.find((x) => x.key === f.caveat!.flagField) : undefined)
  const noteField = (f: CategoryField) => (f.caveat ? fields.find((x) => x.key === f.caveat!.noteField) : undefined)

  const badgeSection = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {openNow && hoursFields[0] && (
          <button
            type="button"
            title="Comes from the hours"
            onClick={() => {
              setOpenHours((h) => ({ ...h, [hoursFields[0].key]: true }))
              focusAndReveal(`edit-hours-${hoursFields[0].key}`)
            }}
            className="cursor-pointer rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
          >
            Open
          </button>
        )}
        {countField && count > 0 && (
          <button
            type="button"
            title={`Comes from ${countField.label}`}
            onClick={() => focusAndReveal(`edit-tags-${countField.key}`)}
            className="cursor-pointer rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
          >
            <span className="font-semibold">{count}</span> {countField.countLabel ?? countField.label.toLowerCase()}
            {count === 1 ? '' : 's'}
          </button>
        )}
        {badgeChips}
        {emptyGroups.map((f) => {
          const panelOpen = openPanel === `badge:${f.key}`
          return (
            <button
              key={`empty:${f.key}`}
              type="button"
              aria-expanded={f.type === 'boolean' ? undefined : panelOpen}
              onClick={() => (f.type === 'boolean' ? setDetail(f.key, true) : togglePanel(`badge:${f.key}`))}
              className={`cursor-pointer rounded-full border border-dashed border-blue-300 bg-white px-2 py-0.5 text-xs font-medium text-primary hover:bg-blue-50 ${panelOpen ? 'outline-solid outline-2 outline-offset-1 outline-primary' : ''}`}
            >
              + {f.type === 'boolean' ? (f.filterLabel ?? f.label) : f.label}
            </button>
          )
        })}
        {addable.length > 0 && (
          <button
            type="button"
            aria-label="Add a badge"
            aria-expanded={openPanel === 'add'}
            onClick={() => togglePanel('add')}
            className="flex h-[22px] w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-blue-300 bg-white text-primary hover:bg-blue-50"
          >
            <PlusIcon className="h-3 w-3" />
          </button>
        )}
      </div>
      {openBadgeField && (
        <InlinePanel title={openBadgeField.label} onDone={() => setOpenPanel(null)}>
          <div className="space-y-3">
            {openBadgeField.type === 'boolean' ? (
              <DetailFieldInput field={openBadgeField} value={details[openBadgeField.key]} onChange={(v) => setDetail(openBadgeField.key, v)} />
            ) : (
              <OptionPills field={openBadgeField} value={details[openBadgeField.key]} onChange={(v) => setDetail(openBadgeField.key, v)} />
            )}
            {(() => {
              const flag = flagField(openBadgeField)
              const note = noteField(openBadgeField)
              if (!flag) return null
              return (
                <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-2.5">
                  <DetailFieldInput field={flag} value={details[flag.key]} onChange={(v) => setDetail(flag.key, v)} />
                  {note && visible(note) && <DetailFieldInput field={note} value={details[note.key]} onChange={(v) => setDetail(note.key, v)} />}
                </div>
              )
            })()}
          </div>
        </InlinePanel>
      )}
      {openPanel === 'add' && (
        <InlinePanel title="Add a badge" onDone={() => setOpenPanel(null)}>
          <div className="space-y-2.5">
            {addable.map(({ f, options }) => (
              <div key={f.key}>
                {f.type !== 'boolean' && <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{f.label}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => addBadge(f, o.value)}
                      className="cursor-pointer rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      + {o.label}
                    </button>
                  ))}
                  {f.type === 'select' && f.allowOther && (
                    <OtherChoice field={f} chosen={selectValues(details[f.key])} onAdd={(v) => addBadge(f, v)} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </InlinePanel>
      )}
    </div>
  )

  // ── Action row ────────────────────────────────────────────────────────
  const openUrlField = openPanel?.startsWith('url:') ? urlFields.find((f) => `url:${f.key}` === openPanel) : undefined
  const actionSection = (hasAddress || hasPhone || urlFields.length > 0) && (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        {/* Directions and Call come from the address and phone below: faded,
            and a tap goes to the field, so one value isn't edited in two
            places. */}
        {hasAddress && (
          <button type="button" onClick={() => focusAndReveal('edit-address')} className="flex cursor-pointer flex-col items-center gap-1 text-primary opacity-50">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <DirectionsIcon className="h-5 w-5" />
            </span>
            <span className="text-xs font-medium">Directions</span>
          </button>
        )}
        {hasPhone && (
          <button type="button" onClick={() => focusAndReveal('edit-phone')} className="flex cursor-pointer flex-col items-center gap-1 text-primary opacity-50">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <PhoneIcon className="h-5 w-5" />
            </span>
            <span className="text-xs font-medium">Call</span>
          </button>
        )}
        {urlFields.map((f) => {
          const has = !!textOf(details[f.key]).trim()
          const label = f.linkLabel ?? f.label
          const changed = !!changeFor(f.key)
          const open = openPanel === `url:${f.key}`
          return (
            <button
              key={f.key}
              type="button"
              aria-label={has ? `Edit ${label} link` : `Add ${label} link`}
              aria-expanded={open}
              onClick={() => togglePanel(`url:${f.key}`)}
              className="flex cursor-pointer flex-col items-center gap-1 text-primary"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full ${
                  has ? `bg-primary/10 ${changed ? 'outline-solid outline-2 outline-offset-2 outline-primary' : TAPPABLE}` : 'border-[1.5px] border-dashed border-blue-300 bg-white'
                } ${open ? 'outline-solid outline-2 outline-offset-2 outline-primary' : ''}`}
              >
                {has ? (
                  f.label.trim().toLowerCase() === 'website' ? <GlobeIcon className="h-5 w-5" /> : <ExternalIcon className="h-5 w-5" />
                ) : (
                  <PlusIcon className="h-4 w-4" />
                )}
              </span>
              <span className="text-xs font-medium">{label}</span>
            </button>
          )
        })}
      </div>
      {openUrlField && (
        <InlinePanel title={`${openUrlField.linkLabel ?? openUrlField.label} link`} onDone={() => setOpenPanel(null)}>
          <Changed change={changeFor(openUrlField.key)} before={textOf(item[openUrlField.key]) || 'No link'} onUndo={() => undo(openUrlField.key)}>
            <input
              type="url"
              aria-label={`${openUrlField.linkLabel ?? openUrlField.label} link`}
              autoFocus
              value={textOf(details[openUrlField.key])}
              onChange={(e) => setDetail(openUrlField.key, e.target.value)}
              onBlur={(e) => setDetail(openUrlField.key, normalizeUrl(e.target.value))}
              placeholder={openUrlField.placeholder ?? 'example.com'}
              className={inputClass}
            />
          </Changed>
        </InlinePanel>
      )}
    </div>
  )

  // ── Address, phone, hours ─────────────────────────────────────────────
  const syncedNote = item.placeId ? syncedLabel(item.googleSyncedAt) : null
  const addressSection = (hasAddress || hasPhone || hoursFields.length > 0 || closure || syncedNote) && (
    <div className="space-y-3">
      {closure && (
        <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${closure === 'permanent' ? 'border-red-200 bg-red-50 text-red-700' : 'border-caution/30 bg-caution/10 text-caution'}`}>
          {CLOSURE_LABELS[closure]}
        </span>
      )}
      {hasAddress && (
        <Changed change={changeFor('address')} onUndo={() => undo('address')}>
          <div className="flex items-center gap-3">
            <PinIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <div id="edit-address" className="min-w-0 flex-1">
              <AddressInput
                value={address}
                onChange={setAddress}
                onCoords={draft.setCoords}
                onPlaceSelect={draft.handlePlaceSelect}
                ariaLabel="Address"
                placeholder={syncEligible ? 'Search by business name or address…' : 'Start typing an address…'}
              />
            </div>
          </div>
        </Changed>
      )}
      {/* An input while there's a number or once one's been started — not
          just while it's non-empty, or clearing it to retype would swap the
          field out from under the cursor. */}
      {hasPhone &&
        (phone || item.phone || revealed.phone ? (
          <Changed change={changeFor('phone')} onUndo={() => undo('phone')}>
            <div className="flex items-center gap-3">
              <PhoneIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                id="edit-phone"
                type="tel"
                aria-label="Phone"
                autoFocus={!!revealed.phone && !phone}
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(215) 555-0100"
                className={inputClass}
              />
            </div>
          </Changed>
        ) : (
          <div className="flex items-center gap-3">
            <PhoneIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <AddButton id="edit-phone" label="Add a phone number" onClick={() => setRevealed((r) => ({ ...r, phone: true }))} />
          </div>
        ))}
      {hoursFields.map((f) => {
        const value = details[f.key]
        const open = !!openHours[f.key]
        const change = changeFor(f.key)
        const days = changedHoursDays(item[f.key], value)
        const today = formatTodayHours(value, now)
        const toggle = () => setOpenHours((h) => ({ ...h, [f.key]: !h[f.key] }))
        return (
          <div key={f.key} className="flex items-start gap-3">
            <ClockIcon className="mt-1.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1 space-y-2">
              {hoursFields.length > 1 && <p className="text-xs text-muted">{f.label}</p>}
              {today || open ? (
                <button
                  id={`edit-hours-${f.key}`}
                  type="button"
                  aria-expanded={open}
                  onClick={toggle}
                  className={`flex cursor-pointer items-center gap-1 rounded text-sm text-slate-700 ${TAPPABLE}`}
                >
                  <span>{today ?? 'Hours'}</span>
                  <svg className={`h-3 w-3 text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              ) : (
                <AddButton id={`edit-hours-${f.key}`} label={`Add ${hoursFields.length > 1 ? f.label.toLowerCase() : 'hours'}`} onClick={toggle} />
              )}
              {open && <HoursInput label={`${f.label}, day by day`} value={value} onChange={(v) => setDetail(f.key, v)} />}
              {change && (
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-primary">
                    {days.length > 0
                      ? `${days.length} day${days.length === 1 ? '' : 's'} changed · ${days.map(dayLabel).join(', ')}`
                      : 'Hours changed'}
                  </span>
                  <button type="button" onClick={() => undo(f.key)} className="shrink-0 cursor-pointer font-semibold text-primary hover:underline">
                    Undo
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
      {syncedNote && <p className="text-[11px] text-muted">{syncedNote}</p>}
    </div>
  )

  // ── Davening ──────────────────────────────────────────────────────────
  const minyanimValue = minyanimField ? details[minyanimField.key] : undefined
  const daveningSection = minyanimField && (
    <div>
      <p className="mb-1 text-xs text-muted">Davening Times</p>
      {openPanel === 'minyanim' ? (
        <Changed change={changeFor(minyanimField.key)} before="Previous times" onUndo={() => undo(minyanimField.key)}>
          <MinyanimInput label="Davening times" value={minyanimValue} onChange={(v) => setDetail(minyanimField.key, v)} />
        </Changed>
      ) : hasDaveningTimes(minyanimValue, undefined) ? (
        <button type="button" onClick={() => togglePanel('minyanim')} aria-label="Edit davening times" className={`block w-full cursor-pointer rounded-md text-left ${TAPPABLE}`}>
          <DaveningTimes minyanim={minyanimValue} geo={item.geo} />
        </button>
      ) : (
        <AddButton label="Add davening times" onClick={() => togglePanel('minyanim')} />
      )}
    </div>
  )

  // ── Row fields (text, notes, phone-type fields) ───────────────────────
  const rowField = (f: CategoryField) => {
    const value = details[f.key]
    const has = textOf(value).trim() !== ''
    const change = changeFor(f.key)
    if (!has && !revealed[f.key] && !change) {
      return <AddButton key={f.key} id={`edit-${f.key}`} label={`Add ${f.label.toLowerCase()}`} onClick={() => setRevealed((r) => ({ ...r, [f.key]: true }))} />
    }
    return (
      <Changed key={f.key} change={change} before={textOf(item[f.key]) || '—'} onUndo={() => undo(f.key)}>
        {f.type === 'textarea' ? (
          <div>
            <label htmlFor={`edit-${f.key}`} className="mb-1 block text-sm text-muted">{f.label}</label>
            <textarea
              id={`edit-${f.key}`}
              autoFocus={!!revealed[f.key] && !has}
              value={textOf(value)}
              onChange={(e) => setDetail(f.key, e.target.value)}
              rows={3}
              placeholder={f.placeholder}
              className={inputClass}
            />
          </div>
        ) : (
          <DetailFieldInput field={f} value={value} onChange={(v) => setDetail(f.key, v)} />
        )}
      </Changed>
    )
  }
  const rowsSection = rowFields.length > 0 && <div className="space-y-3">{rowFields.map(rowField)}</div>

  // ── Tags ──────────────────────────────────────────────────────────────
  const tagsSections = tagFields.map((f) => {
    const always = selectValues(details[f.key])
    const sometimes = selectValues(details[`${f.key}_sometimes`])
    const change = changeFor(f.key)
    if (always.length === 0 && sometimes.length === 0 && !revealed[f.key] && !change) {
      return <AddButton key={f.key} id={`edit-tags-${f.key}`} label={`Add ${f.label.toLowerCase()}`} onClick={() => setRevealed((r) => ({ ...r, [f.key]: true }))} />
    }
    return (
      <div key={f.key} id={`edit-tags-${f.key}`}>
        <Changed change={change} before={selectValues(item[f.key]).join(', ') || 'None'} onUndo={() => undo(f.key)}>
          <TagsInput
            field={f}
            value={always}
            onChange={(v) => setDetail(f.key, v)}
            sometimes={sometimes}
            onChangeSometimes={(v) => setDetail(`${f.key}_sometimes`, v)}
          />
        </Changed>
      </div>
    )
  })

  // ── Caveat notes, as the listing shows them — edited from their badge ─
  // Shown where the listing shows it, and tappable there too — it's where
  // your eye goes to fix it. It opens the certification panel with the
  // cursor in the note, so there's still only ever one box for it.
  const caveatNotes = badgeFields
    .filter((f) => f.caveat && details[f.caveat.flagField] && currentValues(f).length > 0)
    .map((f) => (
      <button
        key={f.key}
        type="button"
        aria-label={`Edit: ${noteField(f)?.label ?? 'what isn’t kosher'}`}
        onClick={() => {
          setOpenPanel(`badge:${f.key}`)
          setTimeout(() => focusAndReveal(`detail-${f.caveat!.noteField}`), 0)
        }}
        className={`block w-full cursor-pointer rounded text-left text-[12px] leading-snug text-caution ${TAPPABLE}`}
      >
        {textOf(details[f.caveat!.noteField]).trim() || 'Not everything here is kosher — please verify.'}
      </button>
    ))

  const otherSection = otherHidden.length > 0 && (
    <div className="space-y-3">
      {otherHidden.map((f) => (
        <Changed key={f.key} change={changeFor(f.key)} onUndo={() => undo(f.key)}>
          <DetailFieldInput field={f} value={details[f.key]} onChange={(v) => setDetail(f.key, v)} />
        </Changed>
      ))}
    </div>
  )

  const sections = [
    badgeSection,
    actionSection,
    addressSection,
    daveningSection,
    rowsSection,
    ...tagsSections,
    caveatNotes.length > 0 && <div className="space-y-1">{caveatNotes}</div>,
    otherSection,
  ].filter(Boolean)

  // The title says you're editing (the layout below deliberately doesn't
  // change) — "Suggest an edit", the words on the button that opened it,
  // and a verb that already says someone else decides; "Edit listing" would
  // promise the change goes live. The line under it says nothing goes live
  // unreviewed, which is what makes a stranger willing to touch it: a quiet
  // line, not the form's old blue box, which would be the first thing on
  // screen that doesn't look like the listing.
  const title = (
    // No size of its own: the host's slot sets it (larger in the desktop
    // dialog, where it sits beside the dialog's Close, than beside a
    // phone sheet's Back).
    <h2 className="truncate font-semibold text-slate-900">{removalOpen ? 'Request removal' : 'Suggest an edit'}</h2>
  )
  // Adding has no title of its own here: "Add a {category}" spans the
  // search step before this one too, so the host (ListingAdd) owns it.
  const reviewLine = (
    <div className="space-y-2">
      {!titleSlot && !creating && <div className="text-base">{title}</div>}
      <p className="rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
        {creating && fromGoogle ? (
          <>
            <span className="font-semibold text-slate-700">Filled in from Google.</span> Check it, then add what Google can’t know. Reviewed by a moderator before it goes live.
          </>
        ) : (
          'Reviewed by a moderator before it goes live'
        )}
      </p>
    </div>
  )

  return (
    <div className="space-y-4">
      <Honeypot value={sender.honeypot} onChange={sender.setHoneypot} />
      {titleSlot && !creating && createPortal(title, titleSlot)}
      {reviewLine}
      {lookalike && <AlreadyListed listing={lookalike.listing} reason={lookalike.reason} category={category} />}

      <div className={removalOpen ? 'hidden' : 'space-y-4'}>
        {header}
        {sections.map((section, i) => (
          <div key={i} className="space-y-4">
            {i > 0 && <hr className="border-slate-200" />}
            {section}
          </div>
        ))}

        <hr className="border-slate-200" />
        <div>
          <label htmlFor="edit-submitter-email" className="mb-1 block text-sm font-medium text-slate-700">Your email (optional)</label>
          <input id="edit-submitter-email" type="email" value={sender.submitterEmail} onChange={(e) => sender.setSubmitterEmail(e.target.value)} className={inputClass} />
          <PrivacyNote className="mt-2" />
        </div>

        {!creating && changes.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="mb-1.5 font-semibold text-slate-800">
              Your suggestion · {changes.length} change{changes.length === 1 ? '' : 's'}
            </p>
            <ul className="space-y-1">
              {changes.map((c) => (
                <li key={c.key} className="flex gap-2 text-slate-700">
                  <span className="w-20 shrink-0 text-muted">{c.label}</span>
                  <span className="min-w-0">{c.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {sender.errors.length > 0 && (
          <ul className="list-inside list-disc space-y-0.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {sender.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}

        {/* Above Send, so Send is the last thing on every screen: under the
            dialog on desktop (portaled), and the end of the content on a
            phone. The rare alternative comes before the main action, and
            an edit doesn't end on a red "request removal". */}
        {canRequestRemoval && (
          <p className="text-center">
            <button type="button" onClick={() => setRemovalOpen(true)} className="cursor-pointer text-sm text-red-600 hover:underline">
              Closed for good? Request removal
            </button>
          </p>
        )}

        {/* Not while the removal panel is up: a portaled button isn't inside
            this block's `hidden`, so it would stay on screen beside it. */}
        {sendSlot ? !removalOpen && createPortal(sendButton, sendSlot) : sendButton}
      </div>

      {canRequestRemoval && (
        <div className={removalOpen ? '' : 'hidden'}>
          <RemovalRequest
            listing={{ id: item.id, name: item.name }}
            turnstileToken={sender.turnstileToken}
            canSubmit={!TURNSTILE_ACTIVE || !!sender.turnstileToken}
            resetTurnstile={sender.resetTurnstile}
            honeypot={sender.honeypot}
            submitterEmail={sender.submitterEmail}
            onSubmitterEmailChange={sender.setSubmitterEmail}
            onCancel={removalControlled ? undefined : () => setRemovalOpen(false)}
            onDone={sender.markRemovalDone}
            // Where Send was: the same slot, the same button. Only while
            // this screen shows — hidden, it stays mounted (so a typed
            // reason survives), and a portaled button would escape the
            // `hidden` around it.
            submitSlot={removalOpen ? sendSlot : null}
            submitClassName={SUBMIT_PILL}
          />
        </div>
      )}

      {/* One challenge for both Send and a removal request; kept mounted
          across the swap so a pending challenge isn't lost (see
          ListingForm's identical note). */}
      {!sharedTurnstile && <TurnstileWidget ref={ownTurnstileRef} onVerify={setOwnTurnstileToken} />}
    </div>
  )
}
