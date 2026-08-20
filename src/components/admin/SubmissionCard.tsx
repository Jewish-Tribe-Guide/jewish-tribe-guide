'use client'

import { useState } from 'react'
import type { EnrichedSubmission, ResourceRow, ResourceSubmission, CategorySubmissionPayload } from '@/types'
import { isStructuredHours, formatHoursSummary } from '@/lib/hours'
import { isMinyanim, TEFILLAH_LABELS } from '@/lib/davening'
import type { CategoryConfig, CategoryField } from '@/lib/categories'

// One submission's card — the moderation queue (pending, with Approve/Reject
// buttons) and the read-only history view (approved/rejected, past tense)
// share this rendering, since a proposed-vs-current diff looks the same
// either way; only the footer (live actions vs. a decided-when badge)
// differs. Pass `onModerate` to get the queue's interactive footer, omit it
// for a read-only card.

const OP_META: Record<EnrichedSubmission['operation'], { label: string; cls: string }> = {
  create: { label: '➕ New listing', cls: 'bg-green-50 text-green-700 border border-green-200' },
  update: { label: '✏️ Edit', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  delete: { label: '🗑️ Removal', cls: 'bg-red-50 text-red-700 border border-red-200' },
}

const STATUS_META: Record<'approved' | 'rejected', { label: string; cls: string }> = {
  approved: { label: 'Approved', cls: 'bg-green-50 text-green-700 border border-green-200' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700 border border-red-200' },
}

// A select/tags field stores raw option *values*, which don't always match
// what the admin typed as the option's label (e.g. renamed since). Resolve
// through the field's own `options` so the queue reads the same text the
// submission form and card show, not whatever happens to be in the JSON.
function resolveOptionLabel(field: CategoryField | undefined, value: unknown): string {
  const raw = String(value)
  const label = field?.options?.find((o) => o.value === raw)?.label
  return label ?? raw
}

function fmt(value: unknown, field?: CategoryField): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  // Structured hours object → human-readable multi-day summary instead of [object Object].
  if (isStructuredHours(value)) return formatHoursSummary(value)
  // Structured minyanim array → "5 minyanim: Shacharis, Kabbalas Shabbos, Mincha, Maariv".
  // isMinyanim([]) is vacuously true (every callsite elsewhere guards this the
  // same way), so an empty non-minyanim array (any other array-valued field
  // with nothing picked) doesn't misrender as "0 minyanim:".
  if (isMinyanim(value) && value.length > 0) {
    const count = value.length
    const tefillot = [...new Set(value.map((m) => TEFILLAH_LABELS[m.tefillah]))]
    return `${count} minyan${count !== 1 ? 'im' : ''}: ${tefillot.join(', ')}`
  }
  if (Array.isArray(value)) return value.map((v) => resolveOptionLabel(field, v)).join(', ') || '—'
  if (field?.type === 'select') return resolveOptionLabel(field, value)
  return String(value)
}

// Internal bookkeeping the admin never authors directly (Google-sync
// provenance, geocoding) — never real category content, so always excluded
// regardless of what fields a category happens to have.
// googleFields tracks which fields Google Places sync is allowed to
// overwrite (see googlePlaces.ts) — the sync cron and the submission form
// each recompute it independently and can land on the same set of fields in
// a different order, which would otherwise show up here as a "changed"
// field a submitter never touched.
//
// googleDescription is deliberately NOT in here: some categories configure it
// as a real, human-editable "Description" field (see ListingForm.tsx's
// intake autofill and googlePlaces.ts's recurring sync) with its own help
// text — that's real content worth a moderator seeing, same as any other
// configured field. Only skip it below, in the raw-leftover-details loop,
// for categories that never configured it as a field at all — there it's
// nothing but the sync's own fallback card-subtitle text.
// googleAutofill is the raw per-field autofill snapshot a pending
// submission still carries (see ListingForm.tsx) — resolved into
// googleFields and stripped only once approved (submissionStore.ts's
// withResolvedGoogleFields), so it's still present here for the moderator's
// view and just as uninteresting as googleFields itself.
const SKIP = new Set([
  'legacyId',
  'geo',
  'placeId',
  'googleSyncedAt',
  'businessStatus',
  'googleFields',
  'googleAutofill',
])
const SKIP_WHEN_UNCONFIGURED = new Set(['googleDescription'])

type FlatField = { key: string; label: string; value: string }

// Flattens a listing (current ResourceRow or proposed payload) into ordered
// label/value rows for display and diffing. Walks the category's own
// `detailFields` first (so rows appear in the same order as the submission
// form/card, under their real admin-configured label) then appends anything
// left in `details` that isn't a currently-configured field — a renamed or
// removed field, or a category the moderation queue hasn't loaded yet —
// under its raw key, so a value is never silently dropped just because the
// lookup missed it. New fields need no code change here: they're just
// another entry in `fields` the next time a category gains one.
function flatListing(src: ResourceRow | ResourceSubmission | undefined, fields: CategoryField[] | undefined): FlatField[] {
  if (!src) return []
  const details = (src.details ?? {}) as Record<string, unknown>
  const out: FlatField[] = [
    { key: 'name', label: 'Name', value: fmt(src.name) },
    { key: 'address', label: 'Address', value: fmt(src.address) },
    { key: 'phone', label: 'Phone', value: fmt(src.phone) },
  ]
  const seen = new Set<string>()
  for (const f of fields ?? []) {
    if (SKIP.has(f.key) || !(f.key in details)) continue
    seen.add(f.key)
    out.push({ key: f.key, label: f.label, value: fmt(details[f.key], f) })
  }
  for (const [k, v] of Object.entries(details)) {
    if (SKIP.has(k) || SKIP_WHEN_UNCONFIGURED.has(k) || seen.has(k)) continue
    out.push({ key: k, label: k, value: fmt(v) })
  }
  return out
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

export function SubmissionCard({
  submission: s,
  busy,
  onModerate,
  categoriesById,
}: {
  submission: EnrichedSubmission
  busy?: boolean
  onModerate?: (id: string, status: 'approved' | 'rejected', reason?: string) => void
  categoriesById: Map<string, CategoryConfig>
}) {
  const [pendingReject, setPendingReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const isCategory = s.target_type === 'category'
  const op = isCategory
    ? { label: '🆕 New category', cls: 'bg-purple-50 text-purple-700 border border-purple-200' }
    : OP_META[s.operation]
  const categoryLabel = s.categoryLabel ?? ''
  const title = isCategory
    ? (s.payload as CategorySubmissionPayload).label
    : (s.payload as Partial<ResourceSubmission>).name || s.current?.name || '(unknown listing)'
  // A create's category lives on the proposed payload; an edit/removal's
  // lives on the existing row (the payload for those is a partial patch that
  // may not repeat the category). Either one resolves the same detailFields.
  const categoryId = !isCategory
    ? (s.payload as Partial<ResourceSubmission>).category ?? s.current?.category
    : undefined
  const detailFields = categoryId ? categoriesById.get(categoryId)?.detailFields : undefined
  const statusMeta = s.status === 'approved' || s.status === 'rejected' ? STATUS_META[s.status] : undefined

  function handleRejectConfirm() {
    onModerate?.(s.id, 'rejected', rejectReason.trim() || undefined)
    setPendingReject(false)
    setRejectReason('')
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${op.cls}`}>{op.label}</span>
            {categoryLabel && (
              <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                {categoryLabel}
              </span>
            )}
            <p className="font-semibold text-slate-900 text-sm">{title}</p>
          </div>

          {isCategory && <CategoryDetails payload={s.payload as CategorySubmissionPayload} />}
          {!isCategory && s.operation === 'create' && (
            <ProposedDetails src={s.payload as ResourceSubmission} fields={detailFields} />
          )}
          {!isCategory && s.operation === 'update' && (
            <Diff current={s.current} proposed={s.payload as ResourceSubmission} fields={detailFields} />
          )}
          {!isCategory && s.operation === 'delete' && (
            <div className="text-xs text-slate-600">
              {s.current && <p>{s.current.address}</p>}
              <p className="mt-1 text-red-700">Reported for removal{s.note ? `: "${s.note}"` : '.'}</p>
            </div>
          )}

          {(s.submitted_by?.name || s.submitted_by?.email) && (
            <p className="text-xs text-muted mt-2 italic">
              by {s.submitted_by.name || s.submitted_by.email}
            </p>
          )}

          {/* Two-step reject: reason input appears inline below the details */}
          {onModerate && pendingReject && (
            <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
              <p className="text-xs font-medium text-slate-700">Reason for rejection (optional — will be included in the email to the submitter)</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder="e.g. This location is already listed, or the address couldn't be verified…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleRejectConfirm}
                  disabled={busy}
                  className="text-xs font-medium bg-red-600 text-white rounded px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {busy ? 'Rejecting…' : 'Confirm rejection'}
                </button>
                <button
                  onClick={() => { setPendingReject(false); setRejectReason('') }}
                  disabled={busy}
                  className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!onModerate && statusMeta && (
            <p className="text-xs text-muted mt-2">
              <span className={`font-medium rounded-full px-2 py-0.5 ${statusMeta.cls}`}>{statusMeta.label}</span>
              {s.reviewed_at && <span className="ml-2">{dateFormatter.format(new Date(s.reviewed_at))}</span>}
            </p>
          )}
        </div>

        {onModerate && !pendingReject && (
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={() => onModerate(s.id, 'approved')}
              disabled={busy}
              className="text-xs font-medium bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {busy ? '…' : 'Approve'}
            </button>
            <button
              onClick={() => setPendingReject(true)}
              disabled={busy}
              className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryDetails({ payload }: { payload: CategorySubmissionPayload }) {
  const f = payload.firstListing
  // Icon / upvotes aren't collected on the suggestion form (a moderator sets
  // those on approval), so they'd always render empty here — omit them.
  const rows: [string, string][] = [
    ['Description', payload.description || '—'],
    ['First listing', f?.name || '—'],
    ['Address', f?.address || '—'],
    ['Phone', f?.phone || '—'],
  ]
  return (
    <dl className="text-xs text-slate-600 space-y-0.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-muted w-24 shrink-0">{k}</dt>
          <dd className="min-w-0 break-words text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function ProposedDetails({ src, fields }: { src: ResourceSubmission; fields?: CategoryField[] }) {
  const rows = flatListing(src, fields)
  return (
    <dl className="text-xs text-slate-600 space-y-0.5">
      {rows.map((r) => (
        <div key={r.key} className="flex gap-2">
          <dt className="text-muted w-28 shrink-0">{r.label}</dt>
          <dd className="min-w-0 break-words text-slate-800">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Diff({
  current,
  proposed,
  fields,
}: {
  current?: ResourceRow | null
  proposed: ResourceSubmission
  fields?: CategoryField[]
}) {
  const before = flatListing(current ?? undefined, fields)
  const after = flatListing(proposed, fields)
  const beforeByKey = new Map(before.map((r) => [r.key, r]))
  const afterByKey = new Map(after.map((r) => [r.key, r]))
  // `after`'s order first (the category's own field order, and what a
  // moderator approving mostly cares about), then any key only `before` had
  // — a field the edit cleared out entirely rather than just changed.
  const orderedKeys = [...after.map((r) => r.key), ...before.map((r) => r.key).filter((k) => !afterByKey.has(k))]

  return (
    <dl className="text-xs space-y-0.5">
      {orderedKeys.map((k) => {
        const label = afterByKey.get(k)?.label ?? beforeByKey.get(k)?.label ?? k
        const beforeValue = beforeByKey.get(k)?.value ?? '—'
        const afterValue = afterByKey.get(k)?.value ?? '—'
        const changed = beforeValue !== afterValue
        return (
          <div key={k} className="flex gap-2">
            <dt className="text-muted w-28 shrink-0">{label}</dt>
            <dd className={`min-w-0 break-words ${changed ? 'text-slate-800' : 'text-slate-400'}`}>
              {changed ? (
                <span>
                  <span className="line-through text-red-500">{beforeValue}</span>{' '}
                  <span aria-hidden="true">→</span>{' '}
                  <span className="text-green-700 font-medium">{afterValue}</span>
                </span>
              ) : (
                afterValue
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
