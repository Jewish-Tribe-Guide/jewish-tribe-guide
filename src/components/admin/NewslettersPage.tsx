'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import type { NewsletterLine } from '@/lib/nightKinds'
import { AdminBack, AdminBox, AdminCount, AdminField, AdminRow, adminInputClass } from './AdminUI'

// ── Watches → Newsletters (admin drawings 18 and 18b, Oct 29) ───────────────
// Shul newsletters come in through a Google Apps Script in the guide's own
// Gmail. Set up here: the script is handed out with this community's own
// key in it (newsletterScript.ts), four steps beside it, and a line that
// says whether it's running, from the hour it last checked in. Under it the
// newsletters it reads, each with its shul: one is added here, a sender
// not linked to a shul is linked in place.

type Place = { id: string; name: string; categoryLabel: string }
export type NewslettersLoaded = {
  available: boolean
  script: string | null
  checkedAt: string | null
  account: string | null
  newsletters: NewsletterLine[]
  places: Place[]
}

/** The script checks in every hour: three hours without, it has stopped. */
export const STOPPED_AFTER_MS = 3 * 60 * 60 * 1000

const SMALL_BUTTON = 'rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const BUTTON = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-[14.5px] font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50'
const PRIMARY = 'min-h-11 rounded-lg bg-primary px-4 text-[14.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50'

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

function Status({ data, now, onSetUp }: { data: NewslettersLoaded; now: number; onSetUp: () => void }) {
  if (!data.checkedAt) {
    return (
      <div className="flex items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-4 py-3.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" />
        <span className="flex-1 text-[15px] font-semibold text-slate-900">Not set up yet</span>
      </div>
    )
  }
  const stopped = now - Date.parse(data.checkedAt) > STOPPED_AFTER_MS
  const where = data.account ?? 'the guide’s Gmail'
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-[10px] border px-4 py-3 ${stopped ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${stopped ? 'bg-amber-600' : 'bg-green-700'}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-slate-900 [overflow-wrap:anywhere]">{stopped ? `Stopped checking ${where}` : `Checking ${where} every hour`}</span>
        <span className={`text-[13px] ${stopped ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>Last checked {checkedWhen(data.checkedAt, now)}</span>
      </span>
      <button type="button" onClick={onSetUp} className={BUTTON}>
        Set up again
      </button>
    </div>
  )
}

function Step({ n, title, line, children }: { n: number; title: React.ReactNode; line?: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0">
      <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-bold text-primary">
        {n}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <span className="text-[15px] font-semibold text-slate-900">{title}</span>
        {line && <span className="text-[13.5px] text-slate-600">{line}</span>}
        {children}
      </span>
    </li>
  )
}

function SetUp({ script }: { script: string }) {
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
    <AdminBox title="Set it up">
      <ol className="m-0 list-none p-0">
        <Step n={1} title="Make a Gmail for the guide" line="Sign it up for each shul’s newsletter" />
        <Step n={2} title="Copy the script">
          <span className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <code className="min-w-0 flex-[1_1_320px] overflow-hidden whitespace-pre rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-700">
              {scriptPreview(script)}
            </code>
            <button type="button" onClick={() => void copy()} className={PRIMARY}>
              {copied ? 'Copied' : 'Copy the script'}
            </button>
          </span>
          {copied === false && <span className="text-[13px] text-red-700">Couldn’t copy. Try again.</span>}
        </Step>
        <Step
          n={3}
          title={
            <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Open script.google.com ↗
            </a>
          }
          line="New project, then paste over what’s there"
        />
        <Step n={4} title="Run install" line="Pick install at the top, press Run, then Allow" />
      </ol>
    </AdminBox>
  )
}

function LinkSender({ places, busy, onLink, onIgnore }: { places: Place[]; busy: boolean; onLink: (id: string) => void; onIgnore: () => void }) {
  const [name, setName] = useState('')
  const place = places.find((p) => p.name === name.trim())
  return (
    <span className="mt-1.5 flex flex-wrap gap-2" data-testid="newsletter-unlinked">
      <input
        type="text"
        list="newsletter-places"
        aria-label="The shul it’s from"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="The shul it’s from"
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <button type="button" disabled={busy || !place} onClick={() => place && onLink(place.id)} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        Link
      </button>
      <button type="button" disabled={busy} onClick={onIgnore} className={SMALL_BUTTON}>
        Not a shul
      </button>
    </span>
  )
}

function AddNewsletter({ places, busy, onAdd, onCancel }: { places: Place[]; busy: boolean; onAdd: (placeId: string, email: string) => void; onCancel: () => void }) {
  const [shul, setShul] = useState('')
  const [email, setEmail] = useState('')
  const place = places.find((p) => p.name === shul.trim())
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (place && email.trim()) onAdd(place.id, email.trim())
      }}
      className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3.5"
    >
      <span className="min-w-[200px] flex-1">
        <AdminField label="Shul">
          <input type="text" list="newsletter-places" value={shul} onChange={(e) => setShul(e.target.value)} className={adminInputClass} />
        </AdminField>
      </span>
      <span className="min-w-[240px] flex-1">
        <AdminField label="Its newsletter’s email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@shul.org" className={adminInputClass} />
        </AdminField>
      </span>
      <span className="flex gap-2">
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !place || !email.trim()} className={PRIMARY}>
          Add
        </button>
      </span>
    </form>
  )
}

export default function NewslettersPage({ token }: { token: string }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const [data, setData] = useState<NewslettersLoaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [setUpAgain, setSetUpAgain] = useState(false)
  // Read once a load; the page is reloaded to refresh.
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setData(await fetchJson<NewslettersLoaded>(withCommunity('/api/admin/watches/newsletters', community), { headers: { Authorization: `Bearer ${token}` } }, 'Couldn’t load the newsletters.'))
      setNow(Date.now())
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Couldn’t load the newsletters.')
    }
  }, [token, community])
  useLoadOnMount(load)

  async function act(body: Record<string, unknown>): Promise<boolean> {
    setError(null)
    setBusy(true)
    try {
      await fetchJson(
        withCommunity('/api/admin/watches', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'Couldn’t do that.',
      )
      await load()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t do that.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const back = <AdminBack back={{ label: 'Watches', href: `${base}/watches` }} title="Newsletters" />
  if (loadError) return <div className="space-y-3.5">{back}<p className="text-sm text-red-700">{loadError}</p></div>
  if (!data) return <div className="space-y-3.5">{back}<p className="text-sm text-muted">Loading…</p></div>

  const showSteps = data.script && (!data.checkedAt || setUpAgain)
  return (
    <div className="space-y-3.5">
      {back}
      {data.available ? (
        <Status data={data} now={now} onSetUp={() => setSetUpAgain((s) => !s)} />
      ) : (
        <p className="rounded-[10px] border border-slate-200 bg-white px-4 py-3.5 text-[15px] text-slate-600">Newsletters can’t be set up here yet.</p>
      )}
      {showSteps && <SetUp script={data.script!} />}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <AdminBox
        title="Newsletters"
        action={
          <>
            {data.newsletters.length > 0 && <AdminCount n={data.newsletters.length} />}
            {!adding && (
              <button type="button" onClick={() => setAdding(true)} className={`${BUTTON} inline-flex items-center gap-1.5`}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Add a newsletter
              </button>
            )}
          </>
        }
      >
        {adding && (
          <AddNewsletter
            places={data.places}
            busy={busy}
            onCancel={() => setAdding(false)}
            onAdd={(resourceId, url) => void act({ action: 'add', purpose: 'times', url, resourceId }).then((ok) => ok && setAdding(false))}
          />
        )}
        {data.newsletters.length === 0 && !adding && <p className="m-0 px-4 py-3.5 text-sm text-slate-500">None yet</p>}
        <ul className="m-0 list-none p-0">
          {data.newsletters.map((n) => {
            const line = (
              <>
                <span className="[overflow-wrap:anywhere]">{n.email}</span> · <span className={n.bad ? 'font-semibold text-amber-800' : ''}>{n.status}</span>
              </>
            )
            return (
              <li key={n.watchId} className="border-b border-slate-100 last:border-b-0">
                {n.shul && n.page ? (
                  <AdminRow href={`${base}/watches/${n.page}`} name={n.shul} line={line} />
                ) : (
                  <div className="flex flex-col gap-0.5 px-4 py-2.5">
                    <span className="text-[15px] font-semibold text-slate-900 [overflow-wrap:anywhere]">{n.shul ?? n.email}</span>
                    <span className="text-[13px] font-semibold text-amber-800">{n.status}</span>
                    {!n.shul && (
                      <LinkSender
                        places={data.places}
                        busy={busy}
                        onLink={(resourceId) => void act({ action: 'link', id: n.watchId, resourceId })}
                        onIgnore={() => void act({ action: 'ignore', id: n.watchId })}
                      />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </AdminBox>
      <datalist id="newsletter-places">
        {data.places.map((p) => (
          <option key={p.id} value={p.name}>
            {p.categoryLabel}
          </option>
        ))}
      </datalist>
    </div>
  )
}
