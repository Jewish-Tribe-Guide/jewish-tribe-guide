'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import CollapsibleSection from './CollapsibleSection'

// ── The "Read questions" tab: what the AI reader made of what people asked ──
// Every question the site's own search didn't fully understand, and so the
// AI read into the site's own filters (see questionReader.ts), most asked
// first, each with its reading in words. Approve makes a reading a rule a
// person has checked: the site uses it with no AI at all, even when the
// reader is off or over its limits (/api/ask/read). Forget throws a wrong
// one away, and the question is read afresh the next time it's asked.

type ReadQuestion = {
  key: string
  question: string
  labels: string[]
  hits: number
  model: string
  lastUsedAt: string
  approvedAt: string | null
  approvedBy: string | null
}
type Loaded = { readings: ReadQuestion[]; available: boolean }
type Action = 'approve' | 'unapprove' | 'forget'

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function QuestionRow({ q, busy, onAct }: { q: ReadQuestion; busy: boolean; onAct: (action: Action) => void }) {
  return (
    <li className="px-4 py-3" data-testid="read-question">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-slate-900">“{q.question}”</p>
        <p className="text-xs text-muted">
          {q.hits} {q.hits === 1 ? 'time' : 'times'} · last {formatDay(q.lastUsedAt)}
        </p>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
        <span className="text-xs font-semibold text-slate-500">Read as</span>
        {q.labels.length > 0 ? (
          q.labels.map((label) => (
            <span key={label} className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary">
              {label}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted">nothing the guide has</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {q.approvedAt ? (
          <>
            <span className="text-muted">
              Approved {formatDay(q.approvedAt)}
              {q.approvedBy ? ` by ${q.approvedBy}` : ''}
            </span>
            <button type="button" disabled={busy} onClick={() => onAct('unapprove')} className="font-medium text-muted hover:text-slate-800 disabled:opacity-50">
              Unapprove
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => onAct('approve')} className="font-semibold text-primary hover:underline disabled:opacity-50">
            Approve
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => onAct('forget')} className="font-medium text-muted hover:text-slate-800 disabled:opacity-50">
          Forget
        </button>
        <span className="text-muted">Read by {q.model}</span>
      </div>
    </li>
  )
}

export default function ReadQuestions({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/read-questions', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load read questions.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  async function act(key: string, action: Action) {
    setSaveError(null)
    setBusy(key)
    try {
      await fetchJson(
        withCommunity('/api/admin/read-questions', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ key, action }) },
        'Could not save.',
      )
      setData(
        (d) =>
          d && {
            ...d,
            readings:
              action === 'forget'
                ? d.readings.filter((r) => r.key !== key)
                : d.readings.map((r) => (r.key === key ? { ...r, approvedAt: action === 'approve' ? new Date().toISOString() : null, approvedBy: action === 'approve' ? 'you' : null } : r)),
          },
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading read questions…</p>

  const toReview = data.readings.filter((r) => !r.approvedAt)
  const approved = data.readings.filter((r) => r.approvedAt)
  const rows = (list: ReadQuestion[]) => (
    <ul className="divide-y divide-slate-100">
      {list.map((q) => (
        <QuestionRow key={q.key} q={q} busy={busy === q.key} onAct={(a) => void act(q.key, a)} />
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Questions the site&rsquo;s own search didn&rsquo;t fully understand, and how the AI read them into the guide&rsquo;s own
        filters, most asked first. The AI only ever picks filters; the listings give the answers. <strong>Approve</strong> a
        reading you&rsquo;ve checked and it becomes a rule, used with no AI at all. <strong>Forget</strong> a wrong one and the
        question is read afresh next time. Only the words and a count are kept, never who asked.
      </p>
      {!data.available && (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
          Nothing is kept until database migration 062 is applied. The reader still works, reading every question afresh.
        </p>
      )}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      {data.available && data.readings.length === 0 ? (
        <p className="text-sm text-slate-600">No questions read yet.</p>
      ) : (
        data.available && (
          <>
            <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
              <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">To review ({toReview.length})</h3>
              <p className="px-4 pb-2 text-xs text-muted">Read by the AI, not yet checked by a person.</p>
              {toReview.length > 0 ? rows(toReview) : <p className="px-4 pb-3 text-sm text-slate-600">None right now.</p>}
            </section>
            <CollapsibleSection title="Approved" description="Rules a person has checked: used with no AI at all." count={approved.length} contentClassName="">
              {rows(approved)}
            </CollapsibleSection>
          </>
        )
      )}
    </div>
  )
}
