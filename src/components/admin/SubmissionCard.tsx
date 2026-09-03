'use client'

import { useState } from 'react'
import type { EnrichedSubmission, ResourceRow, ResourceSubmission, CategorySubmissionPayload } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
// Flattening/formatting/diffing lives in lib/listingDiff so the notification
// emails render the identical before/after — see that file's own note.
import { diffListing, flatListing } from '@/lib/submissionDiff'

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
              {/* Only for submissions decided after reviewed_by existed —
                  older rows have nothing to show here, not a fabricated
                  "unknown admin". */}
              {s.reviewed_by && <span className="ml-2">by {s.reviewed_by}</span>}
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
          <dd className="min-w-0 break-words whitespace-pre-line text-slate-800">{r.value}</dd>
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
  return (
    <dl className="text-xs space-y-0.5">
      {diffListing(current, proposed, fields).map(({ key: k, label, before: beforeValue, after: afterValue, changed }) => {
        return (
          <div key={k} className="flex gap-2">
            <dt className="text-muted w-28 shrink-0">{label}</dt>
            {/* whitespace-pre-line: the hours and minyanim summaries are
                multi-line, and collapsing them to one run-on line is what made
                a davening-times change unreadable even once it was diffable. */}
            <dd className={`min-w-0 break-words whitespace-pre-line ${changed ? 'text-slate-800' : 'text-slate-400'}`}>
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
