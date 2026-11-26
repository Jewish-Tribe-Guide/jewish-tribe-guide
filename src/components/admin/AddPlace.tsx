'use client'

import { Fragment, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { isCategorySyncEligible, type CategoryConfig } from '@/lib/categories'
import { sectionFlags, type EditorRow, type EditorValues } from '@/lib/editorRows'
import { websiteKeyOf, type CheckedField } from '@/lib/googleJob'
import { adminBase } from '@/lib/adminNav'
import { samePage } from '@/lib/hoursJob'
import { isKosherJobCategory } from '@/lib/kosherJob'
import { jobPageReads } from '@/lib/listingPageWatch'
import { keepsMenuLink } from '@/lib/menuLink'
import { useCommunitySlug } from '@/lib/communityContext'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { useAdminApi } from './useAdminApi'
import { sourceKind, sourceProblem } from '@/lib/watchPurposes'
import AddressInput from '@/components/intake/AddressInput'
import { SUBMIT_PILL } from '@/components/resources/submitPill'
import { useListingDraft } from '@/components/resources/useListingDraft'
import { formatPhone } from '@/lib/validation'
import type { DirectoryResource } from '@/types'
import { AdminBack } from './AdminUI'
import { addRowSources, foundLines, type AddLine, type AddRead, type AddSlot, type GivenSources, type KosherLookup } from './addSources'
import ListingEditorScreen from './ListingEditorScreen'
import { AddStep } from './AddWhat'
import { addingWords } from '@/lib/addingWords'
import { RowJob, SourceScreen, SourceWords, fromWords, keptWords } from './PlaceListing'
import { stickerOf } from './rowSticker'
import { SignUpLine } from './SignUpLine'
import { addSourceWords, sourcePlaceholder, useSourceFields, type FieldSpec } from './useSourceFields'
import { sourceActions } from './sourceActions'
import { useStepsInAddress } from './useStepsInAddress'

// Add a place (boards AddFind8, AddRows11, AddSelf11, Nov 1): find it on
// Google first, as visitors do, then the rows and lines of a saved listing,
// each saying where it will be read from. What's chosen here waits, and is
// saved once the listing is: nothing is searched or watched for a place that
// doesn't exist yet.

type ReadNowReply = { state: 'done' | 'none' | 'failed' | 'not-found' | 'found' | 'no-email' | 'no-times' | 'no-answer' | 'no-gmail'; on?: string; account?: string | null; phone?: string; details?: Record<string, unknown> }
type Found = { id: string; payload: unknown }
type PageReply = { pages?: { watch: { id: string; url: string; lastError?: string | null } }[] }
/** Added: being read, a page that couldn't be, or what's found. */
type AddedAs = { listing: DirectoryResource; stage: 'reading' | 'failed' | 'found' | 'no-email' | 'done'; lines: string[]; fromEmail?: boolean; retry?: { job: 'hours' | 'times'; watchId: string; was: string }; notSaved?: string[] }

/** What a Change or Add a source screen asks for. */

/** No email has come: the guide has to be on its list (EmailNone14). */
const LINE_LINK = 'cursor-pointer font-semibold text-primary hover:underline disabled:opacity-60'

/** `onBack`: Find's own Back, to the step before it (What are you adding?)
 *  when Add came that way; otherwise out of Add, as `onClose`. */
export default function AddPlace({ category, listings, token, onClose, onBack = onClose }: { category: CategoryConfig; listings: readonly DirectoryResource[]; token: string; onClose: () => void; onBack?: () => void }) {
  const naming = addingWords(category)
  const community = useCommunitySlug()
  const draft = useListingDraft(category)
  const googleFirst = isCategorySyncEligible(category)
  const [step, setStep] = useState<'find' | 'finish'>(googleFirst ? 'find' : 'finish')
  const [picked, setPicked] = useState<Partial<Record<CheckedField, string>> | null>(null)
  const [given, setGiven] = useState<GivenSources>({})
  // A source given or changed in a row itself, kept by its Done.
  const fields = useSourceFields()
  const [addedAs, setAddedAs] = useState<AddedAs | null>(null)
  const [takeFailed, setTakeFailed] = useState(false)
  const [reads, setReads] = useState<Partial<Record<AddSlot, AddRead>>>({})
  // Each slot's latest read: an earlier one's answer is dropped.
  const readsStarted = useRef<Partial<Record<AddSlot, number>>>({})
  const [kosher, setKosher] = useState<KosherLookup | null>(null)
  const [kosherUsed, setKosherUsed] = useState<string | null>(null)
  const [guideGmail, setGuideGmail] = useState<string | null>(null)
  const [taking, setTaking] = useState(false)
  const inGuide = useMemo(() => new Set(listings.map((l) => l.placeId).filter((id): id is string => typeof id === 'string' && !!id)), [listings])
  const api = useAdminApi(token)
  const post = <T,>(path: string, body: Record<string, unknown>) => api.post<T>(path, body)
  // On the kosher lists? From their kept copy, so as soon as it has a name.
  const asksKosher = step === 'finish' && isKosherJobCategory(category) && !!draft.name.trim()
  // A mikvah's Women's, Men's and Keilim are each a row here, and only the ones
  // written in say the mikvah has them.
  const flags = JSON.stringify(sectionFlags(category, draft.details))
  const syncFlags = useEffectEvent((wanted: string) => {
    for (const [flag, on] of Object.entries(JSON.parse(wanted) as Record<string, boolean>)) {
      if (!!draft.details[flag] !== on) draft.setDetail(flag, on)
    }
  })
  useEffect(() => syncFlags(flags), [flags])

  // Asked again by its name and where it is, not every keystroke elsewhere;
  // the rest of the draft goes as it is when the request leaves.
  const askKosher = useEffectEvent(() =>
    post<{ kosher?: KosherLookup | null }>('/api/admin/read-now', { category: category.id, slot: 'kosher', draft: { name: draft.name, address: draft.address, phone: draft.phone, details: draft.details } }),
  )
  useEffect(() => {
    if (!asksKosher) return
    let live = true
    const wait = setTimeout(() => {
      askKosher()
        .then((r) => {
          if (live) setKosher(r.kosher ?? null)
        })
        .catch(() => {})
    }, 500)
    return () => {
      live = false
      clearTimeout(wait)
    }
  }, [asksKosher, draft.name, draft.address])

  // Picked on Google with a website: its page read straight away, and read
  // again when the website or the page given changes (board N5, Nov 25).
  // What it finds waits for Use these times; a read that's overtaken is
  // dropped, and one still going when Add is pressed is left to Add's own.
  const autoSlot: AddSlot | null = picked ? (jobPageReads(category) ? 'page' : keepsMenuLink(category) ? 'menu' : null) : null
  const siteKey = websiteKeyOf(category)
  const siteNow = siteKey && typeof draft.details[siteKey] === 'string' ? (draft.details[siteKey] as string).trim() : ''
  const autoUrl = autoSlot && step === 'finish' && !addedAs ? (given[autoSlot as Exclude<AddSlot, 'site'>] ?? siteNow) : ''
  const readOnPick = useEffectEvent((slot: AddSlot) => void readNow(slot, true))
  useEffect(() => {
    if (!autoSlot || !autoUrl) return
    // The pick's read goes at once; a website being typed, once it rests.
    if (readsStarted.current[autoSlot] === undefined) return readOnPick(autoSlot)
    const wait = setTimeout(() => readOnPick(autoSlot), 600)
    return () => clearTimeout(wait)
  }, [autoSlot, autoUrl])

  const back = googleFirst ? () => setStep('find') : onClose
  useSetScreenHeader(step === 'find', naming.title, onBack)

  // The form after Find has an address and an entry (?step=finish), so
  // Back goes to Find rather than out of Add, and Forward and a reload land
  // on it (Nov 18: it was only state). What was typed isn't kept, so a
  // reload on the form is Find again, as Add starts; Forward, with the form
  // still here, is the form.
  const beenToForm = useRef(step === 'finish')
  useEffect(() => {
    if (step === 'finish') beenToForm.current = true
  }, [step])
  useStepsInAddress(
    googleFirst ? 'step' : null,
    step === 'finish' ? ['finish'] : [],
    ([to]) => {
      if (to === 'finish' && !beenToForm.current) return false
      setStep(to === 'finish' ? 'finish' : 'find')
    },
    { inner: ['row'] },
  )
  if (step === 'find') {
    return (
      <div className="flex flex-col gap-4">
        <AdminBack back={{ label: 'Back', onClick: onBack }} title={naming.title} />
        <AddStep n={2} />
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label htmlFor="add-find-place" className="mb-1 block text-sm font-semibold text-slate-700">
            {naming.find}
          </label>
          <AddressInput
            id="add-find-place"
            autoFocus
            value={draft.address}
            onChange={draft.setAddress}
            onCoords={draft.setCoords}
            onPlaceSelect={(result) => {
              draft.handlePlaceSelect(result)
              // The draft's own forms of them, as fieldNow reads them.
              setPicked({
                ...(result.name ? { name: result.name.trim() } : {}),
                ...(result.phone ? { phone: formatPhone(result.phone) } : {}),
                ...(result.hours ? { hours: JSON.stringify(result.hours) } : {}),
                ...(result.website ? { website: result.website } : {}),
              })
              setStep('finish')
            }}
            placeholder="Search by business name or address…"
            suggestionNote={(placeId) => (inGuide.has(placeId) ? 'Already in the guide' : null)}
            inlineSuggestions
          />
        </div>
        <p className="text-center">
          <button
            type="button"
            onClick={() => {
              setPicked(null)
              setStep('finish')
            }}
            className="cursor-pointer text-[0.9375rem] font-bold text-primary hover:underline"
          >
            Fill it in yourself
          </button>
        </p>
      </div>
    )
  }

  const websiteKey = websiteKeyOf(category)
  const website = websiteKey && typeof draft.details[websiteKey] === 'string' ? (draft.details[websiteKey] as string).trim() : ''
  const values: EditorValues = { name: draft.name, address: draft.hasAddress ? draft.address : '', phone: draft.hasPhone ? draft.phone : '', details: draft.details }
  const sources = addRowSources({ category, picked, hasPlace: !!draft.coords, values, given, reads, kosher, kosherUsed })

  /** A source chosen: kept till the listing's saved. An email given for a
   *  shul's page is its email, and takes the place of nothing else. */
  function choose(slot: AddSlot, url: string) {
    if (slot === 'site') return
    const problem = slot === 'page' || slot === 'email' ? sourceProblem(slot === 'email' || category.detailFields.some((f) => f.type === 'minyanim') ? 'times' : 'hours', url) : null
    if (problem) throw new Error(problem)
    const to = (slot === 'page' || slot === 'email') && sourceKind(url) === 'email' ? 'email' : slot === 'email' ? 'page' : slot
    setGiven((g) => ({ ...g, [to]: url }))
    readsStarted.current[to] = (readsStarted.current[to] ?? 0) + 1
    setReads((r) => {
      const next = { ...r }
      delete next[to]
      return next
    })
  }

  const readDraft = () => ({ name: draft.name, address: values.address, phone: values.phone, details: draft.details, coords: draft.coords })

  /** Read now (ReadNow13): it fills in the rows, and the listing's not saved.
   *  `hold`: read on its own, so what it finds waits for a person's Use. */
  async function readNow(slot: AddSlot, hold = false) {
    const mine = (readsStarted.current[slot] ?? 0) + 1
    readsStarted.current[slot] = mine
    setReads((r) => ({ ...r, [slot]: { state: 'reading' } }))
    const url = slot === 'site' ? undefined : given[slot]
    const reply = await post<ReadNowReply>('/api/admin/read-now', { category: category.id, slot, url, draft: readDraft() }).catch(() => null)
    // Overtaken by another read, or by a page given while it read.
    if (readsStarted.current[slot] !== mine) return
    const got = reply?.state === 'done' || reply?.state === 'found'
    if (got && hold && reply.state === 'done') {
      setReads((r) => ({ ...r, [slot]: { state: 'held', found: { ...(reply.phone ? { phone: reply.phone } : {}), details: reply.details ?? {} } } }))
      return
    }
    if (got) {
      if (reply.phone) draft.setPhone(reply.phone)
      for (const [key, value] of Object.entries(reply.details ?? {})) draft.setDetail(key, value)
    }
    if (reply?.account) setGuideGmail(reply.account)
    setReads((r) => ({ ...r, [slot]: { state: reply?.state === 'found' ? 'found' : (reply?.state ?? (slot === 'email' ? 'no-answer' : 'failed')), on: reply?.on ?? '' } as AddRead }))
  }

  /** Use these times: what a read on its own found, put in. */
  function takeHeld(slot: AddSlot) {
    const read = reads[slot]
    if (read?.state !== 'held') return
    if (read.found.phone) draft.setPhone(read.found.phone)
    for (const [key, value] of Object.entries(read.found.details)) draft.setDetail(key, value)
    setReads((r) => ({ ...r, [slot]: { state: 'done' } }))
  }

  function takeList(on: KosherLookup['lists'][number]) {
    for (const [key, value] of Object.entries(on.values)) draft.setDetail(key, value)
    setKosherUsed(on.name)
  }

  /** A row's field for a slot (board N4, Nov 25): kept by the row's Done. */
  // `adding`: opened by an Add link, beside what the line says rather than
  // in place of it, so its own key (Nov 25).
  const slotSpec = (row: EditorRow, slot: AddSlot, value = '', adding = false): FieldSpec => ({
    key: adding ? `add:${slot}` : slot,
    value,
    // A hospital wants its one page on Refuah; say so.
    placeholder: slot === 'refuah' ? 'Its page on Refuah' : sourcePlaceholder(row),
    attempt: async (url) => {
      choose(slot, url)
      return { failed: false }
    },
  })

  const control = (words: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={LINE_LINK}>
      {words}
    </button>
  )

  function lineControls(row: EditorRow, line: AddLine): ReactNode[] {
    const out: ReactNode[] = []
    if (line.readNow) {
      const slot = line.readNow
      out.push(control('Read now', () => void readNow(slot)))
    }
    if (line.use) {
      const { slot, words } = line.use
      out.push(control(words, () => takeHeld(slot)))
    }
    if (line.useList) {
      const on = line.useList
      out.push(control('Use it', () => takeList(on)))
    }
    // One field for a slot at a time: either open, neither link.
    const slotOpen = (slot: AddSlot) => fields.isOpen(row, slot) || fields.isOpen(row, `add:${slot}`)
    if (line.change && !slotOpen(line.change.slot)) {
      const slot = line.change.slot
      out.push(control(line.change.words ?? 'Change', () => fields.reveal(row, slotSpec(row, slot, slot === 'site' ? '' : (given[slot] ?? '')))))
    }
    // After Change, on the same line: "... · Change · Add an email".
    if (line.add && !slotOpen(line.add.slot)) {
      const slot = line.add.slot
      out.push(control(line.add.words ?? addSourceWords(row), () => fields.reveal(row, slotSpec(row, slot, '', true))))
    }
    if (line.setUpGmail) {
      out.push(
        <a key="gmail" href={`${adminBase(community)}/team/email`} target="_blank" rel="noopener noreferrer" className={LINE_LINK}>
          Set it up
        </a>,
      )
    }
    if (line.findOnGoogle) out.push(control('Find it on Google', () => setStep('find')))
    return out
  }

  function rowSource(row: EditorRow): ReactNode {
    const source = sources(row)
    if (!source) return null
    // Each field the row's Change or Add opens, once it's open.
    const specs = new Map<string, FieldSpec>()
    for (const l of source.lines) {
      if (l.change) specs.set(l.change.slot, slotSpec(row, l.change.slot))
      if (l.add) specs.set(`add:${l.add.slot}`, slotSpec(row, l.add.slot, '', true))
    }
    // The first From line says the sticker's words (Nov 26), as a saved
    // place's does.
    const sticker = stickerOf(source)
    const kept = sticker?.tone === 'green' ? sticker.text : null
    const leadAt = source.lines.findIndex((l) => !l.says && fromWords(l.text).startsWith('From '))
    return (
      <div className="space-y-1.5">
        {source.lines.map((line, i) => {
          // Changing what a line says: the field takes its place (Nov 25:
          // "No minyan times on its website" over the field read as its label).
          if (line.change && fields.isOpen(row, line.change.slot)) return null
          const controls = lineControls(row, line)
          const said = { ...line, text: line.says ? line.text : fromWords(line.text) }
          const words = i === leadAt ? keptWords(said, kept) : said
          return (
            <Fragment key={i}>
              {(words.text || controls.length > 0) && <SourceWords line={words} controls={controls} />}
              {line.signUp && <SignUpLine account={guideGmail} />}
            </Fragment>
          )
        })}
        {[...specs].map(([key, spec]) => (
          <Fragment key={key}>{fields.field(row, spec)}</Fragment>
        ))}
      </div>
    )
  }

  /** What's found waiting, or back to Places with nothing to say. */
  async function seeFound(listing: DirectoryResource, noEmail = false, fromEmail = false, notSaved: string[] = []) {
    const { found = [] } = await api.get<{ found?: Found[] }>(`/api/admin/listings/${listing.id}/found`, 'Could not see what it found.').catch(() => ({ found: [] as Found[] }))
    const lines = foundLines(category, listing as unknown as Record<string, unknown>, found, new Date().toISOString().slice(0, 10))
    if (lines.length) setAddedAs({ listing, stage: 'found', lines, fromEmail, notSaved })
    else if (noEmail) setAddedAs({ listing, stage: 'no-email', lines: [], notSaved })
    // Something didn't save: stay, so it's seen.
    else if (notSaved.length) setAddedAs({ listing, stage: 'done', lines: [], notSaved })
    else onClose()
  }

  /** Read it now: its pages, as the job page reads them, or its own website. */
  async function readAdded(listing: DirectoryResource) {
    const reads = jobPageReads(category)
    if (reads) {
      const path = `/api/admin/watches/hours${reads.kind === 'times' ? '?job=times' : ''}`
      const reply = await post<{ read?: string[] }>(path, { action: 'check', resourceId: listing.id }).catch(() => null)
      for (const id of reply?.read ?? []) await post(path, { action: 'check', resourceId: listing.id, id }).catch(() => null)
    } else if (keepsMenuLink(category)) {
      await post('/api/admin/main-dishes', { action: 'read', resourceId: listing.id }).catch(() => null)
    } else {
      await post(`/api/admin/listings/${listing.id}/found`, { action: 'site' }).catch(() => null)
    }
  }

  async function added(listing: DirectoryResource) {
    setAddedAs({ listing, stage: 'reading', lines: [] })
    const actions = sourceActions(listing.id, post)
    // Each saved as the listing's own Change would, and none stopping the
    // rest. What fails is named on the screen, not dropped (Nov 18 review).
    const saves: [string, Promise<unknown>][] = []
    if (given.email) saves.push(['Its email', actions.addSource({ job: 'times', email: true, label: '' }, given.email)])
    if (given.menu) saves.push(['Its menu', actions.addSource({ job: 'dishes', email: false, label: '' }, given.menu, { waitForMenu: true })])
    if (given.refuah) saves.push(['Refuah', actions.change({ kind: 'refuah' }, given.refuah)])
    if (given.keystone) saves.push(['Keystone-K', actions.change({ kind: 'keystone' }, given.keystone)])
    const settled = await Promise.allSettled(saves.map(([, p]) => p))
    const notSaved = saves.filter((_, i) => settled[i].status === 'rejected').map(([name]) => name)
    // Picked on Google: its Google read now. A field typed over isn't
    // Google's any more: the save compares it with what Google filled in.
    if (picked && !(await post(`/api/admin/listings/${listing.id}/found`, { action: 'google' }).then(() => true, () => false))) notSaved.push('Google’s details')
    // Its email looked for now, and filed as the hourly run would.
    const looked = given.email ? await post<{ state?: string; account?: string | null }>(`/api/admin/listings/${listing.id}/found`, { action: 'email', address: given.email }).catch(() => null) : null
    if (looked?.account) setGuideGmail(looked.account)
    const noEmail = looked?.state === 'no-email'
    const fromEmail = looked?.state === 'found' && !given.page && !website
    const reads = jobPageReads(category)
    if (given.page && reads) {
      // A page given is read as it's saved, and said so if it can't be (AddFailed8).
      const job = reads.kind
      const path = `/api/admin/watches/hours${job === 'times' ? '?job=times' : ''}`
      const reply = await post<PageReply>(path, { action: 'give', resourceId: listing.id, url: given.page }).catch(() => null)
      const page = reply?.pages?.find((p) => samePage(p.watch.url, given.page!))
      if (!page || page.watch.lastError) {
        setAddedAs({ listing, stage: 'failed', lines: [], retry: { job, watchId: page?.watch.id ?? '', was: page ? given.page : '' }, notSaved })
        return
      }
    } else if (website || given.menu) await readAdded(listing)
    await seeFound(listing, noEmail, fromEmail, notSaved)
  }

  async function takeFound(listing: DirectoryResource) {
    setTaking(true)
    setTakeFailed(false)
    try {
      await post(`/api/admin/listings/${listing.id}/found`, { action: 'take' })
    } catch {
      setTakeFailed(true)
      setTaking(false)
      return
    }
    onClose()
  }

  if (addedAs) {
    const { listing, stage } = addedAs
    const banner = <p role="status" className="m-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[0.9375rem] font-bold text-emerald-900">{listing.name} is added</p>
    const title = stage === 'failed' ? 'Change' : naming.title
    return (
      <div className="flex flex-col gap-4">
        <AdminBack back={{ label: 'Back', onClick: onClose }} title={title} />
        {banner}
        {!!addedAs.notSaved?.length && (
          <p role="alert" className="m-0 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[0.9375rem] font-bold text-amber-900">
            Not saved: {addedAs.notSaved.join(' · ')}
          </p>
        )}
        {stage === 'done' && (
          <button type="button" onClick={onClose} className={SUBMIT_PILL}>
            Done
          </button>
        )}
        {stage === 'reading' && <p className="m-0 text-[0.9375rem] text-slate-600">{website || given.page ? 'Reading its website…' : 'Looking in the guide’s Gmail…'}</p>}
        {stage === 'no-email' && (
          <>
            <div className="space-y-1">
              <p className="m-0 text-[0.9375rem] font-bold text-slate-900">No emails from {given.email} yet</p>
              <SignUpLine account={guideGmail} />
            </div>
            <button type="button" onClick={onClose} className={SUBMIT_PILL}>
              Done
            </button>
          </>
        )}
        {stage === 'failed' && addedAs.retry && (
          <SourceScreen
            label={jobPageReads(category)?.kind === 'times' ? 'A web page, or the email it comes from' : 'A web page'}
            value={given.page ?? ''}
            button="Start reading"
            failedAtFirst
            attempt={sourceActions(listing.id, post).readPage(addedAs.retry.job, addedAs.retry.watchId, addedAs.retry.was)}
            onTried={() => {}}
            onDone={() => seeFound(listing)}
          />
        )}
        {stage === 'found' && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="m-0 text-[0.9375rem] font-extrabold text-slate-900">{addedAs.fromEmail ? 'Found in its email' : 'Found on its website'}</p>
              <ul className="m-0 mt-2 list-none space-y-1.5 p-0" data-testid="found-lines">
                {addedAs.lines.map((l) => (
                  <li key={l} className="text-[0.9375rem] text-slate-700">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
            {takeFailed && (
              <p role="alert" className="m-0 text-[0.9375rem] font-bold text-red-700">
                Couldn’t add it. Try again.
              </p>
            )}
            <button type="button" disabled={taking} onClick={() => void takeFound(listing)} className={SUBMIT_PILL}>
              {taking ? 'Adding…' : 'Add to the listing'}
            </button>
            <button type="button" disabled={taking} onClick={onClose} className="min-h-11 cursor-pointer text-center text-[0.9375rem] font-bold text-primary hover:underline">
              Decide later in To do
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <ListingEditorScreen
      heading={naming.title}
      top={<AddStep n={3} />}
      category={category}
      draft={draft}
      fromGoogle={!!picked}
      existingListings={[...listings]}
      adminSubmit={{ token, onAdded: (l) => void added(l) }}
      onClose={back}
      splitContact
      allSections
      rowAside={(row: EditorRow) => {
        const source = sources(row)
        return source ? <RowJob source={source} /> : null
      }}
      rowSource={rowSource}
      rowDone={(row) => fields.done(row)}
    />
  )
}
