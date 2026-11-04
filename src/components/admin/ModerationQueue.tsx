'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchJson } from '@/lib/fetchJson'
import type { ResourceSubmission } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { ADMIN_AREA_TAPPED } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { shownPlaces, todoPlaces, type TodoFilter } from '@/lib/todoPlaces'
import { loadTodo, reloadTodo, updateTodo, useTodo } from '@/lib/useTodo'
import { useTodoSplit } from './useTodoSplit'
import { useFullPane } from './AdminUI'
import TodoList, { ALL_OLDEST_FIRST, type TodoView } from './TodoList'
import TodoPlaceScreen from './TodoPlaceScreen'

// The admin's front page, To do (mounted at /<community>/admin itself):
// the one list of places with something waiting (TodoList), and a place
// opened to answer what's waiting there (TodoPlaceScreen), one thing at a
// time. The open place is in the address (?open=<place>), so Back returns
// to the list and the link can be shared with another admin. On a
// computer the list stays beside it, and a place that's done gives way to
// the next.

const OPENED = 'moderation-open'

// Which card is open: what the queue last opened itself, or, after Back and
// Forward (or a shared link), what the address says. Not read from the
// address after our own push: Next.js and the analytics script both wrap
// history.pushState, and the address changes a moment after the call, so
// reading it straight away still saw the list.
let openedHere: string | null | undefined

function openIdNow(): string | null {
  return openedHere !== undefined ? openedHere : new URLSearchParams(window.location.search).get('open')
}

function subscribeToAddress(onChange: () => void) {
  const onPop = () => {
    openedHere = undefined
    onChange()
  }
  // To do tapped in the nav, with a card open: back to the list.
  const onTapped = () => {
    openedHere = null
    onChange()
  }
  window.addEventListener('popstate', onPop)
  window.addEventListener(OPENED, onChange)
  window.addEventListener(ADMIN_AREA_TAPPED, onTapped)
  return () => {
    window.removeEventListener('popstate', onPop)
    window.removeEventListener(OPENED, onChange)
    window.removeEventListener(ADMIN_AREA_TAPPED, onTapped)
    // Coming back to the queue later reads the address afresh.
    openedHere = undefined
  }
}

const SHOWS: readonly TodoFilter[] = ['changes', 'new', 'broken', 'feedback']

/** A link's `?show=broken` (Watches' "N things need fixing", Nov 4): To do
 *  opens on it. Taken off the address once read, so it isn't kept in every
 *  address after it. */
function viewFromAddress(): TodoView {
  if (typeof window === 'undefined') return ALL_OLDEST_FIRST
  const shows = (new URLSearchParams(window.location.search).get('show') ?? '').split(',')
  return { ...ALL_OLDEST_FIRST, filters: SHOWS.filter((f) => shows.includes(f)) }
}

/** `replace`: moving on by itself, so Back doesn't return to a place that's done. */
function goTo(openId: string | null, replace = false) {
  const url = new URL(window.location.href)
  if (openId) url.searchParams.set('open', openId)
  else url.searchParams.delete('open')
  openedHere = openId
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url)
  window.dispatchEvent(new Event(OPENED))
}

export default function ModerationQueue({ session }: { session: Session }) {
  const community = useCommunitySlug()
  const token = session.access_token
  // Loaded afresh each time To do opens; the nav's count reads the same copy.
  const { data, error: loadError } = useTodo(token, community, session.user.email, true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const openId = useSyncExternalStore(subscribeToAddress, openIdNow, () => null)
  const [openError, setOpenError] = useState<string | null>(null)
  // Kept while a place is open, the list beside it or behind it.
  const [view, setView] = useState(viewFromAddress)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('show')) return
    url.searchParams.delete('show')
    window.history.replaceState(window.history.state, '', url)
  }, [])
  // Same categories the public site and the category admin editor read —
  // loaded fresh per admin page request (see /admin/layout.tsx's
  // ContentProvider), so a field added a minute ago already has a `label`
  // here without this component needing its own fetch or any per-field code.
  const categoriesById = new Map(useCategories().map((c) => [c.id, c]))
  const places = data ? todoPlaces(data, categoriesById) : null
  const shown = places ? shownPlaces(places, view) : []
  // A link from before places (?open=<suggestion>) opens its place.
  const openPlace = openId && places ? places.find((p) => p.key === openId || p.things.some((t) => t.kind === 'submission' && t.submission.id === openId)) : undefined
  // Where it sits: in the list as filtered, or if the search hides it, in all.
  const list = openPlace && shown.some((p) => p.key === openPlace.key) ? shown : (places ?? [])
  const at = openPlace ? list.findIndex((p) => p.key === openPlace.key) : -1
  // Things whose Edit is open: leaving asks first.
  const editing = useRef(new Set<string>())
  const editingChanged = useCallback((id: string, e: boolean) => void (e ? editing.current.add(id) : editing.current.delete(id)), [])
  // On a computer, the list and the place fill the window (N6Desk).
  useFullPane(!!openPlace)
  const wasOpen = useRef<string | null>(null)
  const listWhenOpen = useRef<string[]>([])

  function leave(): boolean {
    if (editing.current.size > 0 && !window.confirm('Leave without answering your edit? It won’t be kept.')) return false
    editing.current.clear()
    return true
  }

  // Opening a place and closing it keeps your spot in the list (the user,
  // Nov 2: "it loads the whole page"). On a computer the list moves into its
  // own column with the row you clicked where it was on screen, and closing
  // puts it back there; on a phone the place covers the list, and closing
  // returns to where you'd scrolled.
  const listColumn = useRef<HTMLDivElement>(null)
  const split = useTodoSplit()
  const spot = useRef<{ key: string; y: number; top: number } | null>(null)
  const rowOf = (key: string) => [...(listColumn.current?.querySelectorAll<HTMLElement>('[data-place]') ?? [])].find((r) => r.dataset.place === key) ?? null
  const wide = () => !!window.matchMedia?.('(min-width: 768px)').matches
  const shownKey = openPlace?.key ?? null
  const wasShown = useRef<string | null>(null)

  // Where the open row sits in its column as the place closes, so the list
  // comes back with it there: read before the list re-renders, as you may
  // have scrolled the column since.
  function remember() {
    const key = wasShown.current
    const row = key && wide() ? rowOf(key) : null
    if (row) spot.current = { key: key!, y: spot.current?.y ?? 0, top: row.getBoundingClientRect().top }
  }
  useEffect(() => {
    window.addEventListener('popstate', remember)
    window.addEventListener(ADMIN_AREA_TAPPED, remember)
    return () => {
      window.removeEventListener('popstate', remember)
      window.removeEventListener(ADMIN_AREA_TAPPED, remember)
    }
  })

  function open(key: string) {
    if (key === openPlace?.key || !leave()) return
    setOpenError(null)
    if (!openPlace) spot.current = { key, y: window.scrollY, top: rowOf(key)?.getBoundingClientRect().top ?? 0 }
    goTo(key)
    if (!wide()) window.scrollTo?.(0, 0)
  }

  useLayoutEffect(() => {
    const before = wasShown.current
    wasShown.current = shownKey
    if (shownKey === before) return
    // Now, and again once the frame around it has taken its new shape
    // (useFullPane, a render of its own); each move is to a place, not by an
    // amount, so the second only corrects the first. Not cancelled by the
    // next render, since this runs once per open or close; gone by then,
    // there's no column and nothing to move.
    const settle = () => {
      const s = spot.current
      if (!wide()) {
        if (!shownKey && s) window.scrollTo(0, s.y)
        return
      }
      const column = listColumn.current
      if (shownKey) {
        const row = rowOf(shownKey)
        if (!row || !column) return
        if (!before) {
          window.scrollTo(0, 0)
          if (s?.key === shownKey) column.scrollTop += row.getBoundingClientRect().top - s.top
          else row.scrollIntoView?.({ block: 'center' })
        } else row.scrollIntoView?.({ block: 'nearest' })
        return
      }
      const row = before ? rowOf(before) : null
      if (row && s?.key === before) window.scrollTo(0, window.scrollY + row.getBoundingClientRect().top - s.top)
      else if (s) window.scrollTo(0, s.y)
    }
    settle()
    setTimeout(settle, 0)
  })

  function backToList() {
    if (!leave()) return
    remember()
    goTo(null)
  }

  // Esc closes the open place, as its X does (the user, Nov 2), on a
  // computer; not while typing, nor when a menu or dialog takes it first.
  useEffect(() => {
    if (!shownKey) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !wide()) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"], dialog')) return
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return
      backToList()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (openPlace) {
      if (openPlace.key !== openId) goTo(openPlace.key, true)
      wasOpen.current = openPlace.key
      listWhenOpen.current = list.map((p) => p.key)
      return
    }
    // Nothing left at the open place: back to the list on a phone, the
    // next place on a computer.
    if (!openId || !places || wasOpen.current !== openId) return
    wasOpen.current = null
    editing.current.clear()
    const keys = listWhenOpen.current
    const next = keys.slice(keys.indexOf(openId) + 1).find((k) => places.some((p) => p.key === k))
    goTo(next && window.matchMedia?.('(min-width: 768px)').matches ? next : null, true)
  })

  // Up and down step through the places, on a computer.
  useEffect(() => {
    if (!openPlace) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], [role="menu"], [role="tablist"]')) return
      const to = e.key === 'ArrowDown' ? list[at + 1] : e.key === 'ArrowUp' ? list[at - 1] : undefined
      if (!to) return
      e.preventDefault()
      open(to.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // `part`: one part of a change; the rest still waits, so the change is
  // read again rather than taken off the list.
  async function moderate(id: string, status: 'approved' | 'rejected', reason?: string, payload?: ResourceSubmission, part?: string): Promise<'partial' | 'whole' | 'failed'> {
    setBusyId(id)
    setOpenError(null)
    try {
      const res = await fetchJson<{ partial?: boolean }>(
        withCommunity(`/api/admin/submissions/${id}`, community),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status, ...(reason ? { reason } : {}), ...(payload ? { payload } : {}), ...(part ? { part } : {}) }),
        },
        'Failed to update.',
      )
      if (res?.partial) {
        await loadTodo(token, community, session.user.email, true)
        return 'partial'
      }
      // Off the list; once nothing is left at the place, To do moves on.
      updateTodo((d) => ({ ...d, submissions: d.submissions.filter((s) => s.id !== id) }))
      return 'whole'
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      // An opened card keeps the admin's fixes on screen, with the reason
      // beside them, instead of losing them to an error at the top.
      if (openPlace) setOpenError(message)
      else setError(message)
      return 'failed'
    } finally {
      setBusyId(null)
    }
  }

  const next = list[at + 1]
  const prev = at > 0 ? list[at - 1] : undefined
  const position = { at, total: list.length, back: backToList, prev: prev ? () => open(prev.key) : undefined, next: next ? () => open(next.key) : undefined }

  return (
    <div>
      {(loadError || error) && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{loadError || error}</p>
      )}
      {data === null ? (
        <p className="text-sm text-muted">Loading submissions…</p>
      ) : (
        !loadError && (
          // On a computer the list stays beside the open place (the inbox),
          // each the window's height, scrolling on its own (N6Desk), with
          // the line between them dragged to share the room (useTodoSplit).
          <div ref={openPlace ? split.gridRef : undefined} style={openPlace ? split.gridStyle : undefined} className={openPlace ? 'md:grid md:h-dvh' : undefined}>
            <div
              ref={listColumn}
              className={openPlace ? 'max-md:hidden md:overflow-y-auto md:bg-white md:px-4 md:pt-6' : undefined}
            >
              {openPlace && (
                <h1 className="m-0 mb-4 flex items-baseline gap-2.5 text-[26px] font-bold text-slate-900">
                  To do <span className="text-[14px] font-normal text-slate-500">{list.length} to decide</span>
                </h1>
              )}
              <TodoList data={data} categoriesById={categoriesById} view={view} onView={setView} onOpen={(p) => open(p.key)} openKey={openPlace?.key} />
            </div>
            {openPlace && (
              <div {...split.handleProps} className="max-md:hidden group relative cursor-col-resize touch-none bg-white focus-visible:outline-none">
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-slate-200 transition-[width,background-color] group-hover:w-[3px] group-hover:bg-primary group-focus-visible:w-[3px] group-focus-visible:bg-primary" />
              </div>
            )}
            {openPlace && (
              <TodoPlaceScreen
                key={openPlace.key}
                place={openPlace}
                filters={view.filters}
                position={position}
                categoriesById={categoriesById}
                token={token}
                busyId={busyId}
                error={openError}
                moderate={moderate}
                onUpdated={(id, partial) => {
                  if (partial) return void loadTodo(token, community, session.user.email, true)
                  updateTodo((d) => ({ ...d, submissions: d.submissions.filter((x) => x.id !== id) }))
                }}
                onEditing={editingChanged}
                jobs={data.jobs ?? null}
                reload={() => reloadTodo(token, community, session.user.email)}
              />
            )}
          </div>
        )
      )}
    </div>
  )
}
