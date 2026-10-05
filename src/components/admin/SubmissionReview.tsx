'use client'

import { useMemo, useState } from 'react'
import type { EnrichedSubmission, ResourceSubmission } from '@/types'
import { companionKeys, fieldIsVisible, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { diffListing, flatListing } from '@/lib/submissionDiff'
import { markTimes, submissionSource, type SubmissionSource } from '@/lib/submissionSource'
import { schedulesKey, type SpecialSchedule } from '@/lib/schedules'
import { formatPhone } from '@/lib/validation'
import AddressInput from '@/components/intake/AddressInput'
import { DetailFieldInput } from '@/components/resources/ListingForm'
import { linkify } from './SubmissionCard'

// An opened card in the moderation queue (agreed Oct 5, canvas QOpen,
// QOpenVisitor, QPhoneOpen): the original beside the change, and the change
// as a form the admin can fix before approving. One form for every source
// and every category, built from the category's own fields with the
// listing form's own inputs, so a typo is fixed here instead of the
// suggestion being rejected and sent again.
//
// A new place shows every field; an edit shows only what it changes, each
// with what the listing says now, plus any other field the admin asks for.
// Approving sends the admin's copy only when they changed something; the
// server decides what of it may change (reviewEdits.ts).

const CORE = [
  { key: 'name', label: 'Name' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
] as const
type CoreKey = (typeof CORE)[number]['key']
const isCore = (k: string): k is CoreKey => k === 'name' || k === 'address' || k === 'phone'

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

const dateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The card's one-line "where from", shared with the list. */
export function sourceLine(s: EnrichedSubmission, source: SubmissionSource): string {
  const what = s.target_type === 'category' ? 'New category' : s.operation === 'create' ? 'New place' : s.operation === 'update' ? 'Edit' : 'Removal'
  const from = source.readBy === 'person' && (s.submitted_by?.name || s.submitted_by?.email) ? s.submitted_by.name || s.submitted_by.email : source.from
  return `${what} · from ${from} · ${dateFormatter.format(new Date(s.created_at))}`
}

/** The field a diff row edits: a shul's special schedules are edited with
 *  its times. */
function fieldKeyFor(rowKey: string, fields: CategoryField[]): string | null {
  if (isCore(rowKey)) return rowKey
  if (fields.some((f) => f.key === rowKey)) return rowKey
  const shul = fields.find((f) => f.type === 'minyanim' && schedulesKey(f.key) === rowKey)
  return shul?.key ?? null
}

export function SubmissionReview({
  submission: s,
  category,
  waiting,
  busy,
  error,
  onBack,
  onModerate,
}: {
  submission: EnrichedSubmission
  category?: CategoryConfig
  waiting: number
  busy?: boolean
  error?: string | null
  onBack: () => void
  onModerate: (id: string, status: 'approved' | 'rejected', reason?: string, payload?: ResourceSubmission) => void
}) {
  const sent = s.payload as unknown as ResourceSubmission
  const fields = useMemo(() => category?.detailFields ?? [], [category])
  const source = submissionSource(s)
  const [draft, setDraft] = useState<ResourceSubmission>(() => structuredClone(sent))
  const [tab, setTab] = useState<'changes' | 'original'>('changes')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  // What the edit changes, against the listing as it is now.
  const diff = useMemo(() => (s.operation === 'update' ? diffListing(s.current, sent, fields) : []), [s, sent, fields])
  const before = useMemo(() => new Map(flatListing(s.current ?? undefined, fields).map((r) => [r.key, r.value])), [s.current, fields])
  const changedKeys = useMemo(() => {
    const keys: string[] = []
    for (const row of diff) {
      if (!row.changed) continue
      const k = fieldKeyFor(row.key, fields)
      if (k && !keys.includes(k)) keys.push(k)
    }
    return keys
  }, [diff, fields])
  const [extra, setExtra] = useState<string[]>([])

  const hasAddress = category?.hasAddress !== false
  const hasPhone = category?.hasPhone !== false
  const coreShown = CORE.filter((c) => (c.key === 'address' ? hasAddress : c.key === 'phone' ? hasPhone : true))
  const visible = fields.filter((f) => fieldIsVisible(f, draft.details))
  const allKeys = [...coreShown.map((c) => c.key as string), ...visible.map((f) => f.key)]
  const shown = s.operation === 'create' ? allKeys : allKeys.filter((k) => changedKeys.includes(k) || extra.includes(k))
  const offered = s.operation === 'update' ? allKeys.filter((k) => !shown.includes(k)) : []
  const labelOf = (k: string) => (isCore(k) ? CORE.find((c) => c.key === k)!.label : fields.find((f) => f.key === k)?.label ?? k)

  const dirty = JSON.stringify(draft) !== JSON.stringify(sent)
  const marked = source.readBy === 'ai' && source.original ? markTimes(source.original, draft.details) : null
  const hasOriginal = Boolean(source.original || source.photoUrl)

  function setDetail(key: string, value: unknown) {
    setDraft((d) => ({ ...d, details: { ...d.details, [key]: value } }))
  }

  /** "Keep it as it was": the field, and what goes with it, back to the
   *  listing's own values. */
  function keepAsIs(key: string) {
    const cur = s.current
    if (!cur) return
    if (isCore(key)) {
      setDraft((d) => ({ ...d, [key]: (cur[key] as string | null) ?? '', ...(key === 'address' ? { geo: sent.geo ?? null } : {}) }))
      return
    }
    const f = fields.find((x) => x.key === key)
    const curDetails = (cur.details ?? {}) as Record<string, unknown>
    setDraft((d) => {
      const details = { ...d.details }
      for (const k of [key, ...(f ? companionKeys(f) : [])]) {
        if (k in curDetails) details[k] = curDetails[k]
        else delete details[k]
      }
      return { ...d, details }
    })
  }

  function fieldInput(key: string) {
    if (key === 'name') {
      return (
        <div>
          <label htmlFor="review-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input id="review-name" className={inputClass} value={draft.name ?? ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </div>
      )
    }
    if (key === 'address') {
      return (
        <div>
          <label htmlFor="review-address" className="block text-sm font-medium text-slate-700 mb-1">Address</label>
          <AddressInput
            id="review-address"
            value={draft.address ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, address: v }))}
            onCoords={(geo) => setDraft((d) => ({ ...d, geo }))}
          />
        </div>
      )
    }
    if (key === 'phone') {
      return (
        <div>
          <label htmlFor="review-phone" className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
          <input id="review-phone" type="tel" className={inputClass} value={draft.phone ?? ''} onChange={(e) => setDraft((d) => ({ ...d, phone: formatPhone(e.target.value) }))} />
        </div>
      )
    }
    const f = fields.find((x) => x.key === key)
    if (!f) return null
    return (
      <DetailFieldInput
        field={f}
        value={draft.details[f.key]}
        onChange={(v) => setDetail(f.key, v)}
        sometimes={f.type === 'tags' ? ((draft.details[`${f.key}_sometimes`] as string[] | undefined) ?? []) : undefined}
        onChangeSometimes={f.type === 'tags' ? (v) => setDetail(`${f.key}_sometimes`, v) : undefined}
        schedules={f.type === 'minyanim' ? draft.details[schedulesKey(f.key)] : undefined}
        onChangeSchedules={f.type === 'minyanim' && schedulesKey(f.key) in draft.details ? (v: SpecialSchedule[]) => setDetail(schedulesKey(f.key), v) : undefined}
      />
    )
  }

  /** What the listing says now, under an edited field. */
  function nowLine(key: string) {
    if (s.operation !== 'update') return null
    const rows = [before.get(key)]
    const f = fields.find((x) => x.key === key)
    if (f?.type === 'minyanim' && before.has(schedulesKey(f.key))) rows.push(before.get(schedulesKey(f.key)))
    const text = rows.filter(Boolean).join('\n')
    return <p className="mt-1 text-xs text-slate-500 whitespace-pre-line">Now: {text && text !== '—' ? text : 'nothing'}</p>
  }

  const original = hasOriginal ? (
    <section aria-label="The original" className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h3 className="text-sm font-semibold text-slate-900">The original</h3>
        {marked && (
          <span className="text-xs text-slate-500">
            <span className="rounded bg-blue-100 text-blue-900 px-1">used</span>{' '}
            <span className="rounded bg-amber-100 text-amber-900 px-1">not used</span>
          </span>
        )}
      </div>
      {marked && marked.unused > 0 && (
        <p className="mb-2 text-xs font-medium text-amber-800">
          {marked.unused === 1 ? '1 time in the original isn’t used.' : `${marked.unused} times in the original aren’t used.`} Check none was missed.
        </p>
      )}
      {source.original && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap break-words lg:max-h-[70vh] lg:overflow-auto">
          {marked
            ? marked.parts.map((p, i) =>
                p.mark ? (
                  <mark key={i} data-mark={p.mark} className={p.mark === 'used' ? 'rounded bg-blue-100 text-blue-900 px-0.5' : 'rounded bg-amber-100 text-amber-900 px-0.5'}>
                    {p.text}
                  </mark>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )
            : linkify(source.original)}
        </div>
      )}
      {source.photoUrl && (
        <a href={source.photoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm text-primary underline">
          {/\.(png|jpe?g|webp|gif)$/i.test(source.photoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element -- the guide's own storage, shown as sent
            <img src={source.photoUrl} alt="The photo it was read from" className="max-h-[70vh] rounded-md border border-slate-200" />
          ) : (
            'Open the file it was read from'
          )}
        </a>
      )}
    </section>
  ) : null

  const changes = (
    <section aria-label="What changes on the listing" className="min-w-0">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{s.operation === 'create' ? 'The new place' : 'What changes on the listing'}</h3>
      {!hasOriginal && source.note && (
        <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap break-words">
          <span className="font-medium text-slate-500">{source.readBy === 'person' ? 'Their note: ' : 'Note: '}</span>
          {linkify(source.note)}
        </p>
      )}
      {hasOriginal && source.note && <p className="mb-3 text-xs text-slate-500 whitespace-pre-line">{source.note}</p>}
      <div className="space-y-4">
        {shown.map((k) => (
          <div key={k} data-testid="review-field" className="rounded-md border border-slate-200 p-3">
            {fieldInput(k)}
            {nowLine(k)}
            {s.operation === 'update' && (
              <button type="button" onClick={() => keepAsIs(k)} className="mt-2 text-xs font-medium text-slate-600 underline hover:text-slate-900 cursor-pointer">
                Keep {labelOf(k).toLowerCase()} as it was
              </button>
            )}
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-slate-500">Nothing differs from the listing as it is now.</p>}
      </div>
      {offered.length > 0 && (
        <div className="mt-4">
          <label htmlFor="review-another" className="block text-xs font-medium text-slate-600 mb-1">Change another field</label>
          <select
            id="review-another"
            value=""
            onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])}
            className={inputClass}
          >
            <option value="">Choose…</option>
            {offered.map((k) => (
              <option key={k} value={k}>{labelOf(k)}</option>
            ))}
          </select>
        </div>
      )}
    </section>
  )

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4" data-testid="submission-review">
      <button type="button" onClick={onBack} className="mb-3 text-sm text-primary hover:underline cursor-pointer">
        ‹ Moderation · {waiting} waiting
      </button>
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-slate-900">{sent.name || s.current?.name || '(unknown listing)'}</h2>
        {s.categoryLabel && <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{s.categoryLabel}</span>}
        {source.readBy === 'ai' && <span className="text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2 py-0.5">Read by AI</span>}
      </div>
      <p className="text-xs text-slate-500 mt-1">{sourceLine(s, source)}</p>

      {hasOriginal && (
        <div role="tablist" aria-label="Show" className="mt-3 flex gap-1 lg:hidden">
          {(['changes', 'original'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-sm cursor-pointer ${tab === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {t === 'changes' ? 'Changes' : `The original${marked?.unused ? ` · ${marked.unused} not used` : ''}`}
            </button>
          ))}
        </div>
      )}

      <div className={`mt-4 grid gap-6 ${hasOriginal ? 'lg:grid-cols-2' : ''}`}>
        {original && <div className={tab === 'original' ? '' : 'hidden lg:block'}>{original}</div>}
        <div className={!hasOriginal || tab === 'changes' ? '' : 'hidden lg:block'}>{changes}</div>
      </div>

      {error && <p className="mt-4 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 border-t border-slate-100 pt-4">
        {rejecting ? (
          <div className="space-y-2">
            <label htmlFor="review-reason" className="block text-xs font-medium text-slate-700">
              Reason for rejection (optional — will be included in the email to the submitter)
            </label>
            <textarea id="review-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => onModerate(s.id, 'rejected', reason.trim() || undefined)} className="text-sm font-medium bg-red-600 text-white rounded px-4 py-2 hover:bg-red-700 disabled:opacity-60 cursor-pointer">
                {busy ? 'Rejecting…' : 'Confirm rejection'}
              </button>
              <button type="button" disabled={busy} onClick={() => setRejecting(false)} className="text-sm font-medium border border-slate-300 text-slate-600 rounded px-4 py-2 hover:bg-slate-50 disabled:opacity-60 cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={() => onModerate(s.id, 'approved', undefined, dirty ? draft : undefined)}
              className="text-sm font-medium bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60 cursor-pointer"
            >
              {busy ? 'Approving…' : dirty ? 'Approve with your changes' : 'Approve'}
            </button>
            <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="text-sm font-medium border border-slate-300 text-slate-600 rounded px-4 py-2 hover:bg-slate-50 disabled:opacity-60 cursor-pointer">
              Reject
            </button>
            {dirty && <span className="text-xs text-slate-500">Your changes are recorded as yours.</span>}
          </div>
        )}
      </div>
    </div>
  )
}
