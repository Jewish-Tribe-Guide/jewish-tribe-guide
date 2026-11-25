'use client'

import { useCallback, useState } from 'react'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import type { GooglePlace } from '@/lib/googleJob'
import type { NewsletterLine } from '@/lib/nightKinds'
import { readFromRows, type ReadFromIn, type ReadFromRow } from '@/lib/readFrom'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { AdminBox, adminInputClass } from './AdminUI'
import { FindSheet } from './FindSheet'
import type { ReadStep } from './openedPlaceBoxes'
import { sourceActions } from './sourceActions'
import { useAdminApi } from './useAdminApi'

// A place's Read from box (board W3, Nov 25): what it's read from, each row
// with a check or an empty circle, and its one way to fill or redo it. The
// words are readFrom.ts's; this does what each row's buttons ask. The
// community email and any sender linked to nothing are read here, once.

const LINK = 'min-h-11 cursor-pointer whitespace-nowrap px-1 text-sm font-semibold text-primary disabled:opacity-60'
const OUTLINED = 'inline-flex min-h-10 cursor-pointer items-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-primary disabled:opacity-60'
const PRIMARY = 'inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60'

function Mark({ done }: { done: boolean }) {
  return done ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Read" className="shrink-0">
      <path d="M5 12l5 5L19 7" />
    </svg>
  ) : (
    <span role="img" aria-label="Not read" className="box-border h-[18px] w-[18px] shrink-0 rounded-full border-2 border-slate-400" />
  )
}

export type ReadFromProps = {
  placeId: string
  token: string
  /** The rows' facts, less what's read here. */
  facts: Omit<ReadFromIn, 'communityEmail' | 'waiting' | 'canRead'>
  /** What Read now reads; none, no Read now. */
  read: ReadStep | null
  saveWebsite: (url: string) => Promise<void>
  saveMenu?: (url: string) => Promise<void>
  /** Link a sender that came in to this place. */
  linkEmail: (watch: { id: string; sender: string }) => Promise<void>
  /** Its place on the Google job, for Find it on Google. */
  google?: GooglePlace | null
  onChanged: () => Promise<void>
}

type Loaded = { email: string | null; waiting: { id: string; sender: string } | null }

export default function ReadFrom({ placeId, token, facts, read, saveWebsite, saveMenu, linkEmail, google, onChanged }: ReadFromProps) {
  const community = useCommunitySlug()
  const api = useAdminApi(token)
  const emails = facts.kind === 'shuls' || facts.kind === 'eruv'
  const [loaded, setLoaded] = useState<Loaded>({ email: null, waiting: null })
  const load = useCallback(async () => {
    if (!emails) return
    const [own, inbox] = await Promise.all([
      api.get<{ email: string | null }>('/api/admin/community-email').catch(() => null),
      api.get<{ newsletters: NewsletterLine[] }>('/api/admin/watches/newsletters').catch(() => null),
    ])
    const waiting = inbox?.newsletters.find((n) => !n.shul)
    setLoaded({ email: own?.email ?? null, waiting: waiting ? { id: waiting.watchId, sender: waiting.email } : null })
  }, [api, emails])
  useLoadOnMount(load)

  const [editing, setEditing] = useState<'website' | 'menu' | null>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [readDone, setReadDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState<{ key: string; text: string } | null>(null)

  const rows = readFromRows({ ...facts, communityEmail: loaded.email, waiting: loaded.waiting, canRead: !!read })
  const post = <T,>(path: string, body: Record<string, unknown>) => api.post<T>(path, body)

  async function run(key: string, work: () => Promise<unknown>, failed: string) {
    setBusy(key)
    setError(null)
    try {
      await work()
      await onChanged()
      return true
    } catch (err) {
      setError({ key, text: err instanceof Error ? err.message : failed })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function save(row: ReadFromRow) {
    const url = value.trim()
    if (!url) return
    const done = await run(row.key, () => (row.key === 'menu' ? saveMenu!(url) : saveWebsite(url)), 'Could not save it.')
    if (done) setEditing(null)
  }

  const field = (row: ReadFromRow) => (
    <form
      className="flex gap-2 px-4 pb-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save(row)
      }}
    >
      <label className="sr-only" htmlFor={`read-from-${row.key}`}>
        {row.key === 'menu' ? 'Its menu link' : 'Its website'}
      </label>
      <input id={`read-from-${row.key}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={row.key === 'menu' ? 'its-website.org/menu' : 'its-website.org'} className={`${adminInputClass} min-w-0 flex-1`} />
      <button type="submit" disabled={!!busy || !value.trim()} className={PRIMARY}>
        {busy === row.key ? 'Saving…' : 'Save'}
      </button>
    </form>
  )

  function controls(row: ReadFromRow) {
    const out = []
    for (const a of row.actions) {
      if (a === 'read' && read) {
        out.push(
          <button key="read" type="button" disabled={!!busy} onClick={() => void run('read', () => sourceActions(placeId, post).readStep(read), 'Couldn’t read it.').then((ok) => setReadDone(ok))} className={LINK}>
            {busy === 'read' ? 'Reading…' : readDone ? 'Read just now' : 'Read now'}
          </button>,
        )
      }
      if (a === 'change') {
        out.push(
          <button key="change" type="button" aria-expanded={editing === row.key} onClick={() => { setValue(''); setEditing(editing === row.key ? null : (row.key as 'website' | 'menu')) }} className={LINK}>
            Change
          </button>,
        )
      }
      if (a === 'copy' && row.copy) {
        const address = row.copy
        out.push(
          <button key="copy" type="button" onClick={() => void navigator.clipboard?.writeText(address).then(() => setCopied(true), () => {})} className={OUTLINED}>
            {copied ? 'Copied' : 'Copy address'}
          </button>,
        )
      }
      if (a === 'link' && row.link) {
        const watch = row.link
        out.push(
          <button key="link" type="button" disabled={!!busy} onClick={() => void run('emails', () => linkEmail(watch), 'Could not link it.').then((ok) => { if (ok) void load() })} className={OUTLINED}>
            {busy === 'emails' ? 'Linking…' : 'Link it'}
          </button>,
        )
      }
      if (a === 'find' && google) {
        out.push(
          <button key="find" type="button" onClick={() => setFinding(true)} className={OUTLINED}>
            Find it on Google
          </button>,
        )
      }
      if (a === 'setup') {
        out.push(
          <a key="setup" href={`${adminBase(community)}/team/email`} className={OUTLINED}>
            Set it up
          </a>,
        )
      }
    }
    return out
  }

  return (
    <AdminBox title="Read from">
      {rows.map((row) => (
        <div key={row.key} data-testid={`read-from-${row.key}`}>
          <div className="flex min-h-11 items-center gap-3 px-4 py-2.5">
            <Mark done={row.done} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[0.9375rem] font-semibold text-slate-900">{row.name}</span>
              <span className={`text-sm [overflow-wrap:anywhere] ${row.amber ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>{row.line}</span>
            </span>
            {controls(row)}
          </div>
          {(row.actions.includes('add') || editing === row.key) && field(row)}
          {error?.key === row.key && <p className="m-0 px-4 pb-3 text-sm text-red-700">{error.text}</p>}
        </div>
      ))}
      {error?.key === 'read' && <p className="m-0 px-4 pb-3 text-sm text-red-700">{error.text}</p>}
      {finding && google && (
        <FindSheet
          place={google}
          post={(body) => post('/api/admin/watches/google', body)}
          onPicked={() => {
            setFinding(false)
            void onChanged()
          }}
          onClose={() => setFinding(false)}
        />
      )}
    </AdminBox>
  )
}
