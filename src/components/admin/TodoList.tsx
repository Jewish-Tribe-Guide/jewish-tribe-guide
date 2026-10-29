'use client'

import { useEffect, useState } from 'react'
import type { EnrichedSubmission, ResourceSubmission } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { adminBase } from '@/lib/adminNav'
import { fetchJson } from '@/lib/fetchJson'
import { routes } from '@/lib/routes'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { shortDay, splitSubmissions, submissionLine, submissionName, teachable, todoCount, watchesLine, type TodoSearch, type TodoWord } from '@/lib/todo'
import { updateTodo, type TodoData } from '@/lib/useTodo'
import { setupLeft } from '@/lib/setup'
import { AdminBox, AdminEmpty, AdminRow, AdminRows, Chevron } from './AdminUI'
import SetupChecklist from './SetupChecklist'

// To do's one list (the admin redesign's step 2, boards 1 and 2): what to
// decide, grouped by what you decide. A suggestion opens to be decided; a
// search opens in place, with Add a place, Teach and Dismiss. Watches and
// Responses sit at the bottom. A guide not yet set up has its checklist
// first (step 6, board "Setup").

const button = 'inline-flex items-center justify-center min-h-11 px-3.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`
const secondary = `${button} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`

function SearchRow({
  search,
  data,
  token,
  open,
  onToggle,
}: {
  search: TodoSearch
  data: TodoData
  token: string
  open: boolean
  onToggle: () => void
}) {
  const community = useCommunitySlug()
  const [category, setCategory] = useState(search.askedCategory ?? data.addable[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = `search-${search.term.replace(/\W+/g, '-')}`

  async function post(path: string, body: unknown) {
    setBusy(true)
    setError(null)
    try {
      await fetchJson(
        withCommunity(path, community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'Could not save.',
      )
      // Dismissed or taught, it's off the list.
      updateTodo((d) => ({ ...d, searches: d.searches.filter((s) => s.term !== search.term) }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setBusy(false)
    }
  }

  const teach = (word: Pick<TodoWord, 'word' | 'categoryId' | 'field' | 'value'>) =>
    post('/api/admin/read-questions', { action: 'teach', word, question: search.term })

  return (
    <div className="border-b border-slate-100 last:border-b-0" data-testid="todo-search">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 min-h-[52px] text-left text-slate-900 hover:bg-slate-50 cursor-pointer"
      >
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">“{search.term}”</span>
          <span className="text-[13px] text-slate-600">
            {search.count} {search.count === 1 ? 'search' : 'searches'} · {shortDay(`${search.lastDay}T12:00:00`)}
          </span>
        </span>
        <span className={open ? 'rotate-90' : ''}>
          <Chevron />
        </span>
      </button>
      {open && (
        <div id={id} className="px-4 pb-4 flex flex-col gap-3 bg-slate-50/60">
          <div className="flex flex-wrap gap-2">
            {category && (
              <a href={`${routes.slug(community, category)}?form=create`} target="_blank" rel="noreferrer" className={`${primary} flex-1 sm:flex-none`}>
                Add a place
              </a>
            )}
            {(data.canDismiss || search.readingKey) && (
              <button type="button" disabled={busy} onClick={() =>
                  void (search.readingKey
                    ? post('/api/admin/read-questions', { key: search.readingKey, action: 'forget' })
                    : post('/api/admin/missed-searches', { term: search.term, dismissed: true }))
                } className={`${secondary} flex-1 sm:flex-none`}>
                Dismiss
              </button>
            )}
          </div>
          {data.addable.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-category`} className="text-[13px] text-slate-600">
                {data.canTeach && teachable(search.term) ? 'Or show a category for it' : 'Category'}
              </label>
              <span className="flex gap-2">
                <select
                  id={`${id}-category`}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 min-w-0 min-h-11 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900"
                >
                  {data.addable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {data.canTeach && teachable(search.term) && (
                  <button type="button" disabled={busy || !category} onClick={() => void teach({ word: search.term, categoryId: category })} className={secondary}>
                    Teach
                  </button>
                )}
              </span>
            </div>
          )}
          {data.canTeach &&
            search.words.map((w) => (
              <span key={w.word} className="flex flex-wrap items-center gap-2 text-sm text-slate-700" data-testid="todo-word">
                <span className="flex-1 min-w-0">
                  “<span className="font-semibold text-slate-900">{w.word}</span>” means {w.label}
                </span>
                <button type="button" disabled={busy} onClick={() => void teach(w)} className={secondary}>
                  Teach
                </button>
              </span>
            ))}
          {error && <p className="m-0 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  )
}

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
  const [openSearch, setOpenSearch] = useState<string | null>(null)
  const watches = useWatchesLine(token)
  const { newPlaces, changes } = splitSubmissions(data.submissions)
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

      {changes.length > 0 && (
        <AdminBox title="Changes" count={changes.length} foldOnPhone>
          <AdminRows items={changes}>{suggestionRow}</AdminRows>
        </AdminBox>
      )}

      {data.searches.length > 0 && (
        <AdminBox title="Searches nobody found" count={data.searches.length}>
          <AdminRows items={data.searches}>
            {(s) => (
              <SearchRow
                key={s.term}
                search={s}
                data={data}
                token={token}
                open={openSearch === s.term}
                onToggle={() => setOpenSearch((t) => (t === s.term ? null : s.term))}
              />
            )}
          </AdminRows>
        </AdminBox>
      )}

      {data.responses.length > 0 && (
        <AdminBox title="Responses" count={data.responses.length} foldOnPhone>
          <AdminRows items={data.responses}>
            {(r) => <AdminRow key={r.id} href={`${base}/responses`} name={r.title} line={[r.line, shortDay(r.createdAt)].filter(Boolean).join(' · ')} />}
          </AdminRows>
        </AdminBox>
      )}

      <div className="bg-white border border-slate-200 rounded-[10px] overflow-hidden">
        <AdminRow href={`${base}/watches`} name="Watches" line={watches} />
        <AdminRow href={`${base}/searches`} name="Searches" line="Answered, dismissed and taught" />
        {data.responses.length === 0 && <AdminRow href={`${base}/responses`} name="Responses" />}
      </div>
    </div>
  )
}
