'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import type { NewsletterLine } from '@/lib/nightKinds'
import { pageFrom } from '@/lib/placeLink'
import { AdminBack, AdminBox, AdminCount, AdminField, AdminRow, adminInputClass } from './AdminUI'
import { useAdminApi } from './useAdminApi'

// ── The shuls' and eruvs' emails (admin drawings 18 and 18b, Oct 29) ────────
// They come in through a Google Apps Script in the community email's Gmail.
// Setting that up moved to the Community email page (board E3, Nov 25,
// CommunityEmailPage.tsx), which opens this list: the emails it reads, each
// with its place. One is added here; a sender not linked to a place is
// linked in place, or from the place's own Read from box.

type Place = { id: string; name: string; categoryLabel: string }
export type NewslettersLoaded = {
  available: boolean
  script: string | null
  checkedAt: string | null
  account: string | null
  /** The script's web app link is in: an email can be looked for at once. */
  readNow?: boolean
  newsletters: NewsletterLine[]
  places: Place[]
}

const SMALL_BUTTON = 'rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const BUTTON = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-[0.90625rem] font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50'
const PRIMARY = 'min-h-11 rounded-lg bg-primary px-4 text-[0.90625rem] font-semibold text-white hover:opacity-90 disabled:opacity-50'

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
  const api = useAdminApi(token)
  const [data, setData] = useState<NewslettersLoaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api.get<NewslettersLoaded>('/api/admin/watches/newsletters', 'Couldn’t load the newsletters.'))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Couldn’t load the newsletters.')
    }
  }, [api])
  useLoadOnMount(load)

  async function act(body: Record<string, unknown>): Promise<boolean> {
    setError(null)
    setBusy(true)
    try {
      await api.post('/api/admin/watches', body, 'Couldn’t do that.')
      await load()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t do that.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const back = <AdminBack back={{ label: 'Community email', href: `${base}/team/email` }} title="The shuls’ and eruvs’ emails" />
  if (loadError) return <div className="space-y-3.5">{back}<p className="text-sm text-red-700">{loadError}</p></div>
  if (!data) return <div className="space-y-3.5">{back}<p className="text-sm text-muted">Loading…</p></div>

  return (
    <div className="space-y-3.5">
      {back}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <AdminBox
        title="Emails"
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
                  <AdminRow href={`${base}/watches/${pageFrom(n.page, 'job/newsletters')}`} name={n.shul} line={line} />
                ) : (
                  <div className="flex flex-col gap-0.5 px-4 py-2.5">
                    <span className="text-[0.9375rem] font-semibold text-slate-900 [overflow-wrap:anywhere]">{n.shul ?? n.email}</span>
                    <span className="text-[0.8125rem] font-semibold text-amber-800">{n.status}</span>
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
