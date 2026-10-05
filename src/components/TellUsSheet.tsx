'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { changeableFields, changeLines } from '@/lib/fieldChanges'
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
import { DetailFieldInput } from '@/components/resources/ListingForm'
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
type Lines = { lines: string[]; held: string[] }
type Choice = { label: string; listingId: string; listing: Brief } & Lines

type ItemsProposal = { kind: 'items'; listingId: string | null; listing: Brief | null; asWritten: string; chain: boolean; ask: { question: string; choices: Choice[] } | null; items: ReadItem[] } & Lines
type PlaceProposal = { kind: 'new_place'; category: string | null; categoryLabel: string | null; place: PlaceRead; items: ReadItem[]; maybe: (Brief & Lines)[] }
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
type OtherProposal = { kind: 'ask_others' | 'not_update'; question?: string; note?: string | null }
type Proposal = ItemsProposal | FieldsProposal | PlaceProposal | TimesProposal | OtherProposal
type Reading = { proposals: Proposal[]; photoUrls: string[] }

const MAX_PHOTOS = 3
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

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
  placeholder = tellUsPlaceholder('any'),
  onAddYourself,
  onEditYourself,
}: {
  isOpen: boolean
  onClose: () => void
  /** The listing it was opened from, if any. */
  about?: { id: string; name: string }
  placeholder?: string
  /** "Rather fill it in yourself? Add a place": today's Add form. */
  onAddYourself?: () => void
  /** From a listing: "Edit the details myself", today's Edit form. */
  onEditYourself?: () => void
}) {
  const isMobile = useIsMobile()
  const title = about ? `Tell us about ${about.name}` : 'Saw something? Tell us'
  const body = <TellUsBody key={isOpen ? 'open' : 'shut'} about={about} placeholder={placeholder} onAddYourself={onAddYourself} onEditYourself={onEditYourself} onClose={onClose} />
  return isMobile ? (
    <MobileSheet isOpen={isOpen} onClose={onClose} title={title} draggable>
      {body}
    </MobileSheet>
  ) : (
    <ActionDialog isOpen={isOpen} onClose={onClose} title={title}>
      {body}
    </ActionDialog>
  )
}

function TellUsBody({
  about,
  placeholder,
  onAddYourself,
  onEditYourself,
  onClose,
}: {
  about?: { id: string; name: string }
  placeholder: string
  onAddYourself?: () => void
  onEditYourself?: () => void
  onClose: () => void
}) {
  const community = useCommunitySlug()
  const categories = useCategories()
  const [step, setStep] = useState<'write' | 'result' | 'sent'>('write')
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([])
  const [reading, setReading] = useState<Reading | null>(null)
  const [busy, setBusy] = useState<'read' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [left, setLeft] = useState<Set<number>>(new Set())
  const [picked, setPicked] = useState<Record<number, string | null>>({})
  const [places, setPlaces] = useState<Record<number, { place: PlaceRead; category: string | null }>>({})
  // A fields card's own fixes, and its answer to "from now on, or just once?"
  const [fixes, setFixes] = useState<Record<number, Record<string, unknown>>>({})
  const [whens, setWhens] = useState<Record<number, 'always' | 'once'>>({})
  const [email, setEmail] = useState('')
  const [filed, setFiled] = useState(0)
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
      setPlaces(Object.fromEntries(json.proposals.flatMap((p, i) => (p.kind === 'new_place' ? [[i, { place: p.place, category: p.category }]] : []))))
      setLeft(new Set())
      setPicked({})
      setFixes({})
      setWhens({})
      setStep('result')
    } catch (e) {
      setError(e instanceof Error && e.message !== 'failed' ? e.message : 'Couldn’t read it right now. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  // What Send files: each store (the one read, or the branch picked) and
  // each new place, unless left out.
  const proposals = reading?.proposals ?? []
  const stores: { listingId: string; items: ReadItem[] }[] = []
  const newPlaces: { category: string; place: PlaceRead; items: ReadItem[] }[] = []
  const edits: { listingId: string; values: Record<string, unknown>; notes: string[] }[] = []
  proposals.forEach((p, i) => {
    if (left.has(i)) return
    if (p.kind === 'items') {
      const id = p.listingId ?? picked[i] ?? null
      const lines = p.listingId ? p.lines : p.ask?.choices.find((c) => c.listingId === id)?.lines ?? []
      if (id && lines.length) stores.push({ listingId: id, items: p.items })
    }
    if (p.kind === 'fields') {
      const r = fieldsReadingOf(p, picked[i] ?? null)
      if (!r || (r.askWhen && !whens[i])) return
      const values = { ...r.values, ...fixes[i] }
      const notes = [...r.notes]
      if (r.askWhen && whens[i] === 'once') {
        delete values[r.askWhen.key]
        notes.push(r.askWhen.oneDay)
      }
      if (Object.keys(values).length || notes.length) edits.push({ listingId: r.listing.id, values, notes })
    }
    if (p.kind === 'new_place') {
      const same = picked[i]
      if (same) {
        if (p.maybe.find((m) => m.id === same)?.lines.length) stores.push({ listingId: same, items: p.items })
      } else if (places[i]?.category) newPlaces.push({ category: places[i].category!, place: places[i].place, items: p.items })
    }
  })
  const sendable = stores.length + edits.length + newPlaces.length

  const send = async (token: string) => {
    try {
      const res = await fetch(withCommunity('/api/message/send', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, photoUrls: reading?.photoUrls ?? [], stores, edits, places: newPlaces, email, turnstileToken: token, company: '' }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; filed?: number }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'failed')
      setFiled(json.filed ?? 0)
      setStep('sent')
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

  if (step === 'sent') {
    return (
      <div className="space-y-3 p-1" data-testid="tell-us-sent">
        <p className="text-[17px] font-extrabold text-slate-900">Thank you</p>
        <p className="text-[14.5px] leading-snug text-slate-700">
          {filed === 1 ? 'Your update is with an admin.' : `Your ${filed} updates are with an admin.`} They check each one before it shows in the guide.
          {email ? ' We’ll email you when it’s live.' : ''}
        </p>
        <button type="button" onClick={onClose} className="w-full cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-[15px] font-bold text-white">
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
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the visitor's own photo */}
                    <img src={p.preview} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
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
                + Add a photo
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
          {onAddYourself && (
            <p className="text-center text-[13.5px] text-slate-600">
              Rather fill it in yourself?{' '}
              <button type="button" onClick={onAddYourself} className="cursor-pointer font-semibold text-primary hover:underline">
                Add a place
              </button>
            </p>
          )}
        </>
      )}

      {step === 'result' && reading && (
        <>
          <p className="text-[13.5px] leading-snug text-slate-600">
            Read by AI from what you sent. Check it, take off anything that’s wrong, then send it. An admin checks it too.
          </p>
          {proposals.map((p, i) => (
            <ResultCard
              key={i}
              p={p}
              left={left.has(i)}
              onLeave={(out) => setLeft((s) => { const n = new Set(s); if (out) n.add(i); else n.delete(i); return n })}
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
              place={places[i]}
              onPlace={(v) => setPlaces((x) => ({ ...x, [i]: v }))}
              categories={(categories ?? []).filter((c) => c.kind === 'listing' && resolveCapabilities(c.capabilities).add).map((c) => ({ id: c.id, label: c.label }))}
              text={text}
              photoUrl={reading.photoUrls[0] ?? null}
              community={community}
            />
          ))}
          {sendable > 0 && (
            <>
              <div>
                <label htmlFor={emailId} className="block text-[13px] font-semibold text-slate-700">
                  Email, to hear when it’s live <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <input id={emailId} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-1`} autoComplete="email" />
              </div>
              <button
                type="button"
                disabled={busy === 'send'}
                onClick={() => start('send', (token) => void send(token))}
                className="w-full cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-[15px] font-bold text-white disabled:opacity-60"
              >
                {busy === 'send' ? 'Sending…' : sendable === 1 ? 'Send' : `Send ${sendable} updates`}
              </button>
            </>
          )}
          <button type="button" onClick={() => setStep('write')} className="cursor-pointer text-[14px] font-bold text-slate-500 hover:text-slate-700">
            ‹ Change what I wrote
          </button>
        </>
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
  left,
  onLeave,
  picked,
  onPick,
  place,
  onPlace,
  categories,
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
  left: boolean
  onLeave: (out: boolean) => void
  picked: string | null
  onPick: (id: string | null) => void
  place?: { place: PlaceRead; category: string | null }
  onPlace: (v: { place: PlaceRead; category: string | null }) => void
  categories: { id: string; label: string }[]
  text: string
  photoUrl: string | null
  community: string
}) {
  const [timesOpen, setTimesOpen] = useState(true)
  const [timesSent, setTimesSent] = useState(false)
  const card = 'rounded-xl border border-slate-200 bg-white px-3.5 py-3'
  const leave = (
    <button type="button" onClick={() => onLeave(!left)} className="cursor-pointer text-[13px] font-semibold text-slate-500 hover:text-slate-800">
      {left ? 'Put it back' : 'Leave this out'}
    </button>
  )
  const short = (a: string) => a.split(',')[0]

  if (p.kind === 'items') {
    const chosen = p.listing ?? p.ask?.choices.find((c) => c.listingId === picked)?.listing ?? null
    const lines = p.listing ? { lines: p.lines, held: p.held } : (p.ask?.choices.find((c) => c.listingId === picked) ?? null)
    return (
      <div className={`${card} ${left ? 'opacity-50' : ''}`} data-testid="tell-us-card">
        {chosen ? (
          <p className="text-[15px] font-extrabold text-slate-900">
            {chosen.name} <span className="font-normal text-slate-500">· {short(chosen.address)}</span>
          </p>
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
        {lines && (lines.lines.length || lines.held.length) ? <ChangeLines {...lines} /> : null}
        {lines && lines.lines.length === 0 && <p className="mt-1 text-[13.5px] text-slate-600">Nothing new here: the guide already has this.</p>}
        {!chosen && !p.ask && (
          <p className="mt-1 text-[13.5px] text-slate-600">
            {p.chain ? 'About the whole chain, not one store, so nothing changes in the guide.' : 'Couldn’t tell which store this is.'} Items: {p.items.map((i) => i.name).join(', ')}
          </p>
        )}
        {chosen && lines?.lines.length ? <div className="mt-2">{leave}</div> : null}
      </div>
    )
  }

  if (p.kind === 'fields') {
    const r = fieldsReadingOf(p, picked)
    const category = r ? categoryOf(r.listing.category) : undefined
    const fields = category ? changeableFields(category) : []
    const values = r ? { ...r.values, ...fixes } : {}
    const shown = r?.askWhen && when === 'once' ? Object.fromEntries(Object.entries(values).filter(([k]) => k !== r.askWhen!.key)) : values
    const lines = r ? changeLines(fields, r.before as DirectoryResource, shown) : []
    const notes = r ? [...r.notes, ...(r.askWhen && when === 'once' ? [r.askWhen.oneDay] : [])] : []
    return (
      <div className={`${card} ${left ? 'opacity-50' : ''}`} data-testid="tell-us-card">
        <p className="text-[15px] font-extrabold text-slate-900">
          {r ? r.listing.name : p.asWritten || 'A place'} {r && <span className="font-normal text-slate-500">· {short(r.listing.address)}</span>}
        </p>
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
                      <HoursFix label={f.label}>
                        <DetailFieldInput field={f.field} value={shown[key]} onChange={(v) => onFix(key, v)} />
                      </HoursFix>
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
        {r && (Object.keys(shown).length > 0 || notes.length > 0) && <div className="mt-2">{leave}</div>}
      </div>
    )
  }

  if (p.kind === 'new_place') {
    const v = place ?? { place: p.place, category: p.category }
    const same = picked ? p.maybe.find((m) => m.id === picked) : undefined
    const set = (patch: Partial<PlaceRead>) => onPlace({ ...v, place: { ...v.place, ...patch } })
    return (
      <div className={`${card} ${left ? 'opacity-50' : ''}`} data-testid="tell-us-card">
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
            <p className="text-[12px] font-bold tracking-wide text-emerald-700 uppercase">New to the guide</p>
            <div className="mt-1.5 space-y-2">
              <input aria-label="Name" value={v.place.name} onChange={(e) => set({ name: e.target.value })} className={`${inputClass} font-bold`} />
              <input aria-label="Address" placeholder="Address, if you know it" value={v.place.address ?? ''} onChange={(e) => set({ address: e.target.value })} className={inputClass} />
              <select aria-label="Kind of place" value={v.category ?? ''} onChange={(e) => onPlace({ ...v, category: e.target.value || null })} className={inputClass}>
                <option value="">Which kind of place?</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {p.items.length > 0 && (
              <ul className="mt-2 text-[14px]">
                {p.items.filter((i) => !i.doubt && i.availability !== 'stopped' && i.availability !== 'announced').map((i) => (
                  <li key={i.name} className="font-semibold text-emerald-700">
                    + {i.name}
                    {i.availability === 'sometimes' ? ', sometimes' : ''}
                  </li>
                ))}
              </ul>
            )}
            {[v.place.kosherCert && `Kosher symbol: ${v.place.kosherCert}`, v.place.phone, v.place.website, v.place.notes].filter(Boolean).map((t) => (
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
            {!v.category && <p className="mt-2 text-[13px] text-amber-800">Pick which kind of place it is to send it.</p>}
            <div className="mt-2">{leave}</div>
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
            onSent={() => setTimesSent(true)}
            onClose={() => setTimesOpen(false)}
          />
        ) : (
          <p className="mt-1 text-[13.5px] text-slate-600">{p.update ? 'Left out.' : 'Couldn’t read the times from it. You can update them on the shul’s own page.'}</p>
        )}
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
