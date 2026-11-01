'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { isCategorySyncEligible, type CategoryConfig } from '@/lib/categories'
import type { EditorRow, EditorValues } from '@/lib/editorRows'
import { fetchJson } from '@/lib/fetchJson'
import { websiteKeyOf, type CheckedField } from '@/lib/googleJob'
import { samePage } from '@/lib/hoursJob'
import { pageReadsFor } from '@/lib/listingPageWatch'
import { keepsMenuLink } from '@/lib/menuLink'
import { useCommunitySlug } from '@/lib/communityContext'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { withCommunity } from '@/lib/useCommunityData'
import { sourceKind, sourceProblem } from '@/lib/watchPurposes'
import AddressInput from '@/components/intake/AddressInput'
import { SUBMIT_PILL } from '@/components/resources/submitPill'
import { useListingDraft } from '@/components/resources/useListingDraft'
import { formatPhone } from '@/lib/validation'
import type { DirectoryResource } from '@/types'
import { AdminBack } from './AdminUI'
import { addRowSources, foundLines, type AddLine, type AddSlot, type GivenSources } from './addSources'
import ListingEditorScreen from './ListingEditorScreen'
import { RowJob, SourceScreen, SourceWords, type SourceScreenProps } from './PlaceListing'
import { sourceActions } from './sourceActions'

// Add a place (boards AddFind8, AddRows11, AddSelf11, Nov 1): find it on
// Google first, as visitors do, then the rows and lines of a saved listing,
// each saying where it will be read from. What's chosen here waits, and is
// saved once the listing is: nothing is searched or watched for a place that
// doesn't exist yet.

type Found = { id: string; payload: unknown }
type PageReply = { pages?: { watch: { id: string; url: string; lastError?: string | null } }[] }
/** Added: being read, a page that couldn't be, or what's found. */
type AddedAs = { listing: DirectoryResource; stage: 'reading' | 'failed' | 'found'; lines: string[]; retry?: { job: 'hours' | 'times'; watchId: string; was: string } }

const LINE_LINK = 'cursor-pointer font-semibold text-primary hover:underline disabled:opacity-60'

export default function AddPlace({ category, listings, token, onClose }: { category: CategoryConfig; listings: readonly DirectoryResource[]; token: string; onClose: () => void }) {
  const community = useCommunitySlug()
  const draft = useListingDraft(category)
  const googleFirst = isCategorySyncEligible(category)
  const [step, setStep] = useState<'find' | 'finish'>(googleFirst ? 'find' : 'finish')
  const [picked, setPicked] = useState<Partial<Record<CheckedField, string>> | null>(null)
  const [given, setGiven] = useState<GivenSources>({})
  const [stopped, setStopped] = useState<ReadonlySet<CheckedField>>(new Set())
  const [screen, setScreen] = useState<{ title: string; props: Omit<SourceScreenProps, 'onDone' | 'onTried'> } | null>(null)
  const [addedAs, setAddedAs] = useState<AddedAs | null>(null)
  const [taking, setTaking] = useState(false)
  const inGuide = useMemo(() => new Set(listings.map((l) => l.placeId).filter((id): id is string => typeof id === 'string' && !!id)), [listings])
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const post = <T,>(path: string, body: Record<string, unknown>) => fetchJson<T>(withCommunity(path, community), { method: 'POST', headers, body: JSON.stringify(body) }, 'Could not do that.')

  const back = googleFirst ? () => setStep('find') : onClose
  useSetScreenHeader(step === 'find', 'Add a place', onClose)

  if (step === 'find') {
    return (
      <div className="flex flex-col gap-4">
        <AdminBack back={{ label: 'Back', onClick: onClose }} title="Add a place" />
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label htmlFor="add-find-place" className="mb-1 block text-sm font-semibold text-slate-700">
            Find the place
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
              setStopped(new Set())
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
            className="cursor-pointer text-[15px] font-bold text-primary hover:underline"
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
  const sources = addRowSources({ category, picked, hasPlace: !!draft.coords, values, given, stopped, reads: {} })

  /** A source chosen: kept till the listing's saved. An email given for a
   *  shul's page is its email, and takes the place of nothing else. */
  function choose(slot: AddSlot, url: string) {
    if (slot === 'site') return
    const problem = slot === 'page' || slot === 'email' ? sourceProblem(slot === 'email' || category.detailFields.some((f) => f.type === 'minyanim') ? 'times' : 'hours', url) : null
    if (problem) throw new Error(problem)
    const to = (slot === 'page' || slot === 'email') && sourceKind(url) === 'email' ? 'email' : slot === 'email' ? 'page' : slot
    setGiven((g) => ({ ...g, [to]: url }))
  }

  const openScreen = (title: string, label: string, slot: AddSlot, placeholder?: string) =>
    setScreen({
      title,
      props: {
        label,
        value: '',
        button: 'Save',
        placeholder,
        attempt: async (url) => {
          choose(slot, url)
          return { failed: false }
        },
      },
    })

  const control = (words: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={LINE_LINK}>
      {words}
    </button>
  )

  function lineControls(line: AddLine): ReactNode[] {
    const out: ReactNode[] = []
    if (line.change) {
      const c = line.change
      out.push(control('Change', () => openScreen('Change', c.label, c.slot, c.placeholder)))
    }
    if (line.add) {
      const a = line.add
      out.push(control(a.words ?? 'Add a source', () => openScreen(a.words ?? 'Add a source', a.label, a.slot, a.placeholder)))
    }
    if (line.googleStop) {
      const f = line.googleStop
      out.push(control('Stop', () => setStopped((s) => new Set(s).add(f))))
    }
    if (line.useGoogle) {
      const f = line.useGoogle
      out.push(control('Use Google’s', () => setStopped((s) => new Set([...s].filter((x) => x !== f)))))
    }
    if (line.findOnGoogle) out.push(control('Find it on Google', () => setStep('find')))
    return out
  }

  function rowSource(row: EditorRow): ReactNode {
    const source = sources(row)
    if (!source) return null
    return (
      <div className="space-y-1">
        {source.lines.map((line, i) => {
          const controls = lineControls(line)
          // A line that's only its Add a source.
          if (!line.text) return <p key={i} className="m-0 text-[13px]">{controls}</p>
          return <SourceWords key={i} line={line} controls={controls} />
        })}
      </div>
    )
  }

  /** What's found waiting, or back to Places with nothing to say. */
  async function seeFound(listing: DirectoryResource) {
    const { found } = await fetchJson<{ found: Found[] }>(withCommunity(`/api/admin/listings/${listing.id}/found`, community), { headers }, 'Could not see what it found.').catch(() => ({ found: [] as Found[] }))
    const lines = foundLines(category, listing as unknown as Record<string, unknown>, found, new Date().toISOString().slice(0, 10))
    if (lines.length) setAddedAs({ listing, stage: 'found', lines })
    else onClose()
  }

  /** Read it now: its pages, as the job page reads them, or its own website. */
  async function readAdded(listing: DirectoryResource) {
    const reads = pageReadsFor(category)
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
    // Each saved as the listing's own Change would, and none stopping the rest.
    const saves: Promise<unknown>[] = [...stopped].map((field) => post('/api/admin/watches/google', { action: 'stop_field', id: listing.id, field }))
    if (given.email) saves.push(actions.addSource({ job: 'times', email: true, label: '' }, given.email))
    if (given.menu) saves.push(actions.addSource({ job: 'dishes', email: false, label: '' }, given.menu))
    if (given.refuah) saves.push(actions.change({ kind: 'refuah' }, given.refuah))
    if (given.keystone) saves.push(actions.change({ kind: 'keystone' }, given.keystone))
    await Promise.allSettled(saves)
    // Picked on Google: its Google read now, with Stops already kept.
    if (picked) await post(`/api/admin/listings/${listing.id}/found`, { action: 'google' }).catch(() => null)
    const reads = pageReadsFor(category)
    if (given.page && reads) {
      // A page given is read as it's saved, and said so if it can't be (AddFailed8).
      const job = reads.kind
      const path = `/api/admin/watches/hours${job === 'times' ? '?job=times' : ''}`
      const reply = await post<PageReply>(path, { action: 'give', resourceId: listing.id, url: given.page }).catch(() => null)
      const page = reply?.pages?.find((p) => samePage(p.watch.url, given.page!))
      if (!page || page.watch.lastError) {
        setAddedAs({ listing, stage: 'failed', lines: [], retry: { job, watchId: page?.watch.id ?? '', was: page ? given.page : '' } })
        return
      }
    } else if (website || given.menu) await readAdded(listing)
    await seeFound(listing)
  }

  async function takeFound(listing: DirectoryResource) {
    setTaking(true)
    await post(`/api/admin/listings/${listing.id}/found`, { action: 'take' }).catch(() => null)
    onClose()
  }

  if (addedAs) {
    const { listing, stage } = addedAs
    const banner = <p role="status" className="m-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[15px] font-bold text-emerald-900">{listing.name} is added</p>
    const title = stage === 'failed' ? 'Change' : 'Add a place'
    return (
      <div className="flex flex-col gap-4">
        <AdminBack back={{ label: 'Back', onClick: onClose }} title={title} />
        {banner}
        {stage === 'reading' && <p className="m-0 text-[15px] text-slate-600">Reading its website…</p>}
        {stage === 'failed' && addedAs.retry && (
          <SourceScreen
            label={pageReadsFor(category)?.kind === 'times' ? 'A web page, or the email it comes from' : 'A web page'}
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
              <p className="m-0 text-[15px] font-extrabold text-slate-900">Found on its website</p>
              <ul className="m-0 mt-2 list-none space-y-1.5 p-0" data-testid="found-lines">
                {addedAs.lines.map((l) => (
                  <li key={l} className="text-[15px] text-slate-700">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" disabled={taking} onClick={() => void takeFound(listing)} className={SUBMIT_PILL}>
              {taking ? 'Adding…' : 'Add to the listing'}
            </button>
            <button type="button" disabled={taking} onClick={onClose} className="min-h-11 cursor-pointer text-center text-[15px] font-bold text-primary hover:underline">
              Decide later in To do
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <ListingEditorScreen
      heading="Add a place"
      category={category}
      draft={draft}
      fromGoogle={!!picked}
      existingListings={[...listings]}
      adminSubmit={{ token, onAdded: (l) => void added(l) }}
      onClose={back}
      splitContact
      overlay={
        screen && {
          title: screen.title,
          back: () => setScreen(null),
          node: <SourceScreen {...screen.props} onTried={() => {}} onDone={() => setScreen(null)} />,
        }
      }
      rowAside={(row: EditorRow) => {
        const source = sources(row)
        return source ? <RowJob source={source} /> : null
      }}
      rowSource={rowSource}
    />
  )
}
