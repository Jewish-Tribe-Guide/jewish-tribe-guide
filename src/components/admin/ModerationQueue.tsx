'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchJson } from '@/lib/fetchJson'
import type { ResourceSubmission } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { ADMIN_AREA_TAPPED } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { shownPlaces, todoPlaces } from '@/lib/todoPlaces'
import { loadTodo, updateTodo, useTodo } from '@/lib/useTodo'
import TodoList, { ALL_OLDEST_FIRST } from './TodoList'
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
  const [view, setView] = useState(ALL_OLDEST_FIRST)
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
  const wasOpen = useRef<string | null>(null)
  const listWhenOpen = useRef<string[]>([])

  function leave(): boolean {
    if (editing.current.size > 0 && !window.confirm('Leave without answering your edit? It won’t be kept.')) return false
    editing.current.clear()
    return true
  }

  function open(key: string) {
    if (key === openPlace?.key || !leave()) return
    setOpenError(null)
    goTo(key)
    window.scrollTo?.(0, 0)
  }

  function backToList() {
    if (leave()) goTo(null)
  }

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
  const position = { at, total: list.length, back: backToList, next: next ? () => open(next.key) : undefined }

  return (
    <div>
      {(loadError || error) && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{loadError || error}</p>
      )}
      {data === null ? (
        <p className="text-sm text-muted">Loading submissions…</p>
      ) : (
        !loadError && (
          // On a computer the list stays beside the open place (the inbox).
          <div className={openPlace ? 'md:grid md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-6 md:items-start' : undefined}>
            <div className={openPlace ? 'max-md:hidden' : undefined}>
              <TodoList data={data} categoriesById={categoriesById} view={view} onView={setView} onOpen={(p) => open(p.key)} openKey={openPlace?.key} />
            </div>
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
              />
            )}
          </div>
        )
      )}
    </div>
  )
}
