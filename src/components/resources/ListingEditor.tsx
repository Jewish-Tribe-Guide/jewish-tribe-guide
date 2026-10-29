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
import { readSchedules, schedulesKey, weekPostDays } from '@/lib/schedules'
import { isNoMinyan, usualWeekRows, weekDates, weekPostFor, weekRowsFor, withNoMinyan, withWeekTimes } from '@/lib/thisWeekEdit'
import { useEditWeek } from '@/lib/useEditWeek'
import { minyanWriting, timeText } from '@/lib/minyanText'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { initialsOf } from '@/lib/listingRow'
import { useCommunitySlug } from '@/lib/communityContext'
import { usePreviewSend } from '@/lib/previewSend'
import { formatPhone } from '@/lib/validation'
import { ui } from '@/lib/uiConfig'
import { scrollingAncestor } from '@/lib/scrollingAncestor'
import CategoryIcon from '@/components/CategoryIcon'
import ImageUploadField from '@/components/ImageUploadField'
import AddressInput from '@/components/intake/AddressInput'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget from '@/components/TurnstileWidget'
import RemovalRequest from './RemovalRequest'
import { DetailFieldInput } from './DetailFieldInput'
import ContactsEditor from './ContactsEditor'
import ItemsEditor, { itemLists } from './ItemsEditor'
import { itemsField } from '@/lib/listingView'
import { MENU_LINK_FIELD, MENU_LINK_KEY, keepsMenuLink, readMenuLink } from '@/lib/menuLink'
import { itemWording } from '@/lib/itemMarks'
import MinyanBoxEditor from './MinyanBoxEditor'
import { useListingDraft, type ListingDraft } from './useListingDraft'
import { useListingSubmit, useTurnstileActive, type SendVia } from './useListingSubmit'
import { menuReadText, useMenuRead } from './useMenuRead'
import { PlusIcon } from '@/components/icons'
import { SUBMIT_PILL } from './submitPill'
import { ChangedTag, EditorAddLine, EditorEmptyRows, EditorOpenCard, EditorRowCard, EditorSent, editorFieldLabel, editorInputClass } from './editorParts'

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
// and Request removal is its own button beside Edit listing, not at the
// foot of the edit.

/** A step inside the editor, for the host's header: a row open on its own
 *  screen (or a minyan, a person in one) has a title; a row open where it
 *  is has none, the header keeps its own, and Back closes the row. */
export type EditorStep = { title?: string; back: () => void }

/** An editor whose host draws its way back (the desktop map's sidebar, in
 *  its search box): one step back, what that step is called, and whether
 *  anything's been changed and not yet sent. */
export type HostedEditor = { back: () => void; label: string; changed: boolean }

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
   *  (the edit bar's Request removal opens it). */
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
  /** Just these rows (editorRows ids), open, with Send under them: one
   *  box's own Edit (BoxEditSheet, Oct 15), the listing's other boxes
   *  left out. */
  onlyRows?: readonly string[]
  /** Whether anything's been changed and not yet sent, for a host that
   *  asks before something else takes the editor's place (the desktop map). */
  onHasChanges?: (has: boolean) => void
  /** Values to start from in place of the listing's own: the Dishes page's
   *  Edit starts from what its menu says (Oct 21). */
  preset?: Record<string, unknown>
  /** An admin saving straight to the listing (the Dishes page's Edit): no
   *  challenge, this button, sent this way, and `onSaved` once it's in. */
  adminSave?: { label: string; via: SendVia; onSaved: () => void }
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

const inputClass = editorInputClass
const fieldLabel = editorFieldLabel

/** A choice of a few as big buttons ("Meat", "Dairy", "Parve"), the way
 *  the minyan editor's days are: one replaces the other for a single
 *  choice, several can be on for a multi-choice. */
function ChoiceButtons({ field, value, onChange, labelHidden = false }: { field: CategoryField; value: unknown; onChange: (v: unknown) => void; labelHidden?: boolean }) {
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
      {!labelHidden && <p className={fieldLabel}>{field.label}</p>}
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
  onlyRows,
  onHasChanges,
  preset,
  adminSave,
}: Props) {
  // Adding: a blank listing stands in for `item`, so the reads below don't
  // each need a guard; `creating` switches off what only makes sense for an
  // edit (Changed marks).
  const creating = !itemProp
  const item: DirectoryResource = itemProp ?? { id: '', category: category.id, name: '', anchorId: 'all', distance: 0, address: '' }
  const ownDraft = useListingDraft(category, itemProp)
  const draft = draftProp ?? ownDraft
  const { hasAddress, hasPhone, details, setDetail } = draft
  // A preset goes in once, as if typed (as BoxEditor's).
  const [presetDone, setPresetDone] = useState(false)
  if (!presetDone && preset) {
    setPresetDone(true)
    // The phone is the listing's own, not a detail (a website's, Oct 22).
    for (const [k, v] of Object.entries(preset)) {
      if (k === 'phone') draft.setPhone(formatPhone(typeof v === 'string' ? v : ''))
      // A new place a list has, added from Kosher certification (Oct 22).
      else if (k === 'name' || k === 'address') (k === 'name' ? draft.setName : draft.setAddress)(typeof v === 'string' ? v : '')
      else setDetail(k, v)
    }
  }
  const { ownTurnstileRef, setOwnTurnstileToken, ...sender } = useListingSubmit({
    mode: creating ? 'create' : 'edit',
    existing: itemProp,
    sharedTurnstile,
    via: adminSave?.via ?? via,
    onSent: adminSave ? () => adminSave.onSaved() : onSent,
    adminSubmit,
    onAdminSubmitted: onClose,
  })
  // The category editor's Preview (previewSend.tsx): Send puts the listing
  // in the preview's list instead of sending it, and the address box
  // doesn't call Google.
  const preview = usePreviewSend()
  const turnstileActive = useTurnstileActive()
  // Nothing goes out from the admin console's two uses, so no challenge.
  const challenged = !adminSubmit && !adminSave && !preview
  const verifying = challenged && sender.verifying
  const [openId, setOpenId] = useState<string | null>(null)
  // A step inside a row (a minyan, a person): its title and Back, and
  // which field it belongs to, so the row shows only that one.
  const [child, setChild] = useState<(EditorStep & { key: string }) | null>(null)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [removalOpenState, setRemovalOpenState] = useState(false)
  const removalControlled = removalOpenProp !== undefined
  const removalOpen = removalOpenProp ?? removalOpenState

  // A new menu link, read for its dishes when its box is left (useMenuRead.ts).
  const community = useCommunitySlug()
  const { menuRead, readMenuLinkNow } = useMenuRead({
    enabled: challenged && keepsMenuLink(category),
    community,
    placeName: draft.name || item.name,
    stored: typeof item[MENU_LINK_KEY] === 'string' ? (item[MENU_LINK_KEY] as string) : undefined,
    token: sender.turnstileToken,
    needsToken: turnstileActive,
    resetToken: sender.resetTurnstile,
    onDishes: (names) => {
      const f = itemsField(category)
      if (!f) return 0
      const now = itemLists(details, f.key)
      const have = new Set([...now.always, ...now.sometimes].map((n) => n.trim().toLowerCase()))
      const fresh = names.filter((n, i) => !have.has(n.trim().toLowerCase()) && names.findIndex((m) => m.trim().toLowerCase() === n.trim().toLowerCase()) === i)
      if (fresh.length > 0) setDetail(f.key, [...now.always, ...fresh])
      return fresh.length
    },
  })

  const values: EditorValues = { name: draft.name, address: hasAddress ? draft.address : '', phone: hasPhone ? draft.phone : '', details }
  // A shul's "This week's schedule" row, on a listing's own edit, not one
  // box's or an admin's (thisWeekEdit.ts).
  const thisWeek = useEditWeek(!creating && !onlyRows && !adminSave && category.detailFields.some((f) => f.type === 'minyanim'), item.geo)
  const rows = editorRows(category, details, { week: thisWeek?.week })
  const row = rows.find((r) => r.id === openId) ?? null
  // A box's own Edit: its rows, in the listing's order.
  const boxRows = onlyRows ? rows.filter((r) => onlyRows.includes(r.id)) : null
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

  // Only an edit counts: an empty Add has nothing of anyone's to lose.
  const hasChanges = !creating && !sender.done && rows.some((r) => rowChanged(r, item, values))
  useEffect(() => {
    onHasChanges?.(hasChanges)
  }, [hasChanges, onHasChanges])

  // ── Sent ──────────────────────────────────────────────────────────────
  if (sender.done) {
    return <EditorSent message={sender.doneKind === 'removal' ? 'An admin checks a removal before anything changes.' : 'An admin checks it, usually within a day.'} onDone={onClose} />
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
          ? adminSave
            ? adminSave.label
            : adminSubmit
              ? 'Add listing'
              : 'Send'
          : adminSave
            ? adminSave.label
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

  const title = <h2 className="truncate font-semibold text-slate-900">{removalOpen ? 'Request removal' : (stepTitle ?? (creating ? '' : 'Edit listing'))}</h2>
  const photo = String(details[PHOTO_FIELD_KEY] ?? '').trim()

  // ── The list ──────────────────────────────────────────────────────────
  // Each row its own white card (Oct 11, canvas page "editorlook"): flat on
  // the page's gray, the rows read as more of the listing rather than
  // things to tap. The same › on every row, whatever it opens.
  const tags = (r: EditorRow) => (
    <>
      {changed.has(r.id) && <ChangedTag />}
      {needed(r) && <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-[12.5px] font-extrabold text-red-700">Needed</span>}
    </>
  )
  // A short row, open: its fields inside its card, Done under them. Its
  // heading closes it too.
  const openInPlace = (r: EditorRow) => (
    <EditorOpenCard cardRef={openCard} testId={`editor-open-${r.id}`} title={rowTitle(r)} tags={tags(r)} onClose={closeRow}>
      {rowBody(r)}
    </EditorOpenCard>
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
              <EditorRowCard
                onOpen={() => setOpenId(r.id)}
                testId={`editor-row-${r.id}`}
                opens={opensInPlace(r) ? 'here' : 'screen'}
                changed={isChanged}
                leading={
                  r.kind === 'name' && (
                    <CategoryIcon
                      icon={category.icon}
                      categoryId={category.id}
                      iconImageUrl={photo || undefined}
                      initials={draft.name.trim() ? initialsOf(draft.name) : undefined}
                      color="#94a3b8"
                      className="h-11 w-11 shrink-0 text-lg"
                      sizePx={44}
                    />
                  )
                }
                title={rowTitle(r)}
                summary={summary}
                tags={tags(r)}
              />
            </li>
          )
        })}
      </ul>
      {empty.length > 0 && (
        <EditorEmptyRows>
          {empty.map((r) => (
            <li key={r.id}>
              {inPlace && r.id === openId ? (
                openInPlace(r)
              ) : (
                <EditorAddLine onOpen={() => setOpenId(r.id)} testId={`editor-add-${r.id}`} opens={opensInPlace(r) ? 'here' : 'screen'} title={r.title} />
              )}
            </li>
          ))}
        </EditorEmptyRows>
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
  function fieldInput(f: CategoryField, label?: string, labelHidden = false) {
    return f.type === 'contacts' ? (
      <ContactsEditor key={f.key} field={f} value={details[f.key]} onChange={(v) => setDetail(f.key, v)} onStep={stepFor[f.key]} place={item.name || draft.name} />
    ) : asButtons(f) ? (
      <ChoiceButtons key={f.key} field={f} value={details[f.key]} onChange={(v) => setDetail(f.key, v)} labelHidden={labelHidden} />
    ) : (
      <DetailFieldInput key={f.key} field={f} labelOverride={label} labelHidden={labelHidden} value={details[f.key]} onChange={(v) => setDetail(f.key, v)} />
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
                disableAutocomplete={!!preview}
                placeholder={draft.syncEligible ? 'Search by business name or address…' : 'Start typing an address…'}
              />
            </div>
          )}
          {hasPhone && (
            <div>
              <label htmlFor="edit-phone" className={fieldLabel}>
                Phone
              </label>
              <input id="edit-phone" type="tel" value={draft.phone} onChange={(e) => draft.setPhone(formatPhone(e.target.value))} placeholder="(555) 555-0100" className={inputClass} />
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
        <>
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
          {/* Where the menu is, for "Full menu" (the user, Oct 17): with the
              dishes, under them. Not on the Dishes page, whose Reads has it. */}
          {itemWording(f).noun === 'dish' && !adminSave && (
            <div onBlur={() => readMenuLinkNow(details[MENU_LINK_KEY])}>
              {fieldInput(MENU_LINK_FIELD)}
              {menuRead && menuRead.url === readMenuLink(details[MENU_LINK_KEY]) && (
                <p role="status" data-testid="menu-read" className="mt-1.5 text-[14px] text-muted">
                  {menuReadText(menuRead)}
                </p>
              )}
            </div>
          )}
        </>
      )
    }
    if (r.kind === 'minyans' && r.week && thisWeek) {
      // The week the guide has, else the usual times to start from; a new
      // week only once they differ (withWeekTimes).
      const f = r.fields[0]
      const sk = schedulesKey(f.key)
      const week = r.week
      const usual = usualWeekRows(draftMinyanim(f.key), thisWeek.season, thisWeek.anchors)
      const post = weekPostFor(readSchedules(details[sk]), week)
      return (
        <MinyanBoxEditor
          original={weekRowsFor(weekPostFor(readSchedules(item[sk]), week), usual)}
          initial={weekRowsFor(post, usual)}
          box="this_week"
          boxTitle={r.title}
          heading={weekDates(week)}
          empty={isNoMinyan(post) ? 'No minyan this week' : undefined}
          place={item.name || draft.name}
          writing={minyanWriting}
          dayChoices={weekPostDays(week)}
          onStep={stepFor[f.key]}
          onChange={(list) => setDetail(sk, withWeekTimes(readSchedules(details[sk]), readSchedules(item[sk]), week, list, { usual, id: crypto.randomUUID(), now: new Date().toISOString() }))}
          send={() => null}
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
    // A row of one field whose label is the row's own title ("Hours",
    // "Denomination") says it once, in the title (the user, Oct 11).
    const same = (a?: string) => !!a && a.trim().toLowerCase() === r.title.trim().toLowerCase()
    return <>{only.map((f) => fieldInput(f, undefined, only.length === 1 && (same(f.label) || same(f.shortLabel))))}</>
  }

  // A row holding a list, open on its own screen, in the same white card.
  const rowScreen = row && !inPlace ? (
    <div className="space-y-4" data-testid={`editor-open-${row.id}`}>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">{rowBody(row)}</div>
      {!child &&
        foot(
          <div className="space-y-1">
            <button type="button" onClick={() => setOpenId(null)} className={SUBMIT_PILL}>
              Done
            </button>
            {noMinyanLink(row)}
          </div>,
        )}
    </div>
  ) : null

  // Under a week's Done, the rare case, quietly (the user, Oct 23): the
  // week set to none, and back to the list, where its row says so.
  function noMinyanLink(r: EditorRow): ReactNode {
    if (!r.week) return null
    const sk = schedulesKey(r.fields[0].key)
    if (isNoMinyan(weekPostFor(readSchedules(details[sk]), r.week))) return null
    return (
      <button
        type="button"
        onClick={() => {
          setDetail(sk, withNoMinyan(readSchedules(details[sk]), r.week!, { id: crypto.randomUUID(), now: new Date().toISOString() }))
          setOpenId(null)
        }}
        className="min-h-11 w-full cursor-pointer text-center text-[15px] font-bold text-primary hover:underline"
      >
        No minyan this week
      </button>
    )
  }

  // One box's rows, open, and Send: what its Edit opens. A row's own step
  // (a minyan, a person) shows just that, without Send, as on the list.
  const boxScreen = boxRows ? (
    <div className="space-y-4" data-testid="editor-box">
      {boxRows.map((r) => (
        <div key={r.id} className="space-y-4" data-testid={`editor-open-${r.id}`}>
          {boxRows.length > 1 && !child && <h3 className="text-[15px] font-extrabold text-slate-900">{rowTitle(r)}</h3>}
          {rowBody(r)}
        </div>
      ))}
      {!child && (
        <>
          {errors}
          {foot(
            <button type="button" onClick={send} disabled={nothingToSend || sender.submitting || verifying} className={SUBMIT_PILL}>
              {sendLabel}
            </button>,
          )}
        </>
      )}
    </div>
  ) : null

  return (
    <div ref={rootRef} className="space-y-4">
      {challenged && <Honeypot value={sender.honeypot} onChange={sender.setHoneypot} />}
      {titleSlot && (!creating || stepTitle || removalOpen) && createPortal(title, titleSlot)}
      {!titleSlot && !creating && !onStep && <div className="text-base">{title}</div>}
      <div className={removalOpen ? 'hidden' : ''}>{boxScreen ?? rowScreen ?? listScreen}</div>
      {/* Only while it's showing: it's opened from the edit bar's Request
          removal now, not swapped with the edit. */}
      {canRequestRemoval && removalOpen && (
        <div>
          <RemovalRequest
            listing={{ id: item.id, name: item.name }}
            turnstileToken={sender.turnstileToken}
            canSubmit={!turnstileActive || !!sender.turnstileToken}
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
