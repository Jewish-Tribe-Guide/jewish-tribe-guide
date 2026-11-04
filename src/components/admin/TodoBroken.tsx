'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { editorRows } from '@/lib/editorRows'
import { fetchJson } from '@/lib/fetchJson'
import { listingSlug } from '@/lib/listingSlug'
import { itemsField } from '@/lib/listingView'
import { routes } from '@/lib/routes'
import { withCommunity } from '@/lib/useCommunityData'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { CameraIcon } from '@/components/icons'
import ListingEditor, { type EditorControl, type EditorStep } from '@/components/resources/ListingEditor'
import { FindSheet } from './FindSheet'
import PlaceFrame, { PlaceButtons, PlaceCard, SourceCard, placeSubline, type PlaceButton, type PlacePosition } from './PlaceFrame'
import { sourceActions } from './sourceActions'
import { brokenRows, brokenView, googleRows, stoppedGoogleAnswers, type BrokenAct, type BrokenAnswer } from './brokenView'
import type { Jobs } from './useWatchJobs'
import { shortUrl } from './watchText'
import { useHistoryDepth } from '@/lib/useHistoryDepth'

// A broken check, fixed where it's shown (boards R3Site, R2Menu, R2Google,
// R6Give, O2Pizza): the listing's field in its own editor, where it's read
// from folded under it, and the answers that act on the place right here.
// Read it again reads it now; if it's still broken, it says so and stays.

/** Give a better page, or Add a source where nothing reads it. */
type Give = Extract<BrokenAct, { kind: 'give' | 'add' }>

const isEmail = (g: Give) => g.kind === 'give' && (g.change.kind === 'newsletter' || g.change.kind === 'eruv-status')
const inputClass = 'w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3.5 text-[16px] text-slate-900'

export default function TodoBroken({
  placeId,
  name,
  label,
  jobs,
  token,
  community,
  position,
  switches,
  reload,
}: {
  placeId: string
  name: string
  /** Its line: "Website didn’t load". */
  label: string
  jobs: Jobs
  token: string
  community: string
  position: PlacePosition
  switches: ReactNode
  /** To do and the jobs read again, after an answer. */
  reload: () => Promise<void>
}) {
  const [now] = useState(() => Date.now())
  const view = brokenView(placeId, label, jobs, now)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const post = <T,>(path: string, body: Record<string, unknown>) => fetchJson<T>(withCommunity(path, community), { method: 'POST', headers, body: JSON.stringify(body) }, 'Could not do that.')
  const actions = sourceActions(placeId, post)

  // The listing, for its category and the field's own editor. An eruv has
  // none (the route 404s), and shows no card.
  const [listing, setListing] = useState<{ item: DirectoryResource; category: CategoryConfig } | 'none' | null>(null)
  const [round, setRound] = useState(0)
  const loadListing = useCallback(async () => {
    try {
      const got = await fetchJson<{ item: DirectoryResource; category: CategoryConfig }>(withCommunity(`/api/admin/watches/google?item=${placeId}`, community), { headers: { Authorization: `Bearer ${token}` } }, 'Could not open its listing.')
      setListing(got?.item && got.category ? got : 'none')
    } catch {
      setListing('none')
    }
  }, [placeId, community, token])
  useLoadOnMount(loadListing)

  // The editor's own state, for the answers: an edit is saved first.
  const control = useRef<EditorControl | null>(null)
  const [edit, setEdit] = useState<{ changed: boolean; sending: boolean }>({ changed: false, sending: false })
  const onControl = useCallback((c: EditorControl) => {
    control.current = c
    setEdit((s) => (s.changed === c.changed && s.sending === c.sending ? s : { changed: c.changed, sending: c.sending }))
  }, [])
  const [step, setStep] = useState<EditorStep | null>(null)
  // An open row or a minyan in it is an entry, as in Places' editor: a
  // swipe back closes it rather than leaving the place (Nov 4).
  useHistoryDepth('todoStep', step ? (step.depth ?? 1) : 0, () => step?.back())

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [still, setStill] = useState<string | null>(null)
  const [giving, setGiving] = useState<Give | null>(null)
  const [given, setGiven] = useState('')
  const [finding, setFinding] = useState(false)

  if (!view) return null
  const googlePlace = jobs.google?.places.find((g) => g.id === placeId)
  const loaded = listing && listing !== 'none' ? listing : null
  const rows = loaded ? brokenRows(view.field, editorRows(loaded.category, loaded.item as Record<string, unknown>, { splitContact: true })) : []
  const href = loaded ? routes.listing(community, loaded.category.id, listingSlug(loaded.item)) : (googlePlace?.href ?? null)
  // A menu's dishes typed in are saved as its reading's answer (the main
  // dishes tab's own Save), so a menu that can't be read leaves To do with
  // them. Before (the user, Nov 4: "couldn't find where to submit") they
  // had no button, and went out only with another answer.
  const food = jobs.dishes?.find((p) => p.id === placeId)
  const dishesKey = (view.kind === 'menu-load' || view.kind === 'menu-read') && loaded && food?.reading ? itemsField(loaded.category)?.key : undefined

  async function run(what: string, work: () => Promise<unknown>, after?: string | null) {
    setError(null)
    setStill(null)
    setBusy(what)
    try {
      if (control.current?.changed) {
        await control.current.send()
        if (control.current.errors.length) return
      }
      await work()
      await reload()
      await loadListing()
      setRound((n) => n + 1)
      // Still here once read again: it still doesn't load. A fixed one is
      // gone from the place, and its switch ticked (TodoPlaceScreen).
      if (after) setStill(after)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
    } finally {
      setBusy(null)
    }
  }

  async function act(a: BrokenAct) {
    if (a.kind === 'read') for (const s of a.steps) await actions.readStep(s)
    else if (a.kind === 'stop') for (const s of a.stops) await actions.stopSource(s)
    else if (a.kind === 'off') await post(`/api/admin/watches/hours${a.job === 'times' ? '?job=times' : ''}`, { action: 'off', resourceId: placeId })
    else if (a.kind === 'not-on-google') await post('/api/admin/watches/google', { action: 'not_on_google', id: placeId })
    else if (a.kind === 'not-on-refuah') await post('/api/admin/watches/hospitals', { action: 'none', resourceId: placeId })
    else if (a.kind === 'check-link') await post('/api/admin/watches/links', { action: 'check', resourceId: placeId, key: a.key })
  }

  const BUSY: Partial<Record<BrokenAct['kind'], string>> = { read: 'Reading…', stop: 'Stopping…', off: 'Saving…', 'check-link': 'Checking…' }
  const answer = (a: BrokenAnswer): PlaceButton => ({
    label: a.label,
    busy: busy === a.label && (BUSY[a.act.kind] ?? 'Saving…'),
    disabled: busy !== null || edit.sending,
    onClick: () => {
      if (a.act.kind === 'give' || a.act.kind === 'add') {
        // What it reads now, to correct or replace (R6Give).
        setGiven(isEmail(a.act) ? (view.source.name.includes('@') ? view.source.name : '') : (view.source.url ?? ''))
        setError(null)
        return setGiving(a.act)
      }
      if (a.act.kind === 'find-google') return setFinding(true)
      const after = a.act.kind === 'read' ? 'It still didn’t load.' : a.act.kind === 'check-link' ? 'It still doesn’t open.' : null
      void run(a.label, () => act(a.act), after)
    },
  })

  // ── Give: the page or address that replaces it (R6Give) ───────────────
  if (giving) {
    const menu = giving.kind === 'give' && giving.change.kind === 'menu'
    const email = isEmail(giving)
    const lower = giving.label[0].toLowerCase() + giving.label.slice(1)
    const leave = () => setGiving(null)
    const saveGiven = () =>
      void run(
        'give',
        async () => {
          if (giving.kind === 'add') await actions.addSource({ job: giving.job, email: false, label: giving.label }, given.trim())
          else await actions.change(giving.change, given.trim())
          setGiving(null)
        },
        email || giving.kind === 'add' ? null : 'It still didn’t load.',
      )
    function photos(files: File[]) {
      const body = new FormData()
      body.append('action', 'photos')
      body.append('resourceId', placeId)
      for (const f of files) body.append('file', f)
      void run('give', async () => {
        await fetchJson(withCommunity('/api/admin/main-dishes', community), { method: 'POST', headers: { Authorization: headers.Authorization }, body }, 'Could not read those photos.')
        setGiving(null)
      })
    }
    return (
      <PlaceFrame
        name={name}
        subline={null}
        position={position}
        onBack={leave}
        error={error}
        foot={
          <PlaceButtons
            buttons={[
              { label: email ? 'Save' : 'Read it', busy: busy === 'give' && (email ? 'Saving…' : 'Reading…'), disabled: busy !== null || !given.trim(), onClick: saveGiven },
              { label: 'Cancel', onClick: leave, disabled: busy !== null, computerOnly: true },
            ]}
          />
        }
      >
        <PlaceCard title={giving.label}>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13.5px] font-semibold text-slate-500">{email ? 'Its email address' : `A link to ${lower}`}</span>
            <input
              type={email ? 'email' : 'url'}
              value={given}
              onChange={(e) => setGiven(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && given.trim() && saveGiven()}
              placeholder={email ? 'office@example.org' : 'https://'}
              className={inputClass}
              autoFocus
            />
          </label>
          {menu && (
            <>
              <p className="m-0 text-center text-[13.5px] text-slate-500">or</p>
              <label className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white text-[15px] font-bold text-primary ${busy !== null ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                <CameraIcon className="h-4 w-4" />
                Add photos of the menu
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={busy !== null}
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])]
                    e.target.value = ''
                    if (files.length) photos(files)
                  }}
                />
              </label>
            </>
          )}
        </PlaceCard>
      </PlaceFrame>
    )
  }

  // ── The card: the field in its editor, or Google's (R2Google) ─────────
  let card: ReactNode = null
  if (view.field === 'google' && loaded) {
    card = (
      <PlaceCard title="Google">
        <dl className="m-0 flex flex-col">
          {googleRows(loaded.item, loaded.category).map((f) => (
            <div key={f.label} className="border-t border-slate-100 py-2.5 first:border-t-0 first:pt-0">
              <dt className="text-[13.5px] text-slate-500">{f.label}</dt>
              <dd className={`m-0 text-[15px] [overflow-wrap:anywhere] ${f.value ? 'text-slate-900' : 'text-slate-400'}`}>{f.value ?? 'Not on the listing'}</dd>
            </div>
          ))}
        </dl>
      </PlaceCard>
    )
  } else if (loaded && rows.length) {
    card = (
      <ListingEditor
        key={`${placeId}-${round}`}
        item={loaded.item}
        category={loaded.category}
        onlyRows={rows}
        splitContact
        onClose={() => {}}
        onStep={setStep}
        hosted={{ onControl }}
        adminSave={{
          label: 'Update the listing',
          via: ({ payload }) =>
            dishesKey
              ? fetch(withCommunity('/api/admin/main-dishes', community), {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ action: 'save', resourceId: placeId, always: payload.details?.[dishesKey] ?? [], sometimes: payload.details?.[`${dishesKey}_sometimes`] ?? [] }),
                })
              : fetch(withCommunity(`/api/admin/listings/${placeId}`, community), { method: 'PATCH', headers, body: JSON.stringify({ payload }) }),
          onSaved: () => {},
        }}
      />
    )
  }

  const s = view.source
  const opened = (s.url || s.why) && (
    <>
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer" className="self-start font-bold text-primary [overflow-wrap:anywhere] hover:underline">
          {shortUrl(s.url)} ↗
        </a>
      )}
      {s.why && <p className="m-0 text-slate-600">{s.why}</p>}
    </>
  )
  // Inside a minyan or a person, the answers wait for its Done.
  const inStep = !!step?.title

  return (
    <PlaceFrame
      name={name}
      subline={placeSubline(loaded?.category.label ?? googlePlace?.categoryLabel, href)}
      position={position}
      onBack={inStep ? step!.back : undefined}
      switches={inStep ? null : switches}
      source={
        !inStep && (
          <SourceCard name={s.name} rest={s.rest} failed={s.failed}>
            {opened || undefined}
          </SourceCard>
        )
      }
      error={error ?? still}
      foot={
        !inStep &&
        view.answers.length > 0 && (
          <PlaceButtons
            buttons={[
              ...(dishesKey && edit.changed ? [{ label: 'Save these dishes', busy: busy === 'save' && 'Saving…', disabled: busy !== null || edit.sending, onClick: () => void run('save', async () => {}) }] : []),
              ...(loaded ? stoppedGoogleAnswers(view, loaded.item, loaded.category) : view.answers).map(answer),
            ]}
          />
        )
      }
    >
      {card}
      {finding && googlePlace && (
        <FindSheet
          place={googlePlace}
          post={(body) => post('/api/admin/watches/google', body)}
          onClose={() => setFinding(false)}
          onPicked={() => {
            setFinding(false)
            void run('find', async () => {})
          }}
        />
      )}
    </PlaceFrame>
  )
}
