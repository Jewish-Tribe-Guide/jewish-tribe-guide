'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { changeableFields, changeLines, DAYS } from '@/lib/fieldChanges'
import { dayLabel, fmt12, isStructuredHours, type DayKey, type StructuredHours } from '@/lib/hours'
import { fmt } from '@/lib/submissionDiff'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { useIsMobile } from '@/lib/useIsMobile'
import { routes } from '@/lib/routes'
import { regularMinyanim } from '@/lib/schedules'
import type { TimesUpdate } from '@/lib/scheduleUpdate'
import type { PlaceRead, ReadItem } from '@/lib/messageReader'
import TurnstileWidget from '@/components/TurnstileWidget'
import { tellUsPlaceholder } from '@/lib/tellUs'
import ActionDialog from '@/components/resources/ActionDialog'
import MobileSheet from '@/components/resources/MobileSheet'
import UpdateTimesBox from '@/components/resources/UpdateTimesBox'
import ListingForm, { DetailFieldInput } from '@/components/resources/ListingForm'
import ListingEditor from '@/components/resources/ListingEditor'
import type { SendVia } from '@/components/resources/useListingSubmit'
import FindPlace from '@/components/FindPlace'
import TellUsItems, { changingItems, type CurrentItems } from '@/components/TellUsItems'
import type { PlaceSelectResult } from '@/components/intake/AddressInput'
import { TURNSTILE_ACTIVE } from '@/components/resources/useListingSubmit'

// "Saw something? Tell us" (agreed Oct 5, canvas TellSheet, TellAsk,
// TellResult, TellSent; changes agreed on v83/v84). One box: type it, paste
// a post, or add a photo, the way people already tell each other in the
// WhatsApp groups. The reader (/api/message/read) works out what it changes
// and the person sees the end result, store by store, before sending
// (feedback-show-end-result). Every change goes to an admin
// (/api/message/send), labelled as read by AI with what it came from.
//
//   - No "AI or by hand" first screen: the box is the default. Filling in
//     the form yourself stays one small link away ("Add a place"); from a
//     listing, "Edit the details myself" is a full button.
//   - No word "AI" on the first screen; the result says it read it.
//   - A shul's times open the shul card's own "Update their times" result,
//     already filled in, with its own Send.

type Brief = { id: string; name: string; address: string; category: string; categoryLabel: string }
type Lines = { lines: string[]; held: string[]; current?: CurrentItems; dishes?: boolean }
type Choice = { label: string; listingId: string; listing: Brief } & Lines

/** Where a Food place's dishes were read: its menu's page, or photos of it
 *  (url null). */
type MenuRead = { url: string | null; dishes: { name: string; quote: string; checked: boolean }[] }
type ItemsProposal = { kind: 'items'; listingId: string | null; listing: Brief | null; asWritten: string; chain: boolean; ask: { question: string; choices: Choice[] } | null; items: ReadItem[]; menu?: MenuRead } & Lines
/** A menu that couldn't be read, and why. */
type MenuFailed = { kind: 'menu'; listing: Brief | null; asWritten: string; failed: string }
type PlaceProposal = {
  kind: 'new_place'
  category: string | null
  categoryLabel: string | null
  place: PlaceRead
  items: ReadItem[]
  maybe: (Brief & Lines)[]
  /** What was read, as the add form's starting values. */
  seed: Partial<DirectoryResource> | null
}
type FieldsReading = {
  values: Record<string, unknown>
  before: Record<string, unknown>
  lines: string[]
  held: string[]
  notes: string[]
  askWhen: { key: string; question: string; oneDay: string } | null
}
type FieldsChoice = { label: string; listingId: string; listing: Brief } & FieldsReading
type FieldsProposal = { kind: 'fields'; listingId: string | null; listing: Brief | null; asWritten: string; ask: { question: string; choices: FieldsChoice[] } | null } & FieldsReading
type TimesProposal = { kind: 'times'; listing: Brief; item: DirectoryResource; minyanimKey: string | null; update: TimesUpdate | null }
type OtherProposal = { kind: 'ask_others' | 'not_update'; question?: string; note?: string | null; listing?: Brief | null }
type Proposal = ItemsProposal | FieldsProposal | PlaceProposal | TimesProposal | MenuFailed | OtherProposal
type Reading = { proposals: Proposal[]; photoUrls: string[] }

const MAX_PHOTOS = 3
// Photos, and a PDF (Oct 6): a shul's schedule often comes as a PDF flyer.
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']

/** A fields card's reading for the place it's about, or the branch picked. */
function fieldsReadingOf(p: FieldsProposal, picked: string | null): (FieldsReading & { listing: Brief }) | null {
  if (p.listing) return { ...p, listing: p.listing }
  const c = p.ask?.choices.find((x) => x.listingId === picked)
  return c ? { ...c, listing: c.listing } : null
}
const inputClass = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'

export default function TellUsSheet({
  isOpen,
  onClose,
  about,
  category,
  placeholder = tellUsPlaceholder(),
  onEditYourself,
  heading,
}: {
  isOpen: boolean
  onClose: () => void
  /** The listing it was opened from, if any. */
  about?: { id: string; name: string }
  /** The category page it was opened from, if any: what a place found with
   *  "Find the place" is added as, without asking. */
  category?: CategoryConfig
  placeholder?: string
  /** From a listing: "Edit the details myself", the listing's own editor. */
  onEditYourself?: () => void
  /** Its first step's title, when it was opened for one thing: a shul's
   *  "Update their times" opens "Update Mekor Habracha’s times" (Oct 6). */
  heading?: string
}) {
  const isMobile = useIsMobile()
  // Each step names itself: "Find the place", "Add to Food".
  const [stepTitle, setStepTitle] = useState<string | null>(null)
  // Back is the header's chevron, before the title, on every step that has
  // somewhere to go back to (asked for Oct 5: it was text at the bottom,
  // under a long form, and the listing's own edit already had the chevron).
  // The step says where it goes; the header only shows it.
  const [hasBack, setHasBack] = useState(false)
  const back = useRef<() => void>(() => {})
  const close = () => {
    setStepTitle(null)
    setHasBack(false)
    onClose()
  }
  const title = stepTitle ?? heading ?? (about ? `Tell us about ${about.name}` : 'Saw something? Tell us')
  const onBack = hasBack ? () => back.current() : undefined
  const body = (
    <TellUsBody
      key={isOpen ? 'open' : 'shut'}
      about={about}
      pageCategory={category}
      placeholder={placeholder}
      onEditYourself={onEditYourself}
      onClose={close}
      onTitle={setStepTitle}
      onBack={(go) => {
        back.current = go ?? (() => {})
        setHasBack(!!go)
      }}
    />
  )
  return isMobile ? (
    <MobileSheet isOpen={isOpen} onClose={close} title={title} onBack={onBack} draggable>
      {body}
    </MobileSheet>
  ) : (
    <ActionDialog isOpen={isOpen} onClose={close} title={title} onBack={onBack}>
      {body}
    </ActionDialog>
  )
}

// The form's title, by the category's plural name (Oct 5): "Add a Food"
// read badly, and "Add to Food", "Add to Synagogues", "Add to WhatsApp
// Groups" read well for every category, a place or not.
const addTitle = (c: CategoryConfig) => `Add to ${c.pluralLabel || c.label}`

type Step = 'write' | 'result' | 'sent' | 'find' | 'kind' | 'add' | 'edit'

export function TellUsBody({
  about,
  pageCategory,
  placeholder,
  onEditYourself,
  onClose,
  onTitle,
  onBack,
  backFromStart,
}: {
  about?: { id: string; name: string }
  pageCategory?: CategoryConfig
  placeholder: string
  onEditYourself?: () => void
  onClose: () => void
  onTitle: (title: string | null) => void
  /** Where the header's Back goes from this step, or nothing. */
  onBack: (go: (() => void) | null) => void
  /** Back from the first step, when the box was opened from another one:
   *  "Add a minyan"'s whole-schedule link (Oct 6). */
  backFromStart?: () => void
}) {
  const community = useCommunitySlug()
  const categories = useCategories()
  const [step, setStepOnly] = useState<Step>('write')
  // Filling it in yourself: the listing found, or the place to add, and
  // where Back goes from there.
  const [listings, setListings] = useState<DirectoryResource[] | null>(null)
  const [editing, setEditing] = useState<DirectoryResource | null>(null)
  const [adding, setAdding] = useState<{ category: CategoryConfig; place?: PlaceSelectResult; address?: string; coords?: { lat: number; lng: number } | null } | null>(null)
  const [findFrom, setFindFrom] = useState<Step>('write')
  const setStep = (next: Step, title: string | null = null) => {
    setStepOnly(next)
    onTitle(title)
  }
  const addable = (categories ?? []).filter((c) => c.kind === 'listing' && c.active !== false && resolveCapabilities(c.capabilities).add)
  // `back`: returning to the search from what was found, keeping where the
  // search itself goes back to.
  // What a place found is added as: the page's category, or the one the
  // reader put a new place in.
  const [findCategory, setFindCategory] = useState<CategoryConfig | undefined>(pageCategory)
  const openFind = (back = false, category = pageCategory) => {
    if (!back) {
      setFindFrom(step)
      setFindCategory(category)
    }
    setStep('find', 'Find the place')
    void loadListings()
  }
  const loadListings = async (): Promise<DirectoryResource[]> => {
    if (listings) return listings
    const all = await fetch(withCommunity('/api/resources', community))
      .then((r) => r.json())
      .then((j: { resources?: DirectoryResource[] }) => j.resources ?? [])
      .catch(() => [])
    setListings(all)
    return all
  }
  // "Change something else about Trader Joe's": the listing's own editor.
  const openEdit = async (id: string) => {
    const l = (await loadListings()).find((x) => x.id === id)
    if (!l) return
    setEditing(l)
    setEditFrom('result')
    setStep('edit', l.name)
  }
  const startAdding = (start: Omit<NonNullable<typeof adding>, 'category'>, category = findCategory) => {
    if (category) {
      setAdding({ ...start, category })
      setStep('add', addTitle(category))
    } else {
      setAdding({ ...start, category: addable[0] })
      setStep('kind', 'What kind of place?')
    }
  }
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([])
  const [reading, setReading] = useState<Reading | null>(null)
  const [busy, setBusy] = useState<'read' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [picked, setPicked] = useState<Record<number, string | null>>({})
  // A new place the reader found, being found on Google and filled in, and
  // the ones already sent that way.
  const [aiPlace, setAiPlace] = useState<{ card: number; query: string; values: Partial<DirectoryResource> } | null>(null)
  const [sentCards, setSentCards] = useState<Set<number>>(new Set())
  // A fields card's own fixes, and its answer to "from now on, or just once?"
  const [fixes, setFixes] = useState<Record<number, Record<string, unknown>>>({})
  const [whens, setWhens] = useState<Record<number, 'always' | 'once'>>({})
  // A store card's items as the person left them: removed, changed, added.
  const [itemEdits, setItemEdits] = useState<Record<number, ReadItem[]>>({})
  // Where Back goes from a listing's editor: the result it was opened from,
  // or the search.
  const [editFrom, setEditFrom] = useState<'find' | 'result'>('find')
  const [email, setEmail] = useState('')
  // One place at a time (agreed Oct 5): which one is showing, among those
  // not sent yet; and what's been sent, for the thank-you and its email.
  const [at, setAt] = useState(0)
  const [sentList, setSentList] = useState<{ name: string; what: string }[]>([])
  const [sentIds, setSentIds] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // A screenshot pasted, or photos dropped, anywhere in the box (asked for
  // Oct 5: on desktop, a photo could only be added with the button). The
  // count, not a flag: dragging over the textarea inside fires a leave
  // for the box itself.
  const [dragging, setDragging] = useState(0)
  const isMobile = useIsMobile()
  const textId = useId()
  const emailId = useId()
  const pending = useRef<(token: string) => void>(() => {})

  // Each preview is freed when its photo is removed, and the rest when the
  // box closes.
  const previews = useRef(new Set<string>())
  useEffect(() => {
    const live = previews.current
    return () => live.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const start = (kind: 'read' | 'send', run: (token: string) => void) => {
    setBusy(kind)
    setError(null)
    setAttempt((n) => n + 1)
    pending.current = run
    if (!TURNSTILE_ACTIVE) run('')
  }

  const read = async (token: string) => {
    try {
      const body = new FormData()
      body.set('text', text)
      for (const p of photos) body.append('file', p.file)
      if (about) body.set('listingId', about.id)
      body.set('turnstileToken', token)
      body.set('company', '')
      const res = await fetch(withCommunity('/api/message/read', community), { method: 'POST', body })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<Reading>
      if (!res.ok || !json.ok || !json.proposals) throw new Error(json.error ?? 'failed')
      setReading({ proposals: json.proposals, photoUrls: json.photoUrls ?? [] })
      setSentCards(new Set())
      setAt(0)
      setToast(null)
      setPicked({})
      setFixes({})
      setWhens({})
      setItemEdits({})
      setStep('result')
    } catch (e) {
      setError(e instanceof Error && e.message !== 'failed' ? e.message : 'Couldn’t read it right now. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  // What one card's Send files: its store (the one read, or the branch
  // picked) with what it carries, or its other fields. A new place goes with
  // the add form, and a shul's times with their own box.
  const proposals = reading?.proposals ?? []
  const payloadOf = (i: number): { stores: { listingId: string; items: ReadItem[]; menu?: { url: string | null } }[]; edits: { listingId: string; values: Record<string, unknown>; notes: string[] }[] } | null => {
    const p = proposals[i]
    if (p?.kind === 'items') {
      const id = p.listingId ?? picked[i] ?? null
      const read = p.listingId ? p : p.ask?.choices.find((c) => c.listingId === id)
      const items = itemEdits[i] ?? p.items
      return id && read && changingItems(read.current ?? { always: [], sometimes: [] }, items).length
        ? { stores: [{ listingId: id, items, ...(p.menu ? { menu: { url: p.menu.url } } : {}) }], edits: [] }
        : null
    }
    if (p?.kind === 'new_place' && picked[i] && p.maybe.find((m) => m.id === picked[i])?.lines.length) {
      return { stores: [{ listingId: picked[i]!, items: p.items }], edits: [] }
    }
    if (p?.kind === 'fields') {
      const r = fieldsReadingOf(p, picked[i] ?? null)
      if (!r || (r.askWhen && !whens[i])) return null
      const values = { ...r.values, ...fixes[i] }
      const notes = [...r.notes]
      if (r.askWhen && whens[i] === 'once') {
        delete values[r.askWhen.key]
        notes.push(r.askWhen.oneDay)
      }
      return Object.keys(values).length || notes.length ? { stores: [], edits: [{ listingId: r.listing.id, values, notes }] } : null
    }
    return null
  }
  /** A card's place and what it sent, for the counter and the thank-you. */
  const describe = (i: number): { name: string; what: string } => {
    const p = proposals[i]
    if (p?.kind === 'items') {
      const c = p.ask?.choices.find((x) => x.listingId === picked[i])
      const read = p.listing ? p : c
      const items = changingItems(read?.current ?? { always: [], sometimes: [] }, itemEdits[i] ?? p.items)
      return { name: (p.listing ?? c?.listing)?.name ?? (p.asWritten || 'A store'), what: items.map((x) => (x.availability === 'stopped' ? `− ${x.name}` : `+ ${x.name}`)).join(', ') }
    }
    if (p?.kind === 'fields') {
      const r = fieldsReadingOf(p, picked[i] ?? null)
      return { name: r?.listing.name ?? (p.asWritten || 'A place'), what: r ? r.lines.map((l) => l.split(':')[0]).join(', ') || 'A note' : '' }
    }
    if (p?.kind === 'new_place') {
      const same = p.maybe.find((m) => m.id === picked[i])
      return same ? { name: same.name, what: same.lines.join(', ') } : { name: p.place.name, what: 'New place' }
    }
    if (p?.kind === 'times') return { name: p.listing.name, what: 'Davening times' }
    if (p?.kind === 'menu') return { name: p.listing?.name ?? (p.asWritten || 'A place'), what: '' }
    return { name: '', what: '' }
  }
  const PLACES = new Set(['items', 'fields', 'new_place', 'times', 'menu'])
  // One card per place: a store's items and its hours, read as two
  // proposals, are one place to check and one Send (said Oct 5: several
  // changes to one listing stay together).
  const groups: number[][] = []
  const byPlace = new Map<string, number[]>()
  proposals.forEach((p, i) => {
    if (!PLACES.has(p.kind)) return
    const key = (p.kind === 'items' || p.kind === 'fields') && p.listingId ? p.listingId : p.kind === 'menu' && p.listing ? p.listing.id : `#${i}`
    const g = byPlace.get(key)
    if (g) g.push(i)
    else {
      byPlace.set(key, [i])
      groups.push(byPlace.get(key)!)
    }
  })
  const queue = groups.filter((g) => !g.every((i) => sentCards.has(i)))
  // Sending the last one shows the one before it (agreed Oct 5: 3 of 3 sent
  // is 2 of 2, the previous place).
  const pos = Math.min(at, Math.max(0, queue.length - 1))
  const cur = queue[pos]
  const describeAll = (g: number[]) => ({ name: describe(g[0]).name, what: g.map((i) => describe(i).what).filter(Boolean).join(', ') })
  // Waiting on a choice only the person can make: which branch, or "every
  // Wednesday or just this one?". The card's Send waits with it.
  const waiting = (i: number) => {
    const p = proposals[i]
    if ((p.kind === 'items' || p.kind === 'fields') && !p.listingId && p.ask && !picked[i]) return true
    return p.kind === 'fields' && !!fieldsReadingOf(p, picked[i] ?? null)?.askWhen && !whens[i]
  }
  const groupPayload = (g: number[]) => {
    if (g.some(waiting)) return null
    const parts = g.map(payloadOf).filter((x) => x !== null)
    return parts.length ? { stores: parts.flatMap((x) => x.stores), edits: parts.flatMap((x) => x.edits) } : null
  }
  const markSent = (g: number[], ids: string[]) => {
    setSentCards((s) => new Set([...s, ...g]))
    setSentList((l) => [...l, describeAll(g)])
    setSentIds((x) => [...x, ...ids])
    setToast(`Sent: ${describeAll(g).name}`)
    if (queue.every((q) => q === g)) setStep('sent')
  }

  const viaMessage: SendVia = ({ payload, submittedBy, company, turnstileToken }) =>
    fetch(withCommunity('/api/message/send', community), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, photoUrls: reading?.photoUrls ?? [], forms: [{ submission: payload }], email: submittedBy?.email ?? '', turnstileToken, company }),
    })

  const send = async (token: string, g: number[]) => {
    try {
      const res = await fetch(withCommunity('/api/message/send', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, photoUrls: reading?.photoUrls ?? [], ...groupPayload(g), turnstileToken: token, company: '' }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; ids?: string[] }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'failed')
      markSent(g, json.ids ?? [])
    } catch (e) {
      setError(e instanceof Error && e.message !== 'failed' ? e.message : 'That didn’t send. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const addPhotos = (files: FileList | File[] | null) => {
    if (!files) return
    const room = MAX_PHOTOS - photos.length
    const added = [...files].filter((f) => PHOTO_TYPES.includes(f.type)).slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))
    for (const a of added) previews.current.add(a.preview)
    setPhotos((ps) => [...ps, ...added])
  }

  const canRead = text.trim().length >= 3 || photos.length > 0

  // The email, asked once (agreed Oct 5): added to everything just sent.
  const done = async () => {
    if (email.trim() && sentIds.length) {
      setBusy('send')
      setError(null)
      const res = await fetch(withCommunity('/api/message/email', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: sentIds, email }),
      }).catch(() => null)
      const json = ((await res?.json().catch(() => null)) ?? {}) as { ok?: boolean; error?: string }
      setBusy(null)
      if (!res?.ok || !json.ok) return setError(json.error ?? 'That didn’t save. Please try again.')
    }
    onClose()
  }

  // Back from each step: what was read goes back to what was written, the
  // search to wherever it was opened from, a listing's editor to what was
  // read or to the search, and the form to the search. A layout effect, so
  // the header has the step's own Back before anything can be clicked: a
  // plain effect can run after a quick tap, which then went back from the
  // step before (the test caught it, about one run in three).
  useLayoutEffect(() => {
    const go: Record<Step, (() => void) | null> = {
      write: backFromStart ?? null,
      sent: null,
      result: () => setStep('write'),
      find: () => setStep(findFrom),
      kind: () => openFind(true),
      add: () => openFind(true),
      edit: () => (editFrom === 'result' ? setStep('result') : openFind(true)),
    }
    onBack(go[step])
  })

  if (step === 'sent') {
    return (
      <div className="space-y-3 p-1" data-testid="tell-us-sent">
        <p className="text-[17px] font-extrabold text-slate-900">Thank you</p>
        <p className="text-[14.5px] leading-snug text-slate-700">
          {sentList.length === 1 ? 'Your update is with an admin.' : `Your ${sentList.length} updates are with an admin.`} They check each one before it shows in the guide.
        </p>
        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {sentList.map((x, k) => (
            <li key={k} className="flex justify-between gap-3 py-2 text-[14px]">
              <span className="font-semibold text-slate-900">{x.name}</span>
              <span className="text-right text-slate-500">{x.what}</span>
            </li>
          ))}
        </ul>
        {sentIds.length > 0 && (
          <div>
            <label htmlFor={emailId} className="block text-[13px] font-semibold text-slate-700">
              Email me when {sentList.length === 1 ? 'it’s' : 'they’re'} on the guide <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input id={emailId} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-1`} autoComplete="email" />
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13.5px] text-red-700">
            {error}
          </p>
        )}
        <button type="button" disabled={busy === 'send'} onClick={() => void done()} className="w-full cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-[15px] font-bold text-white disabled:opacity-60">
          Done
        </button>
      </div>
    )
  }

  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files')
  const writing = step === 'write'
  return (
    <div
      className="relative space-y-3 p-1"
      data-testid="tell-us"
      onPaste={(e) => {
        if (!writing) return
        const files = [...e.clipboardData.files].filter((f) => PHOTO_TYPES.includes(f.type))
        if (files.length === 0) return
        e.preventDefault()
        addPhotos(files)
      }}
      onDragEnter={(e) => writing && hasFiles(e) && setDragging((n) => n + 1)}
      onDragLeave={(e) => writing && hasFiles(e) && setDragging((n) => Math.max(0, n - 1))}
      onDragOver={(e) => writing && hasFiles(e) && e.preventDefault()}
      onDrop={(e) => {
        if (!writing || !hasFiles(e)) return
        e.preventDefault()
        setDragging(0)
        addPhotos(e.dataTransfer.files)
      }}
    >
      {writing && dragging > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl border-[3px] border-dashed border-primary bg-blue-50/90" data-testid="tell-us-drop">
          <p className="text-[17px] font-extrabold text-primary">{photos.length >= MAX_PHOTOS ? `Up to ${MAX_PHOTOS} photos` : 'Drop to add the photo'}</p>
        </div>
      )}
      {step === 'write' && (
        <>
          <div className="rounded-xl border border-slate-300 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <label htmlFor={textId} className="sr-only">
              What did you see?
            </label>
            <textarea
              id={textId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={placeholder}
              className="block w-full resize-none rounded-t-xl border-0 bg-transparent px-3 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pb-2">
                {photos.map((p, i) => (
                  <div key={p.preview} className="relative">
                    {p.file.type === 'application/pdf' ? (
                      <span title={p.file.name} className="flex h-16 w-16 flex-col items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[12px] font-bold text-slate-600">
                        PDF
                        <span className="w-14 truncate text-center text-[10.5px] font-normal">{p.file.name}</span>
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- a local preview of the visitor's own photo
                      <img src={p.preview} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
                    )}
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => {
                        URL.revokeObjectURL(p.preview)
                        previews.current.delete(p.preview)
                        setPhotos((ps) => ps.filter((x) => x !== p))
                      }}
                      className="absolute -top-2 -right-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-slate-800 text-xs text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 px-2 py-1.5">
              <button
                type="button"
                disabled={photos.length >= MAX_PHOTOS}
                onClick={() => fileInput.current?.click()}
                className="cursor-pointer rounded-md px-2 py-1 text-[13.5px] font-semibold text-primary hover:bg-primary/5 disabled:cursor-default disabled:text-slate-400"
              >
                + Add a photo or PDF
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={PHOTO_TYPES.join(',')}
                multiple
                className="hidden"
                aria-label="Add a photo"
                onChange={(e) => {
                  addPhotos(e.target.files)
                  e.target.value = ''
                }}
              />
              <span className="text-[12px] text-slate-400">{photos.length ? `${photos.length} of ${MAX_PHOTOS} photos` : isMobile ? 'or paste one' : 'or paste or drop one'}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={!canRead || busy === 'read'}
            onClick={() => start('read', (token) => void read(token))}
            className="w-full cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-[15px] font-bold text-white disabled:cursor-default disabled:opacity-50"
          >
            {busy === 'read' ? 'Reading…' : 'See what changes'}
          </button>
          {onEditYourself && (
            <button type="button" onClick={onEditYourself} className="w-full cursor-pointer rounded-lg border-[1.5px] border-slate-300 px-4 py-2.5 text-[15px] font-bold text-slate-800 hover:bg-slate-50">
              Edit the details myself
            </button>
          )}
          {!about && addable.length > 0 && (
            <p className="text-center text-[13.5px] text-slate-600">
              Rather fill it in yourself?{' '}
              <button
                type="button"
                onClick={() => {
                  setAiPlace(null)
                  openFind()
                }}
                className="cursor-pointer font-semibold text-primary hover:underline">
                Find the place
              </button>
            </p>
          )}
        </>
      )}

      {step === 'result' && reading && (
        <>
          {toast && <p className="text-center text-[13.5px] font-bold text-emerald-700">{toast}</p>}
          {queue.length > 1 && cur !== undefined && (
            <div className="flex items-center gap-2" data-testid="tell-us-count">
              <button type="button" aria-label="Previous place" onClick={() => setAt((pos - 1 + queue.length) % queue.length)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
                ‹
              </button>
              <p className="flex-1 text-center text-[14px] font-bold text-slate-600">
                {describeAll(cur).name} · <span className="text-slate-900">{pos + 1} of {queue.length}</span>
              </p>
              <button type="button" aria-label="Next place" onClick={() => setAt((pos + 1) % queue.length)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
                ›
              </button>
            </div>
          )}
          <p className="text-[13.5px] leading-snug text-slate-600">
            Read by AI from what you sent. Check it, then send it. An admin checks it too.
          </p>
          {(cur === undefined ? proposals.map((_, i) => i).filter((i) => !PLACES.has(proposals[i].kind)) : cur).map((i, k, all) => {
            const p = proposals[i]
            return (
              <ResultCard
                key={i}
                p={p}
                head={k === 0}
                more={k === all.length - 1}
                picked={picked[i] ?? null}
                onPick={(id) => {
                  setPicked((x) => ({ ...x, [i]: id }))
                  setFixes((x) => ({ ...x, [i]: {} }))
                }}
                fixes={fixes[i] ?? {}}
                onFix={(key, v) => setFixes((x) => ({ ...x, [i]: { ...x[i], [key]: v } }))}
                when={whens[i] ?? null}
                onWhen={(w) => setWhens((x) => ({ ...x, [i]: w }))}
                categoryOf={(id) => categories?.find((c) => c.id === id)}
                onFill={() => {
                  if (p.kind !== 'new_place') return
                  setAiPlace({ card: i, query: [p.place.name, p.place.address].filter(Boolean).join(', '), values: p.seed ?? { name: p.place.name } })
                  openFind(false, categories?.find((c) => c.id === p.category))
                }}
                onTimesSent={() => markSent([i], [])}
                items={itemEdits[i] ?? (p.kind === 'items' ? p.items : [])}
                onItems={(next) => setItemEdits((x) => ({ ...x, [i]: next }))}
                onEditListing={(id) => void openEdit(id)}
                text={text}
                photoUrl={reading.photoUrls[0] ?? null}
                community={community}
              />
            )
          })}
          {cur !== undefined && (
            <div className="flex gap-2">
              {queue.length > 1 && (
                <button type="button" onClick={() => setAt((pos + 1) % queue.length)} className="cursor-pointer rounded-lg border border-slate-300 px-5 py-2.5 text-[15px] font-bold text-slate-800 hover:bg-slate-50">
                  Next
                </button>
              )}
              {cur.some((i) => proposals[i].kind === 'items' || proposals[i].kind === 'fields' || (proposals[i].kind === 'new_place' && picked[i])) && (
                <button
                  type="button"
                  disabled={busy === 'send' || !groupPayload(cur)}
                  onClick={() => start('send', (token) => void send(token, cur))}
                  className="flex-1 cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-[15px] font-bold text-white disabled:cursor-default disabled:opacity-50"
                >
                  {busy === 'send' ? 'Sending…' : 'Send'}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {step === 'find' && (
        <FindPlace
          key={aiPlace?.card ?? 'own'}
          listings={listings}
          initialQuery={aiPlace?.query}
          onListing={(l) => {
            setEditing(l)
            setEditFrom('find')
            // The editor says "Suggest an edit" itself.
            setStep('edit', l.name)
          }}
          onPlace={(place, address, coords) => startAdding({ place, address, coords })}
          onBlank={() => startAdding({})}
        />
      )}
      {step === 'kind' && adding && (
        <div className="space-y-2" data-testid="pick-kind">
          <p className="text-[14.5px] text-slate-700">{adding.place?.name ? `What kind of place is ${adding.place.name}?` : 'What kind of place is it?'}</p>
          <div className="flex flex-wrap gap-2">
            {addable.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setAdding({ ...adding, category: c })
                  setStep('add', addTitle(c))
                }}
                className="cursor-pointer rounded-full border border-slate-300 px-3.5 py-1.5 text-[14px] font-semibold text-slate-800 hover:bg-slate-50"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 'add' && adding && (
        <ListingForm
          key={`${adding.category.id}:${adding.place?.placeId ?? ''}`}
          category={adding.category}
          mode="create"
          seed={{ place: adding.place, address: adding.address, coords: adding.coords, values: aiPlace?.values }}
          openAll
          embedded
          onUp={() => openFind(true)}
          onSubmitted={onClose}
          // A place the reader found goes in labelled with what it was read
          // from, and the box goes back to the rest of what it read.
          via={aiPlace ? viaMessage : undefined}
          onSent={
            aiPlace
              ? (answer) => {
                  const ids = (answer as { ids?: string[] } | null)?.ids ?? []
                  setAiPlace(null)
                  setStep('result')
                  markSent([aiPlace.card], ids)
                }
              : undefined
          }
        />
      )}
      {step === 'edit' && editing && categories?.find((c) => c.id === editing.category) && (
        <ListingEditor item={editing} category={categories.find((c) => c.id === editing.category)!} onClose={onClose} />
      )}

      {error && (
        <p role="alert" className="text-[13.5px] text-red-700">
          {error}
        </p>
      )}
      {busy && TURNSTILE_ACTIVE && <TurnstileWidget key={attempt} onVerify={(token) => pending.current(token)} />}
    </div>
  )
}

function ChangeLines({ lines, held }: Lines) {
  return (
    <ul className="mt-1.5 space-y-0.5 text-[14px]">
      {lines.map((l) => (
        <li
          key={l}
          className={l.startsWith('+ ') ? 'font-semibold text-emerald-700' : l.startsWith('− ') ? 'text-red-700 line-through decoration-1' : 'font-semibold text-amber-800'}
        >
          {l.startsWith('− ') ? l.slice(2) : l}
        </li>
      ))}
      {held.map((h) => (
        <li key={h} className="text-[12.5px] text-slate-500">
          Not changed: {h}
        </li>
      ))}
    </ul>
  )
}

function ResultCard({
  p,
  head = true,
  more = true,
  picked,
  onPick,
  onFill,
  onTimesSent,
  items,
  onItems,
  onEditListing,
  text,
  photoUrl,
  community,
  fixes,
  onFix,
  when,
  onWhen,
  categoryOf,
}: {
  fixes: Record<string, unknown>
  onFix: (key: string, v: unknown) => void
  when: 'always' | 'once' | null
  onWhen: (w: 'always' | 'once') => void
  categoryOf: (id: string) => CategoryConfig | undefined
  p: Proposal
  /** Whether it heads its place's card, and ends it: the second of a
   *  place's two readings (its items, then its hours) shows under the
   *  first, without its name again. */
  head?: boolean
  more?: boolean
  picked: string | null
  onPick: (id: string | null) => void
  /** A new place: find it on Google and fill it in. */
  onFill: () => void
  /** A shul's times, sent with their own box. */
  onTimesSent: () => void
  /** A store card's items as the person has them now. */
  items: ReadItem[]
  onItems: (items: ReadItem[]) => void
  /** "Change something else about …": the listing's own editor. */
  onEditListing: (id: string) => void
  text: string
  photoUrl: string | null
  community: string
}) {
  const [timesOpen, setTimesOpen] = useState(true)
  const [timesSent, setTimesSent] = useState(false)
  // A place read as two parts is one card: the first open at the bottom,
  // the second joined to it.
  const card = `border-x border-slate-200 bg-white px-3.5 ${head ? 'rounded-t-xl border-t pt-3' : '-mt-3 pt-1'} ${more ? 'rounded-b-xl border-b pb-3' : 'pb-1'}`
  const short = (a: string) => a.split(',')[0]

  if (p.kind === 'items') {
    const chosen = p.listing ?? p.ask?.choices.find((c) => c.listingId === picked)?.listing ?? null
    const read = p.listing ? p : (p.ask?.choices.find((c) => c.listingId === picked) ?? null)
    return (
      <div className={`${card}`} data-testid="tell-us-card">
        {!head ? null : chosen ? (
          <PlaceHead name={chosen.name} sub={`${chosen.categoryLabel} · ${short(chosen.address)}`} />
        ) : (
          <p className="text-[15px] font-extrabold text-slate-900">{p.asWritten || 'A store'}</p>
        )}
        {p.ask && !p.listing && (
          <div className="mt-2">
            <p className="text-[14px] font-semibold text-slate-800">{p.ask.question}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {p.ask.choices.map((c) => (
                <button
                  key={c.listingId}
                  type="button"
                  aria-pressed={picked === c.listingId}
                  onClick={() => onPick(picked === c.listingId ? null : c.listingId)}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-[13.5px] ${picked === c.listingId ? 'border-primary bg-primary text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                >
                  {c.label || short(c.listing.address)}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* The store's items as the listing shows them, with what changes
            marked and "+ Add another item" under it (agreed Oct 5). */}
        {/* A Food place's dishes read off its menu: where, so it can be
            checked (agreed Oct 6). */}
        {p.menu && (
          <p className="mt-1.5 text-[13px] text-slate-600" data-testid="tell-us-menu">
            Read from{' '}
            {p.menu.url ? (
              <a href={p.menu.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                its menu ↗
              </a>
            ) : (
              'the photos of its menu'
            )}
            . Main dishes only, not the whole menu.
          </p>
        )}
        {read && <TellUsItems current={read.current ?? { always: [], sometimes: [] }} items={items} held={read.held} onChange={onItems} dishes={!!read.dishes} fromMenu={!!p.menu} />}
        {chosen && more && <ChangeSomethingElse name={chosen.name} onClick={() => onEditListing(chosen.id)} />}
        {!chosen && !p.ask && (
          <p className="mt-1 text-[13.5px] text-slate-600">
            {p.chain ? 'About the whole chain, not one store, so nothing changes in the guide.' : 'Couldn’t tell which store this is.'} Items: {p.items.map((i) => i.name).join(', ')}
          </p>
        )}
      </div>
    )
  }

  if (p.kind === 'fields') {
    const r = fieldsReadingOf(p, picked)
    const category = r ? categoryOf(r.listing.category) : undefined
    const fields = category ? changeableFields(category) : []
    const values = r ? { ...r.values, ...fixes } : {}
    const shown = r?.askWhen && when === 'once' ? Object.fromEntries(Object.entries(values).filter(([k]) => k !== r.askWhen!.key)) : values
    // Hours show as the week (WeekChange); everything else a line each.
    const isHours = (k: string) => fields.find((f) => f.key === k)?.type === 'hours'
    const lines = r ? changeLines(fields, r.before as DirectoryResource, Object.fromEntries(Object.entries(shown).filter(([k]) => !isHours(k)))) : []
    const notes = r ? [...r.notes, ...(r.askWhen && when === 'once' ? [r.askWhen.oneDay] : [])] : []
    return (
      <div className={`${card}`} data-testid="tell-us-card">
        {!head ? null : r ? <PlaceHead name={r.listing.name} sub={`${r.listing.categoryLabel} · ${short(r.listing.address)}`} /> : <p className="text-[15px] font-extrabold text-slate-900">{p.asWritten || 'A place'}</p>}
        {p.ask && !p.listing && (
          <div className="mt-2">
            <p className="text-[14px] font-semibold text-slate-800">{p.ask.question}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {p.ask.choices.map((c) => (
                <button
                  key={c.listingId}
                  type="button"
                  aria-pressed={picked === c.listingId}
                  onClick={() => onPick(picked === c.listingId ? null : c.listingId)}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-[13.5px] ${picked === c.listingId ? 'border-primary bg-primary text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                >
                  {c.label || short(c.listing.address)}
                </button>
              ))}
            </div>
          </div>
        )}
        {r?.askWhen && (
          <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2">
            <p className="text-[14px] font-semibold text-amber-900">{r.askWhen.question}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(
                [
                  ['always', 'From now on'],
                  ['once', 'Just this once'],
                ] as const
              ).map(([w, label]) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={when === w}
                  onClick={() => onWhen(w)}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-[13.5px] ${when === w ? 'border-primary bg-primary text-white' : 'border-amber-300 bg-white text-slate-800 hover:bg-amber-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {r && (lines.length > 0 || r.held.length > 0) && <ChangeLines lines={lines} held={r.held} />}
        {r && (
          <div className="mt-2 space-y-3">
            {Object.keys(shown).map((key) => {
              const f = fields.find((x) => x.key === key)
              if (!f) return null
              const was = fmt(r.before[key], f.field)
              return (
                <div key={key}>
                  {f.field ? (
                    f.type === 'hours' ? (
                      <>
                        <WeekChange label={f.label} before={r.before[key]} after={shown[key]} />
                        <HoursFix label={f.label}>
                          <DetailFieldInput field={f.field} value={shown[key]} onChange={(v) => onFix(key, v)} />
                        </HoursFix>
                      </>
                    ) : (
                      <DetailFieldInput field={f.field} value={shown[key]} onChange={(v) => onFix(key, v)} />
                    )
                  ) : (
                    <label className="block text-sm font-medium text-slate-700">
                      {f.label}
                      <input value={String(shown[key] ?? '')} onChange={(e) => onFix(key, e.target.value)} className={`${inputClass} mt-1`} />
                    </label>
                  )}
                  {f.type !== 'hours' && <p className="mt-0.5 text-[12.5px] text-slate-500">Was: {was}</p>}
                </div>
              )
            })}
          </div>
        )}
        {notes.length > 0 && (
          <div className="mt-2 text-[13px] text-slate-600">
            <p className="font-semibold text-slate-700">Goes to the admin as a note:</p>
            {notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}
        {r?.askWhen && !when && <p className="mt-2 text-[13px] text-amber-800">Answer the question above to send it.</p>}
        {r && more && <ChangeSomethingElse name={r.listing.name} onClick={() => onEditListing(r.listing.id)} />}
      </div>
    )
  }

  if (p.kind === 'new_place') {
    const same = picked ? p.maybe.find((m) => m.id === picked) : undefined
    const carries = p.items.filter((i) => !i.doubt && i.availability !== 'stopped' && i.availability !== 'announced')
    return (
      <div className={`${card}`} data-testid="tell-us-card">
        {same ? (
          <>
            <p className="text-[15px] font-extrabold text-slate-900">
              {same.name} <span className="font-normal text-slate-500">· {short(same.address)}</span>
            </p>
            <ChangeLines lines={same.lines} held={same.held} />
            {same.lines.length === 0 && <p className="mt-1 text-[13.5px] text-slate-600">Nothing new here: the guide already has this.</p>}
            <button type="button" onClick={() => onPick(null)} className="mt-2 cursor-pointer text-[13px] font-semibold text-slate-500 hover:text-slate-800">
              No, it’s a different place
            </button>
          </>
        ) : (
          <>
            <p className="text-[12px] font-bold tracking-wide text-emerald-700 uppercase">New to the guide{p.categoryLabel ? ` · ${p.categoryLabel}` : ''}</p>
            <p className="mt-0.5 text-[15px] font-extrabold text-slate-900">
              {p.place.name}
              {p.place.address && <span className="font-normal text-slate-500"> · {p.place.address}</span>}
            </p>
            {carries.length > 0 && (
              <ul className="mt-1 text-[14px]">
                {carries.map((i) => (
                  <li key={i.name} className="font-semibold text-emerald-700">
                    + {i.name}
                    {i.availability === 'sometimes' ? ', sometimes' : ''}
                  </li>
                ))}
              </ul>
            )}
            {[p.place.kosherCert && `Kosher symbol: ${p.place.kosherCert}`, p.place.meatDairy, p.place.phone, p.place.website, p.place.notes].filter(Boolean).map((t) => (
              <p key={t as string} className="mt-1 text-[13px] text-slate-600">
                {t}
              </p>
            ))}
            {p.maybe.length > 0 && (
              <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2">
                <p className="text-[13.5px] font-semibold text-amber-900">Already in the guide?</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.maybe.map((m) => (
                    <button key={m.id} type="button" onClick={() => onPick(m.id)} className="cursor-pointer rounded-full border border-amber-300 bg-white px-3 py-1 text-[13px] text-slate-800 hover:bg-amber-100">
                      It’s {m.name}, {short(m.address)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Adding a place is the form of questions, filled in from Google
                and from what was read (agreed Oct 5). */}
            <button
              type="button"
              onClick={onFill}
              className="mt-2.5 w-full cursor-pointer rounded-lg border-[1.5px] border-primary px-4 py-2 text-[14.5px] font-bold text-primary hover:bg-primary/5"
            >
              Find it and fill it in
            </button>
          </>
        )}
      </div>
    )
  }

  if (p.kind === 'times') {
    const minyanim = p.minyanimKey ? regularMinyanim(p.item[p.minyanimKey]) : []
    return (
      <div className={card} data-testid="tell-us-card">
        <p className="text-[15px] font-extrabold text-slate-900">
          {p.listing.name} <span className="font-normal text-slate-500">· davening times</span>
        </p>
        {timesSent ? (
          <p className="mt-1 text-[13.5px] font-semibold text-emerald-700">Sent. An admin checks the times before they show.</p>
        ) : p.update && timesOpen ? (
          <UpdateTimesBox
            item={p.item}
            minyanim={minyanim}
            read={{ update: p.update, text, photoUrl }}
            onSent={() => {
              setTimesSent(true)
              onTimesSent()
            }}
            onClose={() => setTimesOpen(false)}
          />
        ) : (
          <p className="mt-1 text-[13.5px] text-slate-600">{p.update ? 'Left out.' : 'Couldn’t read the times from it. You can update them on the shul’s own page.'}</p>
        )}
      </div>
    )
  }

  // A menu it couldn't read: the link is a delivery app's, the page wouldn't
  // open, or it named no dishes. What to send instead.
  if (p.kind === 'menu') {
    return (
      <div className={card} data-testid="tell-us-card">
        {head && (p.listing ? <PlaceHead name={p.listing.name} sub={`${p.listing.categoryLabel} · ${short(p.listing.address)}`} /> : <p className="text-[15px] font-extrabold text-slate-900">{p.asWritten || 'A place'}</p>)}
        <p className="mt-1 text-[14px] text-slate-800">Couldn’t read the menu.</p>
        <p className="mt-0.5 text-[13.5px] text-slate-600">{p.failed}</p>
      </div>
    )
  }

  // A guess about other stores, or an announcement with nobody saying they
  // saw it here: the reader would ask shoppers, which nothing does yet, so
  // the box says plainly that nothing changes (agreed Oct 5) rather than
  // showing nothing. An announcement's own store card says it too, so this
  // shows only when nothing else was read.
  if (p.kind === 'ask_others') {
    return (
      <div className={card} data-testid="tell-us-card">
        <p className="text-[14.5px] text-slate-800">Nothing in the guide changes from this.</p>
        <p className="mt-1 text-[13.5px] text-slate-600">
          {p.listing ? `It sounds like a guess about ${p.listing.name}, not something seen there.` : 'It sounds like an announcement or a guess, not something seen at a store here.'}{' '}
          If you’ve seen it yourself, go back and say where.
        </p>
      </div>
    )
  }

  if (p.kind === 'not_update') {
    return (
      <div className={card} data-testid="tell-us-card">
        <p className="text-[14.5px] text-slate-800">This doesn’t look like a change to the guide.</p>
        <p className="mt-1 text-[13.5px] text-slate-600">
          A question or a suggestion for the site?{' '}
          <Link href={routes.feedback(community)} className="font-semibold text-primary hover:underline">
            Send it as feedback
          </Link>
        </p>
      </div>
    )
  }
  return null
}

/** The week's hours, shut until asked for: the lines above already say what
 *  changes, and the whole week's editor is long. */
function HoursFix({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return open ? (
    <>{children}</>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="cursor-pointer text-[13.5px] font-semibold text-primary hover:underline">
      Change the {label.toLowerCase()}
    </button>
  )
}

/** The place a card is about, as its listing heads it. */
function PlaceHead({ name, sub }: { name: string; sub: string }) {
  return (
    <div>
      <p className="text-[18px] leading-tight font-extrabold text-slate-900">{name}</p>
      <p className="mt-0.5 text-[13.5px] text-slate-500">{sub}</p>
    </div>
  )
}

/** The rest of a listing, one tap away: you came to say one thing. */
function ChangeSomethingElse({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-2.5 cursor-pointer text-left text-[14px] font-bold text-primary hover:underline">
      Change something else about {name} ›
    </button>
  )
}

/** A week's hours as the listing shows them, each day that changes marked,
 *  what it was struck through beside it. */
function WeekChange({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  const b = (isStructuredHours(before) ? before : {}) as StructuredHours
  const a = (isStructuredHours(after) ? after : {}) as StructuredHours
  const text = (h: StructuredHours[DayKey] | undefined) => (h === undefined ? 'Not listed' : h === null ? 'Closed' : `${fmt12(h.open)}–${fmt12(h.close)}`)
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" data-testid="tell-us-week">
      <h3 className="text-[15px] font-extrabold text-slate-900">{label}</h3>
      <ul className="mt-1 text-[14px]">
        {DAYS.map((d) => {
          const changed = d in a && JSON.stringify(d in b ? b[d] : 'unset') !== JSON.stringify(a[d])
          return (
            <li key={d} className={`flex justify-between gap-3 py-1 ${changed ? '-mx-1.5 rounded-md bg-emerald-50 px-1.5 font-semibold text-slate-900' : 'text-slate-600'}`}>
              <span>{dayLabel(d)}</span>
              <span>
                {changed && <span className="mr-1.5 font-normal text-slate-400 line-through">{text(b[d])}</span>}
                {text(d in a ? a[d] : b[d])}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
