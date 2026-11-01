'use client'

import { useCallback, useState } from 'react'
import type { ClassifiedMiss } from '@/lib/missedSearches'
import { fetchJson } from '@/lib/fetchJson'
import { routes } from '@/lib/routes'
import { useCommunitySlug } from '@/lib/communityContext'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { withCommunity } from '@/lib/useCommunityData'
import { repeatedSearches, shortDay, teachable, type TodoReading, type TodoSearch, type TodoWord } from '@/lib/todo'
import { AdminBox, AdminRows, Chevron } from './AdminUI'

// The searches worth an admin's time: asked more than once, still with no
// answer. Nobody is expected to go through every search (the user, Oct 31),
// so these sit in Reports and aren't counted as something to do. Each opens
// in place, with Add a place, Teach and Dismiss.

type Loaded = {
  searches: TodoSearch[]
  /** Categories a search can be added to or taught as. */
  addable: { id: string; label: string }[]
  canDismiss: boolean
  canTeach: boolean
}

const button = 'inline-flex items-center justify-center min-h-11 px-3.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`
const secondary = `${button} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`

function SearchRow({
  search,
  data,
  token,
  open,
  onToggle,
  onDone,
}: {
  search: TodoSearch
  data: Loaded
  token: string
  open: boolean
  onToggle: () => void
  onDone: () => void
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
      onDone()
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

export default function RepeatedSearches({ token, onChange }: { token: string; onChange?: () => void }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const at = (path: string) => withCommunity(path, community)
    const headers = { Authorization: `Bearer ${token}` }
    try {
      const [misses, readings] = await Promise.all([
        fetchJson<{ searches: ClassifiedMiss[]; addable: Loaded['addable']; dismissalsAvailable: boolean }>(at('/api/admin/missed-searches'), { headers }, 'Failed to load the searches.'),
        fetchJson<{ readings: TodoReading[]; wordsAvailable: boolean }>(at('/api/admin/read-questions'), { headers }, 'Failed to load the searches.').catch(() => null),
      ])
      setData({
        searches: repeatedSearches(misses.searches, readings?.readings ?? []),
        addable: misses.addable,
        canDismiss: misses.dismissalsAvailable,
        canTeach: readings?.wordsAvailable ?? false,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading…</p>
  return (
    <AdminBox title="Asked more than once" count={data.searches.length}>
      {data.searches.length === 0 ? (
        <p className="m-0 px-4 py-3.5 text-sm text-slate-600">None right now.</p>
      ) : (
        <AdminRows items={data.searches}>
          {(s) => (
            <SearchRow
              key={s.term}
              search={s}
              data={data}
              token={token}
              open={open === s.term}
              onToggle={() => setOpen((t) => (t === s.term ? null : s.term))}
              onDone={() => {
                setData((d) => d && { ...d, searches: d.searches.filter((x) => x.term !== s.term) })
                onChange?.()
              }}
            />
          )}
        </AdminRows>
      )}
    </AdminBox>
  )
}
