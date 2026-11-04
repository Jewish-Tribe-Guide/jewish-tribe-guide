'use client'

import type { CategoryConfig } from '@/lib/categories'
import { shortDay } from '@/lib/todo'
import type { TodoData } from '@/lib/useTodo'
import { placeLine, shownPlaces, todoPlaces, type TodoFilter, type TodoPlace, type TodoSort } from '@/lib/todoPlaces'
import { setupLeft } from '@/lib/setup'
import { AdminEmpty, AdminMenu, AdminRow } from './AdminUI'
import SetupChecklist from './SetupChecklist'

// To do's one list, a row per place (the "one tap per place" boards,
// approved Nov 2): the place, the oldest thing waiting there dated small,
// and what's waiting in a grey line. A tap opens the place on its first
// thing (TodoPlaceScreen). Above it, a search by name, a filter by kind
// that also picks where a place opens, and a sort. A guide not yet set up
// has its checklist first (step 6, board "Setup").

const FILTERS: { value: TodoFilter | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'changes', label: 'Changes' },
  { value: 'new', label: 'New places' },
  { value: 'broken', label: 'Broken checks' },
  { value: 'feedback', label: 'Feedback' },
]
const SORTS: { value: TodoSort; label: string }[] = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name' },
]

/** `category`: a category's id, or '' for all of them. */
export type TodoView = { query: string; filters: TodoFilter[]; category: string; sort: TodoSort }

/** Where To do starts: everything, newest first (the user, Nov 4), so a
 *  place read again, dated today, comes up top. */
export const TODO_START: TodoView = { query: '', filters: [], category: '', sort: 'newest' }

export default function TodoList({
  data,
  categoriesById,
  view,
  onView,
  onOpen,
  openKey,
}: {
  data: TodoData
  categoriesById: Map<string, CategoryConfig>
  view: TodoView
  onView: (v: TodoView) => void
  onOpen: (place: TodoPlace) => void
  /** The place open beside the list, on a computer. */
  openKey?: string
}) {
  const places = todoPlaces(data, categoriesById)
  const shown = shownPlaces(places, view)
  const setupToGo = setupLeft(data.setup)
  const toggle = (v: TodoFilter | 'all') =>
    onView({ ...view, filters: v === 'all' ? [] : view.filters.includes(v) ? view.filters.filter((f) => f !== v) : [...view.filters, v] })
  // As Places' Category menu (the user, Nov 2), with only the categories
  // something waits in under the search and Show (Nov 4), and the one
  // picked even once it's emptied.
  const besideCategory = shownPlaces(places, { ...view, category: '' })
  const inCategory = (id: string) => besideCategory.filter((p) => p.category === id).length
  const categories = [...categoriesById.values()].filter((c) => c.id === view.category || inCategory(c.id) > 0)

  return (
    <div className="flex flex-col gap-4">
      {data.setup && <SetupChecklist setup={data.setup} />}

      {places.length === 0 ? (
        setupToGo > 0 ? (
          <p className="m-0 text-[15px] text-slate-600">Nothing else to do.</p>
        ) : (
          <AdminEmpty>
            <span className="block text-[17px] font-bold text-slate-900">Nothing to do</span>
            <span className="block mt-1">Every place was read this morning</span>
          </AdminEmpty>
        )
      ) : (
        <>
          <label className="flex items-center gap-2 h-11 rounded-[10px] border border-slate-300 bg-white px-3 text-[15px]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#64748b" strokeWidth="1.8" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <input
              type="search"
              value={view.query}
              onChange={(e) => onView({ ...view, query: e.target.value })}
              placeholder="Find a place by name"
              aria-label="Find a place by name"
              className="min-w-0 flex-1 border-0 bg-transparent outline-none"
            />
          </label>
          <div className="flex gap-1.5 sm:gap-2">
            <AdminMenu
              name="Show"
              value="all"
              several={view.filters}
              showValue
              options={FILTERS.map((f) => ({ ...f, count: f.value === 'all' ? places.length : places.filter((p) => p.things.some((t) => t.filter === f.value)).length }))}
              onChange={toggle}
            />
            <AdminMenu
              name="Category"
              value={view.category}
              options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.pluralLabel, count: inCategory(c.id) }))]}
              onChange={(category) => onView({ ...view, category })}
            />
            <AdminMenu name="Sort" value={view.sort} showValue options={SORTS} onChange={(sort) => onView({ ...view, sort })} />
          </div>

          {shown.length === 0 ? (
            <AdminEmpty>None here.</AdminEmpty>
          ) : (
            // Beside an open place, the rows run edge to edge down the
            // column, the open one barred in blue (N6Desk).
            <div
              className={`bg-white border border-slate-200 rounded-[10px] overflow-hidden divide-y divide-slate-200 ${openKey ? 'md:-mx-4 md:rounded-none md:border-x-0 md:border-b-0' : ''}`}
              data-testid="todo-places"
            >
              {shown.map((p) => (
                <div key={p.key} data-place={p.key} aria-current={p.key === openKey || undefined} className={p.key === openKey ? 'bg-blue-50 shadow-[inset_3px_0_0_var(--color-primary)]' : undefined}>
                  <AdminRow
                    onClick={() => onOpen(p)}
                    label={`Open ${p.name}`}
                    name={
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1">{p.name}</span>
                        {p.at && <span className="flex-none text-[12.5px] font-normal text-slate-500">{shortDay(p.at)}</span>}
                      </span>
                    }
                    line={placeLine(p)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
