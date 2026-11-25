'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { AdminBack, AdminBox, AdminRow, adminInputClass } from './AdminUI'
import { useAdminApi } from './useAdminApi'
import type { NewslettersLoaded } from './NewslettersPage'

// ── Settings › Team › Community email (board E3, Nov 25) ────────────────────
// The guide's own Gmail, not anyone's own: replies to the site's emails go
// to it (confirmationEmail.ts), and the newsletter script runs in it to
// read the shuls' and eruvs' emails. Make it, save its address, then set
// the script up in it. Setting the script up moved here from Watches ›
// Newsletters, which is now only the list of emails it reads, opened from
// here.

export type CommunityEmailLoaded = {
  email: string | null
  /** False before migration 116: the address can't be saved yet. */
  canSave: boolean
  checkedAt: string | null
  lastEmailAt: string | null
}

/** The script checks in every hour: three hours without, it has stopped. */
export const STOPPED_AFTER_MS = 3 * 60 * 60 * 1000

const BUTTON = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-[0.90625rem] font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50'
const PRIMARY = 'min-h-11 rounded-lg bg-primary px-4 text-[0.90625rem] font-semibold text-white hover:opacity-90 disabled:opacity-50'

/** "3:00 PM" today, else "Oct 27, 3:00 PM". */
export function checkedWhen(iso: string, now: number): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return at.toDateString() === new Date(now).toDateString() ? time : `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

/** The script's first lines, as the page shows them: the site, the
 *  community and the key, shortened. */
export function scriptPreview(script: string): string {
  return script
    .split('\n')
    .filter((l) => /^var (SITE|COMMUNITY|KEY) = /.test(l))
    .map((l) => l.replace(/^(var KEY = ')(.{7}).+(.{4})'$/, '$1$2…$3\''))
    .join('\n')
}

function Status({ data, now, onSetUp, onUpdate }: { data: NewslettersLoaded; now: number; onSetUp: () => void; onUpdate: () => void }) {
  const stopped = now - Date.parse(data.checkedAt!) > STOPPED_AFTER_MS
  const where = data.account ?? 'the guide’s Gmail'
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-[10px] border px-4 py-3 ${stopped ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${stopped ? 'bg-amber-600' : 'bg-green-700'}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.9375rem] font-semibold text-slate-900 [overflow-wrap:anywhere]">{stopped ? `Stopped checking ${where}` : `Checking ${where}`}</span>
        <span className={`text-[0.8125rem] ${stopped ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>
          Last checked {checkedWhen(data.checkedAt!, now)} · Read now {data.readNow ? 'on' : 'off'}
        </span>
      </span>
      {stopped || !data.readNow ? (
        <button type="button" onClick={onSetUp} className={BUTTON}>
          Set up
        </button>
      ) : (
        data.script && (
          <button type="button" onClick={onUpdate} className={BUTTON}>
            Update the script
          </button>
        )
      )}
    </div>
  )
}

function Step({ n, title, line, dim, children }: { n: number; title: React.ReactNode; line?: string; dim?: boolean; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0">
      <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${dim ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-primary'}`}>
        {n}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <span className="text-[0.9375rem] font-semibold text-slate-900">{title}</span>
        {line && <span className="text-[0.84375rem] text-slate-600">{line}</span>}
        {children}
      </span>
    </li>
  )
}

/** The script's first lines and its Copy button. */
function CopyScript({ script, disabled }: { script: string; disabled?: boolean }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <>
      <span className="mt-1.5 flex flex-wrap items-center gap-2.5">
        <code className="min-w-0 flex-[1_1_320px] overflow-hidden whitespace-pre rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[0.78125rem] leading-relaxed text-slate-700">
          {scriptPreview(script)}
        </code>
        <button type="button" disabled={disabled} onClick={() => void copy()} className={PRIMARY}>
          {copied ? 'Copied' : 'Copy the script'}
        </button>
      </span>
      {copied === false && <span className="text-[0.8125rem] text-red-700">Couldn’t copy. Try again.</span>}
    </>
  )
}

// A running script is a copy of scripts/newsletter-apps-script.js from when
// it was pasted. When that file changes (Nov 20: it sends Gmail's verdict on
// who sent an email), the new one goes over the old in the same project, as
// a new version of the same deployment, so its link and key stay.
function UpdateScript({ script }: { script: string }) {
  return (
    <AdminBox title="Update the script">
      <ol className="m-0 list-none p-0">
        <Step n={1} title="Copy the script">
          <CopyScript script={script} />
        </Step>
        <Step
          n={2}
          title={
            <a href="https://script.google.com/home" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Open script.google.com ↗
            </a>
          }
          line="Open the guide’s project, paste over what’s there, Save"
        />
        <Step n={3} title="Deploy a new version" line="Deploy, Manage deployments, the pencil, New version" />
      </ol>
    </AdminBox>
  )
}

/** Board E3's second box: dimmed, and nothing in it works, until the
 *  address is saved. `from`: the first step's number. */
function ReadEmails({ script, from, off, onLink }: { script: string; from: number; off: boolean; onLink: (url: string) => Promise<string | null> }) {
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [trying, setTrying] = useState(false)
  async function tryLink() {
    setTrying(true)
    setLinkError(await onLink(link.trim()))
    setTrying(false)
  }
  return (
    <div className={off ? 'opacity-55' : ''} inert={off}>
      <AdminBox title="Read the newsletters">
        <ol className="m-0 list-none p-0">
          <Step n={from} dim={off} title="Sign it up for each shul’s and eruv’s emails" />
          <Step n={from + 1} dim={off} title="Copy the script">
            <CopyScript script={script} disabled={off} />
          </Step>
          <Step
            n={from + 2}
            dim={off}
            title={
              <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Open script.google.com ↗
              </a>
            }
            line="Signed in as the guide’s Gmail. New project, then paste"
          />
          <Step n={from + 3} dim={off} title="Run install, then Deploy" line="Web app, access Anyone" />
          <Step n={from + 4} dim={off} title="Paste its link">
            <span className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <input
                type="url"
                aria-label="Its web app link"
                placeholder="Its web app link"
                value={link}
                disabled={off}
                onChange={(e) => setLink(e.target.value)}
                className={`${adminInputClass} min-w-0 flex-[1_1_260px]`}
              />
              <button type="button" disabled={off || trying || !link.trim()} onClick={() => void tryLink()} className={PRIMARY}>
                {trying ? 'Trying it…' : 'Save'}
              </button>
            </span>
            {linkError && <span className="text-[0.8125rem] font-semibold text-red-700">{linkError}</span>}
          </Step>
        </ol>
      </AdminBox>
    </div>
  )
}

function Address({ saved, canSave, numbered, onSave }: { saved: string | null; canSave: boolean; numbered: boolean; onSave: (email: string) => Promise<string | null> }) {
  const [value, setValue] = useState(saved ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const changed = value.trim() !== (saved ?? '')
  async function save() {
    setSaving(true)
    setError(await onSave(value.trim()))
    setSaving(false)
  }
  const field = (
    <span className="flex flex-col gap-2">
      <label htmlFor="community-email" className="text-[0.9375rem] font-semibold text-slate-900">
        Its address
      </label>
      <form
        noValidate
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (changed && value.trim()) void save()
        }}
      >
        <input
          id="community-email"
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="yourguide@gmail.com"
          className={`${adminInputClass} min-w-0 flex-[1_1_240px]`}
        />
        <button type="submit" disabled={!canSave || saving || !changed || !value.trim()} className={PRIMARY}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
      {!canSave && <span className="text-[0.8125rem] text-slate-600">It can’t be saved here yet.</span>}
      {error && <span className="text-[0.8125rem] font-semibold text-red-700">{error}</span>}
    </span>
  )
  if (!numbered) return <AdminBox>{<div className="px-4 py-3.5">{field}</div>}</AdminBox>
  return (
    <AdminBox>
      <ol className="m-0 list-none p-0">
        <Step
          n={1}
          title={
            <a href="https://accounts.google.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Make a Gmail for the guide ↗
            </a>
          }
          line="Not anyone’s own"
        />
        <li className="flex gap-3 px-4 py-3.5">
          <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-bold text-primary">
            2
          </span>
          <span className="min-w-0 flex-1 pt-0.5">{field}</span>
        </li>
      </ol>
    </AdminBox>
  )
}

export default function CommunityEmailPage({ token }: { token: string }) {
  const base = adminBase(useCommunitySlug())
  const api = useAdminApi(token)
  const [own, setOwn] = useState<CommunityEmailLoaded | null>(null)
  const [script, setScript] = useState<NewslettersLoaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [setUpAgain, setSetUpAgain] = useState(false)
  const [updating, setUpdating] = useState(false)
  // Read once a load; the page is reloaded to refresh.
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        api.get<CommunityEmailLoaded>('/api/admin/community-email', 'Couldn’t load the community email.'),
        api.get<NewslettersLoaded>('/api/admin/watches/newsletters', 'Couldn’t load the community email.'),
      ])
      setOwn(a)
      setScript(b)
      setNow(Date.now())
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Couldn’t load the community email.')
    }
  }, [api])
  useLoadOnMount(load)

  const back = <AdminBack back={{ label: 'Team', href: `${base}/team` }} title="Community email" />
  if (loadError) return <div className="max-w-[840px] space-y-3.5">{back}<p className="text-sm text-red-700">{loadError}</p></div>
  if (!own || !script) return <div className="max-w-[840px] space-y-3.5">{back}<p className="text-sm text-muted">Loading…</p></div>

  async function saveEmail(email: string): Promise<string | null> {
    try {
      await api.post('/api/admin/community-email', { email }, 'Couldn’t save that.')
      await load()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'Couldn’t save that.'
    }
  }

  async function saveLink(url: string): Promise<string | null> {
    try {
      await api.post('/api/admin/watches/newsletters', { url }, 'That link didn’t answer. Check access is set to Anyone.')
      setSetUpAgain(false)
      await load()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'That link didn’t answer. Check access is set to Anyone.'
    }
  }

  const running = !!script.checkedAt
  const showSteps = script.script && (!running || setUpAgain)
  return (
    <div className="max-w-[840px] space-y-3.5">
      {back}
      <Address key={own.email ?? ''} saved={own.email} canSave={own.canSave} numbered={!own.email} onSave={saveEmail} />
      {!script.available && (
        <p className="rounded-[10px] border border-slate-200 bg-white px-4 py-3.5 text-[0.9375rem] text-slate-600">The shuls’ and eruvs’ emails can’t be set up here yet.</p>
      )}
      {running && <Status data={script} now={now} onSetUp={() => setSetUpAgain((s) => !s)} onUpdate={() => setUpdating((u) => !u)} />}
      {showSteps && <ReadEmails script={script.script!} from={own.email ? 1 : 3} off={!own.email} onLink={saveLink} />}
      {!showSteps && updating && script.script && <UpdateScript script={script.script} />}
      {(running || script.newsletters.length > 0) && (
        <AdminBox>
          <AdminRow
            href={`${base}/watches/newsletters`}
            name="The shuls’ and eruvs’ emails"
            aside={`${script.newsletters.length}`}
            line={own.lastEmailAt ? `Last one ${checkedWhen(own.lastEmailAt, now)}` : 'None in yet'}
          />
        </AdminBox>
      )}
    </div>
  )
}
