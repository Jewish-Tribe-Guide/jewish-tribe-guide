'use client'

import { useEffect, useState } from 'react'
import type { EnrichedSubmission, ResourceSubmission } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { adminBase } from '@/lib/adminNav'
import { fetchJson } from '@/lib/fetchJson'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { shortDay, splitSubmissions, submissionLine, submissionName, todoCount, watchesLine } from '@/lib/todo'
import type { TodoData } from '@/lib/useTodo'
import { placePath } from '@/lib/placeLink'
import { setupLeft } from '@/lib/setup'
import { AdminBox, AdminEmpty, AdminRow, AdminRows } from './AdminUI'
import SetupChecklist from './SetupChecklist'

// To do's one list (the admin redesign's step 2, boards 1 and 2): what to
// decide, grouped by what you decide. A suggestion opens to be decided here;
// what a job read about a place opens on that place's own screen.
// Watches and Feedback sit at the bottom. Searches nobody found aren't here:
// nobody is expected to go through every search (the user, Oct 31), so they
// live in Reports. A guide not yet set up has its checklist first (step 6,
// board "Setup").

function useWatchesLine(token: string): string | undefined {
  const community = useCommunitySlug()
  const [line, setLine] = useState<string>()
  useEffect(() => {
    let live = true
    fetchJson<{ watches: { active: boolean; lastRunAt: string | null }[] }>(withCommunity('/api/admin/watches', community), { headers: { Authorization: `Bearer ${token}` } }, '')
      .then((body) => live && setLine(watchesLine(body.watches)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [token, community])
  return line
}

export default function TodoList({
  data,
  token,
  categoriesById,
  onOpen,
}: {
  data: TodoData
  token: string
  categoriesById: Map<string, CategoryConfig>
  onOpen: (id: string) => void
}) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const watches = useWatchesLine(token)
  const { newPlaces, changes } = splitSubmissions(data.submissions)
  const waiting = data.waiting ?? []
  const count = todoCount(data)
  const setupToGo = setupLeft(data.setup)
  const categoryOf = (s: EnrichedSubmission) =>
    categoriesById.get((s.payload as Partial<ResourceSubmission>).category ?? s.current?.category ?? '')

  const suggestionRow = (s: EnrichedSubmission) => {
    const name = submissionName(s)
    return (
      <AdminRow
        key={s.id}
        onClick={() => onOpen(s.id)}
        label={`Open ${name}`}
        name={name}
        line={submissionLine(s, categoryOf(s))}
        aside={s.categoryLabel}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {data.setup && <SetupChecklist setup={data.setup} />}

      {count > 0 ? (
        <p className={`m-0 text-sm text-slate-600 ${setupToGo > 0 ? '' : '-mt-2'}`}>{count} to decide</p>
      ) : setupToGo > 0 ? (
        <p className="m-0 text-[15px] text-slate-600">Nothing else to do.</p>
      ) : (
        <AdminEmpty />
      )}

      {newPlaces.length > 0 && (
        <AdminBox title="New places" count={newPlaces.length} foldOnPhone>
          <AdminRows items={newPlaces}>{suggestionRow}</AdminRows>
        </AdminBox>
      )}

      {changes.length + waiting.length > 0 && (
        <AdminBox title="Changes" count={changes.length + waiting.length} foldOnPhone>
          <AdminRows items={[...changes, ...waiting]}>
            {(x) => ('payload' in x ? suggestionRow(x) : <AdminRow key={x.id} href={`${base}/watches/${placePath(x.id, 'todo')}`} name={x.name} line={x.line} aside={x.kind} />)}
          </AdminRows>
        </AdminBox>
      )}

      {data.responses.length > 0 && (
        <AdminBox title="Feedback" count={data.responses.length} foldOnPhone>
          <AdminRows items={data.responses}>
            {(r) => <AdminRow key={r.id} href={`${base}/responses`} name={r.title} line={[r.line, shortDay(r.createdAt)].filter(Boolean).join(' · ')} />}
          </AdminRows>
        </AdminBox>
      )}

      {data.unmatched.length > 0 && (
        <AdminBox title="Find on Google" count={data.unmatched.length} foldOnPhone>
          <AdminRows items={data.unmatched}>
            {(p) => <AdminRow key={p.id} href={`${base}/watches/${placePath(p.id, 'todo')}`} name={p.name} line="Not found on Google" />}
          </AdminRows>
        </AdminBox>
      )}

      <div className="bg-white border border-slate-200 rounded-[10px] overflow-hidden">
        <AdminRow href={`${base}/watches`} name="Watches" line={watches} />
        {data.responses.length === 0 && <AdminRow href={`${base}/responses`} name="Feedback" />}
      </div>
    </div>
  )
}
