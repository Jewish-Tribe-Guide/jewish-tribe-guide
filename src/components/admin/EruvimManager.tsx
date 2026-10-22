'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { eruvView, shortDay } from '@/lib/eruv'
import { DEFAULT_LINE_COLOR, lineColorOf, partNames, shownMap, withLineColor, type EruvLineFile } from '@/lib/eruvLine'
import type { AdminEruv } from '@/lib/eruvStore'
import { adminBase } from '@/lib/adminNav'

// ── The eruvim, on the Categories tab's Eruv row (Oct 7; its own tab until
// Oct 22) ───────────────────────────────────────────────────────────────────
// Each eruv the guide shows: what the public sees of it (its status, as
// read from its own page), what an admin sets (where it goes, its site,
// hotline, alerts, the status page, its map's address), and its map. The
// guide shows each eruv's own map as the eruv draws it, read about every
// hour (Oct 12); what's chosen here is only what to leave out of it: parts
// by name, and its markers; and, for a line that's hard to see, the colour
// it's drawn in (Oct 15). An eruv with no status page can have its status
// emailed instead (Oct 19). Where its status is read from (its page or its
// emails), and an email the guide couldn't make out, moved to the Watches
// tab on Oct 19, with every other source the guide reads; each eruv here
// says where, and links there.

type Loaded = { available: boolean; timezone: string; eruvim: AdminEruv[] }

/** The map drawn small, as the guide shows it: each line in the eruv's
 *  colour (or the one chosen), a left-out one dashed and grey, and its
 *  markers as dots. */
function LinePreview({ file: theirs, leaveOut, hideMarks, lineColor }: { file: EruvLineFile; leaveOut: string[]; hideMarks: boolean; lineColor: string | null }) {
  const file = useMemo(() => withLineColor(theirs, lineColor), [theirs, lineColor])
  const shown = useMemo(() => shownMap(file, leaveOut, hideMarks), [file, leaveOut, hideMarks])
  const pts = [...file.lines.flatMap((l) => l.points), ...(file.marks ?? []).map((m) => m.at)]
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
  const x = (lng: number) => 8 + (lng - minLng) * k * s
  const y = (lat: number) => H - 8 - (lat - minLat) * s
  const xy = ([lat, lng]: [number, number]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`
  const kept = new Set(shown.lines)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="max-w-full rounded-lg border border-slate-200 bg-slate-50" role="img" aria-label="The eruv’s map, as the guide shows it">
      {shown.lines
        .filter((l) => l.fill)
        .map((l, i) => (
          <polygon key={`a${i}`} points={l.points.map(xy).join(' ')} fill={l.fill!.color} fillOpacity={l.fill!.opacity} stroke="none" />
        ))}
      {file.lines.map((l, i) => (
        <polyline key={i} points={l.points.map(xy).join(' ')} fill="none" stroke={kept.has(l) ? (l.color ?? DEFAULT_LINE_COLOR) : '#94a3b8'} strokeWidth={kept.has(l) ? 2 : 1.5} strokeDasharray={kept.has(l) ? undefined : '3 3'} />
      ))}
      {(shown.marks ?? []).map((m, i) => (
        <circle key={`m${i}`} cx={x(m.at[1])} cy={y(m.at[0])} r={3.5} fill={m.color ?? '#0288d1'} stroke="#fff" strokeWidth={1} />
      ))}
    </svg>
  )
}

const input = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

// Not its status source: that's set on the Watches tab, and a save here
// mustn't put back what was there when this loaded.
type Draft = Pick<AdminEruv, 'name' | 'covers' | 'website' | 'hotline' | 'alertsUrl' | 'lineUrl' | 'sortOrder' | 'active' | 'lineLeaveOut' | 'lineHidePoints' | 'lineColor'>
const draftOf = (e: AdminEruv): Draft => ({
  name: e.name,
  covers: e.covers,
  website: e.website,
  hotline: e.hotline,
  alertsUrl: e.alertsUrl,
  lineUrl: e.lineUrl,
  sortOrder: e.sortOrder,
  active: e.active,
  lineLeaveOut: e.lineLeaveOut,
  lineHidePoints: e.lineHidePoints,
  lineColor: e.lineColor,
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

function EruvCard({
  eruv,
  timezone,
  busy,
  onAct,
  onSave,
  watchesHref,
}: {
  eruv: AdminEruv
  timezone: string
  busy: boolean
  onAct: (action: 'check' | 'remove') => void
  onSave: (d: Draft) => void
  watchesHref: string
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(eruv))
  const [confirmRemove, setConfirmRemove] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(eruv))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const view = eruvView(eruv, new Date(), timezone, null)
  const names = eruv.rawLine ? partNames(eruv.rawLine) : []
  const tone = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700', grey: 'text-slate-600' }[view.tone]

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="admin-eruv">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">
          {eruv.name}
          {!eruv.active && <span className="ml-2 text-sm font-semibold text-slate-500">Hidden</span>}
        </h3>
        <button type="button" disabled={busy} onClick={() => onAct('check')} className="cursor-pointer rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Check now
        </button>
      </div>
      <p className={`mt-1 text-sm font-semibold ${tone}`}>{view.label}</p>
      {view.checked && <p className="text-xs text-muted">{view.checked}</p>}
      {eruv.statusWords && <p className="text-xs text-muted">Read from: “{eruv.statusWords}”{eruv.statusPostedOn ? `, dated ${shortDay(eruv.statusPostedOn, timezone)}` : ''}</p>}
      {eruv.statusError && <p className="text-xs text-red-700">Last read failed: {eruv.statusError}</p>}
      <p className="mt-1 text-sm text-slate-700" data-testid="eruv-status-source">
        {eruv.statusUrl ? `Status read from ${eruv.statusUrl.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}.` : eruv.statusEmail ? `Status read from emails from ${eruv.statusEmail}.` : 'No status source.'}{' '}
        <Link href={watchesHref} className="font-semibold text-primary hover:underline">
          {eruv.statusUrl || eruv.statusEmail ? 'Change it on the Watches tab' : 'Add one on the Watches tab'}
        </Link>
        {eruv.statusEmailKept && <span className="block text-amber-800">An email from it waits for you there.</span>}
      </p>

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
        <div className="sm:col-span-2">
          <Field label="Its map" help="A Google My Maps link, or a GeoJSON file. Shown as the eruv draws it, read about every hour.">
            <input className={input} value={draft.lineUrl ?? ''} onChange={(e) => set('lineUrl', e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
          Shown on the site
        </label>
      </div>

      {eruv.rawLine && (
        <div className="mt-4" data-testid="eruv-map-preview">
          <p className="text-sm font-bold text-slate-800">As the guide shows it</p>
          <p className="mb-1.5 text-xs text-muted">Read {eruv.lineReadAt ? shortDay(eruv.lineReadAt, timezone) : ''}. Compare it with the eruv’s own map.</p>
          <LinePreview file={eruv.rawLine} leaveOut={draft.lineLeaveOut} hideMarks={draft.lineHidePoints} lineColor={draft.lineColor} />
          <div className="mt-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-8 w-11 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                  value={lineColorOf(eruv.rawLine, draft.lineColor)}
                  onChange={(e) => set('lineColor', e.target.value)}
                />
                <span className="font-semibold">Line colour</span>
              </label>
              {draft.lineColor ? (
                <button type="button" onClick={() => set('lineColor', null)} className="cursor-pointer font-semibold text-primary hover:underline">
                  Use its own
                </button>
              ) : (
                <span className="text-muted">its own, from its map</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">For a line that’s hard to see on the map. Its line is drawn in this colour with no shading inside; the line itself still comes from its map.</p>
          </div>
        </div>
      )}
      {eruv.lineMissing.length > 0 && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="eruv-line-missing">
          Left out, but no longer in its map: {eruv.lineMissing.map((n) => `“${n}”`).join(', ')}. The eruv may have renamed or redrawn it, so check the map above and choose again.
        </p>
      )}
      {eruv.lineError && <p className="mt-2 text-xs text-red-700">Last read of its map failed, so the guide shows the read before: {eruv.lineError}</p>}

      {names.length > 1 && (
        <fieldset className="mt-3">
          <legend className="text-xs font-semibold text-slate-700">Parts of its map (untick one to leave it out)</legend>
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

      {eruv.rawLine?.marks?.length ? (
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={draft.lineHidePoints} onChange={(e) => set('lineHidePoints', e.target.checked)} />
          <span>
            Hide its markers
            <span className="block text-xs text-muted">For a map that pins places the guide already lists (its shuls). Keep them for notes about the eruv: crossings, reroutes, entrances.</span>
          </span>
        </label>
      ) : null}

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
        <h2 className="text-lg font-bold text-slate-900">Eruvim</h2>
        <p className="text-sm text-muted">The guide reads each eruv’s status from the page or emails set on the Watches tab, and its map about every hour. It never sets a status itself, or draws a line of its own.</p>
      </div>
      {saveError && <p className="text-sm text-red-700">{saveError}</p>}
      {data.eruvim.map((e) => (
        <EruvCard
          key={`${e.id}:${e.lineReadAt}`}
          eruv={e}
          timezone={data.timezone}
          busy={busy === e.id}
          onAct={(action) => post(e.id, { action, id: e.id })}
          onSave={(edit) => post(e.id, { action: 'save', id: e.id, edit })}
          watchesHref={`${adminBase(community)}/watches`}
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
