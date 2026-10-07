'use client'

import { useCallback, useMemo, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { eruvView } from '@/lib/eruv'
import { withoutNames, type EruvLineFile } from '@/lib/eruvLine'
import { shapeOf } from '@/lib/eruvShape'
import type { AdminEruv } from '@/lib/eruvStore'

// ── The "Eruvim" tab (Oct 7) ────────────────────────────────────────────────
// Each eruv the guide shows: what the public sees of it (its status, as
// read from its own page), what an admin sets (where it goes, its site,
// hotline, alerts, the status page, its line's address), and its line.
// A line read from the eruv's map waits here until an admin checks the
// area against the eruv's own map and uses it; until then the guide's map
// keeps the line it had.

type Loaded = { available: boolean; timezone: string; eruvim: AdminEruv[] }

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The line drawn small: its enclosed area filled, the gaps the guide
 *  joined in red, so an admin can compare it with the eruv's own map. */
function LinePreview({ file, leaveOut }: { file: EruvLineFile; leaveOut: string[] }) {
  const kept = useMemo(() => withoutNames(file, leaveOut), [file, leaveOut])
  const shape = useMemo(() => (kept.lines.length ? shapeOf(kept) : { areas: [], joins: [] }), [kept])
  const pts = file.lines.flatMap((l) => l.points)
  if (pts.length === 0) return null
  const lats = pts.map((p) => p[0])
  const lngs = pts.map((p) => p[1])
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const w = (maxLng - minLng) * k || 1e-6
  const h = maxLat - minLat || 1e-6
  const W = 320
  const H = Math.max(120, Math.min(320, (W * h) / w))
  const s = Math.min((W - 16) / w, (H - 16) / h)
  const xy = ([lat, lng]: [number, number]) => `${(8 + (lng - minLng) * k * s).toFixed(1)},${(H - 8 - (lat - minLat) * s).toFixed(1)}`
  const left = new Set(leaveOut.map((n) => n.toLowerCase()))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="max-w-full rounded-lg border border-slate-200 bg-slate-50" role="img" aria-label="The eruv’s area">
      {shape.areas.map((a, i) => (
        <polygon key={i} points={a.map(xy).join(' ')} fill="rgba(21,128,61,.22)" stroke="none" />
      ))}
      {file.lines.map((l, i) => (
        <polyline key={i} points={l.points.map(xy).join(' ')} fill="none" stroke={left.has(l.name.toLowerCase()) ? '#94a3b8' : '#14532d'} strokeWidth={1.5} strokeDasharray={left.has(l.name.toLowerCase()) ? '3 3' : undefined} />
      ))}
      {shape.joins.map((j, i) => (
        <polyline key={i} points={j.map(xy).join(' ')} fill="none" stroke="#dc2626" strokeWidth={3} />
      ))}
    </svg>
  )
}

const input = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

type Draft = Pick<AdminEruv, 'name' | 'covers' | 'website' | 'hotline' | 'alertsUrl' | 'statusUrl' | 'statusDated' | 'lineUrl' | 'sortOrder' | 'active' | 'lineLeaveOut'>
const draftOf = (e: AdminEruv): Draft => ({
  name: e.name,
  covers: e.covers,
  website: e.website,
  hotline: e.hotline,
  alertsUrl: e.alertsUrl,
  statusUrl: e.statusUrl,
  statusDated: e.statusDated,
  lineUrl: e.lineUrl,
  sortOrder: e.sortOrder,
  active: e.active,
  lineLeaveOut: e.lineLeaveOut,
})

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      {children}
      {help && <span className="mt-0.5 block text-xs text-muted">{help}</span>}
    </label>
  )
}

function EruvCard({ eruv, timezone, busy, onAct, onSave }: { eruv: AdminEruv; timezone: string; busy: boolean; onAct: (action: 'check' | 'remove' | 'approve-line') => void; onSave: (d: Draft) => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(eruv))
  const [confirmRemove, setConfirmRemove] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(eruv))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const view = eruvView(eruv, new Date(), timezone, null)
  const names = [...new Set([...(eruv.linePending?.lines ?? []), ...(eruv.rawLine?.lines ?? [])].map((l) => l.name).filter(Boolean))]
  const tone = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700', grey: 'text-slate-600' }[view.tone]

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="admin-eruv">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">
          {eruv.name}
          {!eruv.active && <span className="ml-2 text-sm font-semibold text-slate-500">Hidden</span>}
        </h2>
        <button type="button" disabled={busy} onClick={() => onAct('check')} className="cursor-pointer rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Check now
        </button>
      </div>
      <p className={`mt-1 text-sm font-semibold ${tone}`}>{view.label}</p>
      {view.checked && <p className="text-xs text-muted">{view.checked}</p>}
      {eruv.statusWords && <p className="text-xs text-muted">Read from: “{eruv.statusWords}”{eruv.statusPostedOn ? `, dated ${day(eruv.statusPostedOn)}` : ''}</p>}
      {eruv.statusError && <p className="text-xs text-red-700">Last read failed: {eruv.statusError}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className={input} value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Order" help="Lower comes first.">
          <input className={input} type="number" value={draft.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Where it goes" help="In words, for its listing. Name the hospitals inside it.">
            <textarea className={input} rows={2} value={draft.covers ?? ''} onChange={(e) => set('covers', e.target.value)} />
          </Field>
        </div>
        <Field label="Website">
          <input className={input} value={draft.website ?? ''} onChange={(e) => set('website', e.target.value)} />
        </Field>
        <Field label="Hotline" help="Shown on its listing, tap to call.">
          <input className={input} value={draft.hotline ?? ''} onChange={(e) => set('hotline', e.target.value)} />
        </Field>
        <Field label="Email alerts" help="Where people sign up for the eruv’s own alerts.">
          <input className={input} value={draft.alertsUrl ?? ''} onChange={(e) => set('alertsUrl', e.target.value)} />
        </Field>
        <Field label="Status page" help="The page it says “The Eruv is up” on. Empty: no status online.">
          <input className={input} value={draft.statusUrl ?? ''} onChange={(e) => set('statusUrl', e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" className="mt-0.5" checked={draft.statusDated} onChange={(e) => set('statusDated', e.target.checked)} />
          <span>
            It dates each week’s post
            <span className="block text-xs text-muted">Then last week’s “up” shows as “Not posted yet this week”. Leave off for an eruv whose date is only when it last changed.</span>
          </span>
        </label>
        <div className="sm:col-span-2">
          <Field label="Its line" help="A GeoJSON file, or a Google My Maps link. Read every Thursday and the day before Yom Tov.">
            <input className={input} value={draft.lineUrl ?? ''} onChange={(e) => set('lineUrl', e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
          Shown on the site
        </label>
      </div>

      {(eruv.linePending || eruv.rawLine) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {eruv.linePending && (
            <div data-testid="eruv-line-pending">
              <p className="text-sm font-bold text-amber-800">{eruv.rawLine ? 'Its line has changed' : 'Its line, read for the first time'}</p>
              <p className="mb-1.5 text-xs text-muted">
                Read {eruv.lineReadAt ? day(eruv.lineReadAt) : ''}. Check the green area against the eruv’s own map. Red marks a gap in their line the guide joined.
              </p>
              <LinePreview file={eruv.linePending} leaveOut={draft.lineLeaveOut} />
              <button type="button" disabled={busy || dirty} onClick={() => onAct('approve-line')} className="mt-2 cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                Use this line
              </button>
              {dirty && <p className="mt-1 text-xs text-muted">Save your changes first.</p>}
            </div>
          )}
          {eruv.rawLine && (
            <div>
              <p className="text-sm font-bold text-slate-800">On the map now</p>
              <p className="mb-1.5 text-xs text-muted">
                Used since {eruv.lineApprovedAt ? day(eruv.lineApprovedAt) : ''}
                {eruv.lineApprovedBy ? `, by ${eruv.lineApprovedBy}` : ''}.
              </p>
              <LinePreview file={eruv.rawLine} leaveOut={draft.lineLeaveOut} />
            </div>
          )}
        </div>
      )}
      {eruv.lineError && <p className="mt-2 text-xs text-red-700">Last read of its line failed: {eruv.lineError}</p>}

      {names.length > 1 && (
        <fieldset className="mt-3">
          <legend className="text-xs font-semibold text-slate-700">Pieces of its line (untick one to leave it out of the area)</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {names.map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={!draft.lineLeaveOut.includes(n)} onChange={(e) => set('lineLeaveOut', e.target.checked ? draft.lineLeaveOut.filter((x) => x !== n) : [...draft.lineLeaveOut, n])} />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !dirty} onClick={() => onSave(draft)} className="cursor-pointer rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          Save
        </button>
        {confirmRemove ? (
          <span className="flex items-center gap-2 text-sm">
            Remove {eruv.name}?
            <button type="button" disabled={busy} onClick={() => onAct('remove')} className="cursor-pointer font-semibold text-red-700 hover:underline">
              Remove
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)} className="cursor-pointer text-slate-600 hover:underline">
              Keep
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)} className="cursor-pointer text-sm font-semibold text-red-700 hover:underline">
            Remove
          </button>
        )}
      </div>
    </section>
  )
}

export default function EruvimManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/eruvim', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the eruvim.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  async function post(id: string, body: Record<string, unknown>) {
    setSaveError(null)
    setBusy(id)
    try {
      const res = await fetchJson<{ eruv?: AdminEruv }>(
        withCommunity('/api/admin/eruvim', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'Could not save that.',
      )
      setData((d) => {
        if (!d) return d
        if (body.action === 'remove') return { ...d, eruvim: d.eruvim.filter((e) => e.id !== id) }
        if (!res.eruv) return d
        const found = d.eruvim.some((e) => e.id === res.eruv!.id)
        return { ...d, eruvim: found ? d.eruvim.map((e) => (e.id === res.eruv!.id ? res.eruv! : e)) : [...d.eruvim, res.eruv] }
      })
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
      return false
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading…</p>
  if (!data.available) return <p className="text-sm text-slate-700">The eruv table isn’t there yet: run migration 074 in the Supabase SQL editor.</p>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Eruvim</h1>
        <p className="text-sm text-muted">The guide reads each eruv’s status page every 15 minutes on Friday afternoon, and its line every Thursday. It never sets a status itself.</p>
      </div>
      {saveError && <p className="text-sm text-red-700">{saveError}</p>}
      {data.eruvim.map((e) => (
        <EruvCard
          key={`${e.id}:${e.lineApprovedAt}:${e.lineReadAt}`}
          eruv={e}
          timezone={data.timezone}
          busy={busy === e.id}
          onAct={(action) => post(e.id, { action, id: e.id })}
          onSave={(edit) => post(e.id, { action: 'save', id: e.id, edit })}
        />
      ))}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (ev) => {
          ev.preventDefault()
          if (name.trim() && (await post('new', { action: 'add', name }))) setName('')
        }}
      >
        <Field label="Add an eruv">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cherry Hill Eruv" />
        </Field>
        <button type="submit" disabled={busy === 'new' || !name.trim()} className="cursor-pointer rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          Add
        </button>
      </form>
    </div>
  )
}
