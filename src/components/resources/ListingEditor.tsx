'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, fieldIsVisible, resolveCapabilities, selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { editorRows, opensInPlace, rowChanged, rowIsEmpty, rowSummary, type EditorRow, type EditorValues } from '@/lib/editorRows'
import { sameFieldValue } from '@/lib/listingDiff'
import { isMinyanim, type Minyan } from '@/lib/davening'
import { mergeMinyanimBox, minyanimForBox } from '@/lib/minyanimBox'
import { minyanWriting, timeText } from '@/lib/minyanText'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { initialsOf } from '@/lib/listingRow'
import { useCommunitySlug } from '@/lib/communityContext'
import { formatPhone } from '@/lib/validation'
import { ui } from '@/lib/uiConfig'
import { schedulesKey } from '@/lib/schedules'
import { scrollingAncestor } from '@/lib/scrollingAncestor'
import CategoryIcon from '@/components/CategoryIcon'
import ImageUploadField from '@/components/ImageUploadField'
import AddressInput from '@/components/intake/AddressInput'
import SchedulesInput from '@/components/intake/SchedulesInput'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget from '@/components/TurnstileWidget'
import { CheckIcon, ChevronRightIcon, PlusIcon } from '@/components/icons'
import RemovalRequest from './RemovalRequest'
import { DetailFieldInput } from './ListingForm'
import ContactsEditor from './ContactsEditor'
import ItemsEditor, { itemLists } from './ItemsEditor'
import MinyanBoxEditor from './MinyanBoxEditor'
import { useListingDraft, type ListingDraft } from './useListingDraft'
import { TURNSTILE_ACTIVE, useListingSubmit, type SendVia } from './useListingSubmit'
import { SUBMIT_PILL } from './submitPill'

// ── Suggest an edit, the whole listing (agreed Oct 11, canvas page "editor") ─
// The listing's own boxes, in the listing's order, one row each: its
// heading, what it says now, and a tap to change it (editorRows). A row
// opens that one box, with the editor its own Edit opens (BoxEditor's
// fields, a shul's MinyanBoxEditor), and Done brings you back to the list
// with the row marked Changed. Send counts them. Boxes the listing doesn't
// show yet are one line each under "Not on the listing yet".
//
// The same list adds a place: started from Google, or empty, with what's
// needed marked Needed and Send waiting for it.
//
// One task per screen (the user, Oct 10), so nothing else on the list: no
// email box, no "Reviewed by a moderator" line (the Sent screen says it),
// and Request removal is in the listing's ••• menu, not at the foot of the
// edit.

/** A step inside the editor, for the host's header: a row open on its own
 *  screen (or a minyan, a person in one) has a title; a row open where it
 *  is has none, the header keeps its own, and Back closes the row. */
export type EditorStep = { title?: string; back: () => void }

type Props = {
  /** The listing being edited. Omitted, the editor adds a new one, starting
   *  from `draft` (a Google pick, see ListingAdd) or empty. */
  item?: DirectoryResource
  category: CategoryConfig
  /** A draft the host already started (ListingAdd's, filled from Google). */
  draft?: ListingDraft
  /** Adding only: the draft came from a Google pick. */
  fromGoogle?: boolean
  /** Adding only: the category's listings, to say when what's being added
   *  looks like one that's already there. */
  existingListings?: DirectoryResource[]
  /** Leaves the editor: Done after sending. */
  onClose: () => void
  /** Where the foot's button goes when the host wants it outside the
   *  scrolling content (the desktop dialog floats it under the dialog). */
  sendSlot?: HTMLElement | null
  /** Where the title goes: the host's own header row, beside Back. */
  titleSlot?: HTMLElement | null
  sharedTurnstile?: { token: string; reset: () => void }
  onRemovalOpenChange?: (open: boolean) => void
  /** Whether the Request removal screen is showing, when the host owns it
   *  (the ••• menu's Request removal opens it). */
  removalOpen?: boolean
  /** A row opened (or a minyan, a person inside one): its title and the way
   *  back, for the host's header and Back; null on the list. */
  onStep?: (step: EditorStep | null) => void
  /** See useListingSubmit. */
  via?: SendVia
  onSent?: (body: unknown) => void
  /** The admin console's "+ Add listing": Send puts it live straight away
   *  (/api/admin/listings, see useListingSubmit), with no challenge, and
   *  closes the editor once it's in. */
  adminSubmit?: { token: string }
  /** The category editor's Preview: Send builds the listing here and hands
   *  it over instead of sending anything, and the address box doesn't call
   *  Google. */
  onPreviewSend?: (listing: DirectoryResource) => void
}

type Lookalike = { listing: DirectoryResource; reason: string }

/** The first listing that looks like the one being added, and why: the
 *  same Google place (certain), the same link in one of its link fields
 *  (near-certain), or the same name (likely). Exported for its tests. */
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
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[14px] text-amber-900">
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

const inputClass = 'h-11.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15.5px] text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none'
const fieldLabel = 'mb-1.5 block text-[14px] font-bold text-slate-700'

/** A choice of a few as big buttons ("Meat", "Dairy", "Parve"), the way
 *  the minyan editor's days are: one replaces the other for a single
 *  choice, several can be on for a multi-choice. */
function ChoiceButtons({ field, value, onChange }: { field: CategoryField; value: unknown; onChange: (v: unknown) => void }) {
  const chosen = selectValues(value)
  const known = new Set((field.options ?? []).map((o) => o.value))
  const options = [...(field.options ?? []), ...chosen.filter((v) => !known.has(v)).map((v) => ({ value: v, label: v }))]
  function pick(v: string) {
    const on = chosen.includes(v)
    if (field.multiSelect) onChange(on ? chosen.filter((x) => x !== v) : [...chosen, v])
    else onChange(on ? '' : v)
  }
  return (
    <div>
      <p className={fieldLabel}>{field.label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={field.label}>
        {options.map((o) => {
          const on = chosen.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => pick(o.value)}
              className={`h-10 cursor-pointer rounded-full border-[1.5px] px-4 text-[14.5px] font-bold ${on ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 bg-white text-slate-600'}`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A few choices are buttons; a long list, or one that takes "Other", the
 *  ordinary picker. */
const asButtons = (f: CategoryField) => f.type === 'select' && !f.allowOther && (f.options?.length ?? 0) > 0 && (f.options?.length ?? 0) <= 6

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

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
  onStep,
  via,
  onSent,
  adminSubmit,
  onPreviewSend,
}: Props) {
  // Adding: a blank listing stands in for `item`, so the reads below don't
  // each need a guard; `creating` switches off what only makes sense for an
  // edit (Changed marks).
  const creating = !itemProp
  const item: DirectoryResource = itemProp ?? { id: '', category: category.id, name: '', anchorId: 'all', distance: 0, address: '' }
  const ownDraft = useListingDraft(category, itemProp)
  const draft = draftProp ?? ownDraft
  const { hasAddress, hasPhone, details, setDetail } = draft
  const { ownTurnstileRef, setOwnTurnstileToken, ...sender } = useListingSubmit({ mode: creating ? 'create' : 'edit', existing: itemProp, sharedTurnstile, via, onSent, adminSubmit, onAdminSubmitted: onClose })
  // Nothing goes out from the admin console's two uses, so no challenge.
  const challenged = !adminSubmit && !onPreviewSend
  const verifying = challenged && sender.verifying
  const [openId, setOpenId] = useState<string | null>(null)
  // A step inside a row (a minyan, a person): its title and Back, and
  // which field it belongs to, so the row shows only that one.
  const [child, setChild] = useState<(EditorStep & { key: string }) | null>(null)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [removalOpenState, setRemovalOpenState] = useState(false)
  const removalControlled = removalOpenProp !== undefined
  const removalOpen = removalOpenProp ?? removalOpenState

  const values: EditorValues = { name: draft.name, address: hasAddress ? draft.address : '', phone: hasPhone ? draft.phone : '', details }
  const rows = editorRows(category, details)
  const row = rows.find((r) => r.id === openId) ?? null
  const rowTitle = (r: EditorRow) => (r.kind === 'name' ? draft.name.trim() || 'Name' : r.title)

  // ── What the host's header shows ──────────────────────────────────────
  // A short row opens where it is, inside its own card; a row holding a
  // list (the dishes, a week of hours, the minyanim) on its own screen
  // (agreed Oct 11, canvas page "editorlook").
  const inPlace = row !== null && opensInPlace(row)
  const closeRow = () => setOpenId(null)
  const step: EditorStep | null = removalOpen ? null : (child ?? (row ? (inPlace ? { back: closeRow } : { title: rowTitle(row), back: closeRow }) : null))
  // The host asks for Back through a function that stays the same, so
  // the latest step's own Back is kept in a ref, set after each render.
  const stepBack = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    stepBack.current = step?.back ?? (() => {})
  })
  const stepTitle = step?.title ?? null
  const stepKey = step === null ? null : (stepTitle ?? `in-place:${openId}`)
  useEffect(() => {
    onStep?.(stepKey === null ? null : { title: stepTitle ?? undefined, back: () => stepBack.current() })
  }, [stepKey, stepTitle, onStep])
  // The open card into view, the rows around it where they were.
  const openCard = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (inPlace) openCard.current?.scrollIntoView?.({ block: 'nearest' })
  }, [inPlace, openId])
  // A row's own screen swaps out the list inside the same scroll region,
  // which kept its offset: opened from low in the list, Main dishes
  // started at its last dish, "Add a dish" out of sight. It starts at its
  // top; back on the list, the row it came from is in view. Before paint,
  // so the wrong offset never shows.
  const rootRef = useRef<HTMLDivElement>(null)
  const cameFrom = useRef<string | null>(null)
  const screenOpen = row !== null && !inPlace
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (screenOpen) {
      cameFrom.current = openId
      const region = scrollingAncestor(root)
      if (region) region.scrollTop = 0
      else if (root.getBoundingClientRect().top < 0) root.scrollIntoView?.({ block: 'start' })
    } else if (cameFrom.current) {
      // A filled row, or its line under "Not on the listing yet".
      const ids = [`editor-row-${cameFrom.current}`, `editor-add-${cameFrom.current}`]
      cameFrom.current = null
      const rowButton = [...root.querySelectorAll<HTMLElement>('[data-opens]')].find((el) => ids.includes(el.dataset.testid ?? ''))
      rowButton?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [screenOpen, openId])
  useEffect(() => () => onStep?.(null), [onStep])
  // Each field's own way to report its step, the same function every time.
  const stepFor = useMemo(
    () => Object.fromEntries(category.detailFields.map((f) => [f.key, (s: EditorStep | null) => setChild(s ? { ...s, key: f.key } : null)])),
    [category.detailFields],
  )

  // ── A shul's minyanim: ids for the rows stored without one ────────────
  // The box editor opens a minyan by its id. Given once, by position, to
  // the stored rows and to the draft's while it still has them unchanged.
  const [ids] = useState(() => {
    const f = category.detailFields.find((x) => x.type === 'minyanim')
    const n = f && isMinyanim(itemProp?.[f.key]) ? (itemProp![f.key] as Minyan[]).length : 0
    return Array.from({ length: n }, () => crypto.randomUUID())
  })
  const withIds = (list: Minyan[]) => list.map((m, i) => (m.id || !ids[i] ? m : { ...m, id: ids[i] }))
  const storedMinyanim = (key: string) => withIds(isMinyanim(item[key]) ? (item[key] as Minyan[]) : [])
  const draftMinyanim = (key: string) => withIds(isMinyanim(details[key]) ? (details[key] as Minyan[]) : [])

  // ── Sent ──────────────────────────────────────────────────────────────
  if (sender.done) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-8 text-center" role="status" data-testid="editor-sent">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckIcon className="h-8 w-8 text-emerald-700" />
        </span>
        <p className="text-[22px] font-extrabold text-ink">Sent</p>
        <p className="text-[15.5px] text-slate-700">
          {sender.doneKind === 'removal' ? 'An admin checks a removal before anything changes.' : 'An admin checks it, usually within a day.'}
        </p>
        <button type="button" onClick={onClose} className={`${SUBMIT_PILL} mt-6`}>
          Done
        </button>
      </div>
    )
  }

  // ── What's changed, and what's still needed ───────────────────────────
  const changed = new Set(creating ? [] : rows.filter((r) => rowChanged(r, item, values)).map((r) => r.id))
  // Adding: what a listing can't go without, the same rules the server
  // applies (resourceStore's validateSubmission), so Send is never on for
  // something that would be refused.
  const visible = (f: CategoryField) => fieldIsVisible(f, details)
  const requiredMissing = creating ? category.detailFields.filter((f) => f.required && visible(f) && isBlank(details[f.key])) : []
  const missing = creating
    ? [!draft.name.trim() && 'Name', hasAddress && !draft.address.trim() && 'Address', ...requiredMissing.map((f) => f.label)].filter((x): x is string => !!x)
    : []
  const needed = (r: EditorRow) =>
    creating &&
    ((r.kind === 'name' && !draft.name.trim()) || (r.kind === 'contact' && hasAddress && !draft.address.trim()) || r.fields.some((f) => requiredMissing.includes(f)))
  const nothingToSend = creating ? missing.length > 0 : changed.size === 0

  async function send() {
    if (nothingToSend || sender.submitting || verifying) return
    sender.setErrors([])
    if (onPreviewSend) {
      onPreviewSend({
        id: item.id || `preview-${crypto.randomUUID()}`,
        category: category.id,
        name: draft.name,
        anchorId: hasAddress ? 'all' : 'community',
        distance: 0,
        address: hasAddress ? draft.address : '',
        phone: hasPhone ? draft.phone : '',
        geo: hasAddress ? draft.coords : null,
        ...draft.visibleDetails(),
      })
      return
    }
    await sender.submit(draft.buildSubmission())
  }

  const sendLabel = sender.submitting
    ? 'Sending…'
    : nothingToSend
      ? creating
        ? `Still needed: ${missing.join(', ')}`
        : 'No changes yet'
      : verifying
        ? 'Verifying…'
        : creating
          ? adminSubmit
            ? 'Add listing'
            : 'Send'
          : `Send ${changed.size} change${changed.size === 1 ? '' : 's'}`
  const foot = (button: ReactNode) => (sendSlot ? !removalOpen && createPortal(button, sendSlot) : button)
  const errors = sender.errors.length > 0 && (
    <ul className="list-inside list-disc space-y-0.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {sender.errors.map((err, i) => (
        <li key={i}>{err}</li>
      ))}
    </ul>
  )

  const canRequestRemoval = !creating && ui.contributions.report && resolveCapabilities(category.capabilities).report
  const setRemovalOpen = (open: boolean) => {
    setRemovalOpenState(open)
    onRemovalOpenChange?.(open)
  }

  const title = <h2 className="truncate font-semibold text-slate-900">{removalOpen ? 'Request removal' : (stepTitle ?? (creating ? '' : 'Suggest an edit'))}</h2>
  const photo = String(details[PHOTO_FIELD_KEY] ?? '').trim()

  // ── The list ──────────────────────────────────────────────────────────
  // Each row its own white card (Oct 11, canvas page "editorlook"): flat on
  // the page's gray, the rows read as more of the listing rather than
  // things to tap. The same › on every row, whatever it opens.
  const tags = (r: EditorRow) => (
    <>
      {changed.has(r.id) && <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[12.5px] font-extrabold text-amber-800">Changed</span>}
      {needed(r) && <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-[12.5px] font-extrabold text-red-700">Needed</span>}
    </>
  )
  // A short row, open: its fields inside its card, Done under them. Its
  // heading closes it too.
  const openInPlace = (r: EditorRow) => (
    <div ref={openCard} data-testid={`editor-open-${r.id}`} className="scroll-my-4 space-y-4 rounded-2xl border-[1.5px] border-slate-400 bg-white px-4 pt-2.5 pb-4 shadow-sm">
      <button type="button" onClick={closeRow} aria-expanded="true" className="flex min-h-11 w-full cursor-pointer items-center gap-3 text-left">
        <span className="min-w-0 flex-1 text-[16px] font-extrabold text-slate-900">{rowTitle(r)}</span>
        {tags(r)}
        <ChevronRightIcon className="h-4 w-4 shrink-0 -rotate-90 text-slate-500" />
      </button>
      {rowBody(r)}
      <button type="button" onClick={closeRow} className="h-11 w-full cursor-pointer rounded-full border border-slate-300 bg-white text-[15px] font-bold text-primary">
        Done
      </button>
    </div>
  )
  const filled = rows.filter((r) => !rowIsEmpty(r, values) || needed(r))
  const empty = rows.filter((r) => rowIsEmpty(r, values) && !needed(r))
  const listScreen = (
    <div className="space-y-4" data-testid="editor-list">
      {creating && fromGoogle && <p className="-mt-1 text-[14px] text-muted">Filled in from Google</p>}
      {adminSubmit && <p className="-mt-1 text-[14px] text-muted">Goes live as soon as you add it, with no review.</p>}
      {creating && existingListings && <Lookalike existing={existingListings} draft={draft} category={category} />}
      <ul className="space-y-2">
        {filled.map((r) => {
          if (inPlace && r.id === openId) return <li key={r.id}>{openInPlace(r)}</li>
          const isChanged = changed.has(r.id)
          const summary = r.kind === 'name' ? rowSummary(r, values, timeText) : rowSummary(r, values, timeText) || (needed(r) ? 'Not added yet' : '')
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                data-testid={`editor-row-${r.id}`}
                // Where it opens, for tests; nothing on screen says (the user, Oct 11).
                data-opens={opensInPlace(r) ? 'here' : 'screen'}
                className={`flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-left ${isChanged ? 'border-amber-200 bg-yellow-50' : 'border-slate-200 bg-white'}`}
              >
                {r.kind === 'name' && (
                  <CategoryIcon
                    icon={category.icon}
                    categoryId={category.id}
                    iconImageUrl={photo || undefined}
                    initials={draft.name.trim() ? initialsOf(draft.name) : undefined}
                    color="#94a3b8"
                    className="h-11 w-11 shrink-0 text-lg"
                    sizePx={44}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-extrabold text-slate-900">{rowTitle(r)}</span>
                  {summary && <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-muted">{summary}</span>}
                </span>
                {tags(r)}
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </li>
          )
        })}
      </ul>
      {empty.length > 0 && (
        <div data-testid="editor-empty">
          <p className="pb-1 text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-muted">Not on the listing yet</p>
          {/* Plain lines on the gray, so they don't read as boxes the
              listing has. */}
          <ul className="space-y-1">
            {empty.map((r) => (
              <li key={r.id}>
                {inPlace && r.id === openId ? (
                  openInPlace(r)
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenId(r.id)}
                    data-testid={`editor-add-${r.id}`}
                    data-opens={opensInPlace(r) ? 'here' : 'screen'}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-2 text-left text-[15px] font-bold text-primary"
                  >
                    <PlusIcon className="h-4 w-4 shrink-0" />
                    {r.title}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {errors}
      {foot(
        <button type="button" onClick={send} disabled={nothingToSend || sender.submitting || verifying} className={SUBMIT_PILL}>
          {sendLabel}
        </button>,
      )}
    </div>
  )

  // ── One row ───────────────────────────────────────────────────────────
  // Declarations, not consts: the list above opens a short row in place,
  // so it calls these before they're reached.
  function fieldInput(f: CategoryField, label?: string) {
    return f.type === 'contacts' ? (
      <ContactsEditor key={f.key} field={f} value={details[f.key]} onChange={(v) => setDetail(f.key, v)} onStep={stepFor[f.key]} place={item.name || draft.name} />
    ) : asButtons(f) ? (
      <ChoiceButtons key={f.key} field={f} value={details[f.key]} onChange={(v) => setDetail(f.key, v)} />
    ) : (
      <DetailFieldInput key={f.key} field={f} labelOverride={label} value={details[f.key]} onChange={(v) => setDetail(f.key, v)} />
    )
  }

  function rowBody(r: EditorRow): ReactNode {
    const shown = r.fields.filter(visible)
    // A minyan or a person open: just that.
    const only = child ? shown.filter((f) => f.key === child.key) : shown
    if (r.kind === 'name') {
      return (
        <>
          <div>
            <label htmlFor="edit-name" className={fieldLabel}>
              Name
            </label>
            <input id="edit-name" value={draft.name} onChange={(e) => draft.setName(e.target.value)} autoFocus={creating && !draft.name} className={inputClass} />
          </div>
          {shown.map((f) =>
            f.type === 'image' ? (
              <div key={f.key}>
                <p className={fieldLabel}>{f.label}</p>
                <ImageUploadField value={photo} onChange={(v) => setDetail(f.key, v)} uploadUrl="/api/submissions/photo" shape="circle" showRepositionHint={false} collapseUrlInput />
              </div>
            ) : (
              fieldInput(f)
            ),
          )}
        </>
      )
    }
    if (r.kind === 'contact') {
      return (
        <>
          {hasAddress && (
            <div>
              <label htmlFor="edit-address" className={fieldLabel}>
                Address
              </label>
              <AddressInput
                id="edit-address"
                value={draft.address}
                onChange={draft.setAddress}
                onCoords={draft.setCoords}
                onPlaceSelect={draft.handlePlaceSelect}
                disableAutocomplete={!!onPreviewSend}
                placeholder={draft.syncEligible ? 'Search by business name or address…' : 'Start typing an address…'}
              />
            </div>
          )}
          {hasPhone && (
            <div>
              <label htmlFor="edit-phone" className={fieldLabel}>
                Phone
              </label>
              <input id="edit-phone" type="tel" value={draft.phone} onChange={(e) => draft.setPhone(formatPhone(e.target.value))} placeholder="(215) 555-0100" className={inputClass} />
            </div>
          )}
          {shown.map((f) => fieldInput(f))}
        </>
      )
    }
    if (r.kind === 'items') {
      const f = r.fields[0]
      const now = itemLists(details, f.key)
      return (
        <ItemsEditor
          field={f}
          original={itemLists(item as Record<string, unknown>, f.key)}
          always={now.always}
          sometimes={now.sometimes}
          onChange={(next) => {
            setDetail(f.key, next.always)
            setDetail(`${f.key}_sometimes`, next.sometimes)
          }}
        />
      )
    }
    if (r.kind === 'minyans') {
      const f = r.fields[0]
      const all = draftMinyanim(f.key)
      return (
        <MinyanBoxEditor
          original={minyanimForBox(storedMinyanim(f.key), r.box!)}
          initial={minyanimForBox(all, r.box!)}
          box={r.box!}
          boxTitle={r.title}
          place={item.name || draft.name}
          writing={minyanWriting}
          onStep={stepFor[f.key]}
          onChange={(list) => setDetail(f.key, mergeMinyanimBox(all, r.box!, list))}
          send={() => null}
        />
      )
    }
    if (r.kind === 'schedules') {
      const key = schedulesKey(r.fields[0].key)
      return <SchedulesInput value={details[key]} onChange={(v) => setDetail(key, v)} />
    }
    if (r.kind === 'audience') {
      // The section's hours and note, written or not; anything else (a
      // phone, an email) once it's there, or once someone adds it.
      const always = (f: CategoryField) => f.type === 'hours' || f.type === 'textarea'
      const has = (f: CategoryField) => String(details[f.key] ?? '').trim() !== '' || (item[f.key] !== undefined && String(item[f.key]).trim() !== '')
      const on = only.filter((f) => always(f) || has(f) || revealed[f.key])
      const off = only.filter((f) => !on.includes(f))
      return (
        <>
          {on.map((f) => fieldInput(f, f.shortLabel))}
          {off.length > 0 && (
            <div className="flex flex-wrap gap-x-5">
              {off.map((f) => {
                const word = (f.shortLabel ?? f.label).toLowerCase()
                return (
                  <button key={f.key} type="button" onClick={() => setRevealed((x) => ({ ...x, [f.key]: true }))} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 text-[15px] font-bold text-primary">
                    <PlusIcon className="h-4 w-4" />
                    Add {article(word)} {word}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )
    }
    return <>{only.map((f) => fieldInput(f))}</>
  }

  // A row holding a list, open on its own screen, in the same white card.
  const rowScreen = row && !inPlace ? (
    <div className="space-y-4" data-testid={`editor-open-${row.id}`}>
      {row.kind !== 'name' && row.kind !== 'minyans' && !child && <p className="-mt-1 text-[14px] text-muted">{item.name || draft.name}</p>}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">{rowBody(row)}</div>
      {!child &&
        foot(
          <button type="button" onClick={() => setOpenId(null)} className={SUBMIT_PILL}>
            Done
          </button>,
        )}
    </div>
  ) : null

  return (
    <div ref={rootRef} className="space-y-4">
      {challenged && <Honeypot value={sender.honeypot} onChange={sender.setHoneypot} />}
      {titleSlot && (!creating || stepTitle || removalOpen) && createPortal(title, titleSlot)}
      {!titleSlot && !creating && !onStep && <div className="text-base">{title}</div>}
      <div className={removalOpen ? 'hidden' : ''}>{rowScreen ?? listScreen}</div>
      {/* Only while it's showing: it's opened from the listing's ••• menu
          now, not swapped with the edit. */}
      {canRequestRemoval && removalOpen && (
        <div>
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
            submitSlot={sendSlot}
            submitClassName={SUBMIT_PILL}
          />
        </div>
      )}
      {/* One challenge for Send and a removal request, kept mounted across
          the screens so a pending challenge isn't lost. */}
      {challenged && !sharedTurnstile && <TurnstileWidget ref={ownTurnstileRef} onVerify={setOwnTurnstileToken} />}
    </div>
  )
}

function Lookalike({ existing, draft, category }: { existing: DirectoryResource[]; draft: ListingDraft; category: CategoryConfig }) {
  const hit = findLookalike(existing, { name: draft.name, placeId: draft.placeId, details: draft.details }, category.detailFields)
  return hit ? <AlreadyListed listing={hit.listing} reason={hit.reason} category={category} /> : null
}
