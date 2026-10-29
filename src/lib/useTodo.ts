'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { EnrichedSubmission } from '@/types'
import type { ClassifiedMiss } from './missedSearches'
import { parseOkJson } from './fetchJson'
import { withCommunity } from './useCommunityData'
import { openSearches, todoCount, type TodoReading, type TodoResponse, type TodoSearch } from './todo'

// What To do holds, loaded once and shared: the To do page shows it and
// the nav counts it, from the same copy, so a decision taken on the page
// changes the count at once. The page loads it afresh when it opens; the
// nav only loads it when nothing has yet.

export type TodoData = {
  submissions: EnrichedSubmission[]
  searches: TodoSearch[]
  /** Categories a search can be added to or taught as. */
  addable: { id: string; label: string }[]
  canDismiss: boolean
  canTeach: boolean
  responses: TodoResponse[]
}

type State = { key: string; data: TodoData | null; error: string | null }

let state: State = { key: '', data: null, error: null }
let inFlight: { key: string; promise: Promise<void> } | null = null
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

async function get<T>(url: string, token: string, failure: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new Unauthorized()
  return parseOkJson<T>(res, failure)
}

class Unauthorized extends Error {}

async function load(key: string, token: string, community: string, email: string | undefined) {
  const at = (path: string) => withCommunity(path, community)
  const [subs, misses, readings, responses] = await Promise.allSettled([
    get<{ submissions: EnrichedSubmission[] }>(at('/api/admin/submissions'), token, 'Failed to load.'),
    get<{ searches: ClassifiedMiss[]; addable: { id: string; label: string }[]; dismissalsAvailable: boolean }>(
      at('/api/admin/missed-searches'),
      token,
      'Failed to load the searches.',
    ),
    get<{ readings: TodoReading[]; wordsAvailable: boolean }>(
      at('/api/admin/read-questions'),
      token,
      'Failed to load the searches.',
    ),
    get<{ responses: TodoResponse[] }>(at('/api/admin/responses?new=1'), token, 'Failed to load the responses.'),
  ])
  if (state.key !== key) return
  if (subs.status === 'rejected') {
    const error =
      subs.reason instanceof Unauthorized
        ? `Signed in as ${email}, but this account is not an authorized admin.`
        : subs.reason instanceof Error
          ? subs.reason.message
          : 'Something went wrong.'
    set({ key, data: { submissions: [], searches: [], addable: [], canDismiss: false, canTeach: false, responses: [] }, error })
    return
  }
  const m = misses.status === 'fulfilled' ? misses.value : null
  const r = readings.status === 'fulfilled' ? readings.value : null
  set({
    key,
    error: null,
    data: {
      submissions: subs.value.submissions,
      searches: openSearches(m?.searches ?? [], r?.readings ?? []),
      addable: m?.addable ?? [],
      canDismiss: m?.dismissalsAvailable ?? false,
      canTeach: r?.wordsAvailable ?? false,
      responses: (responses.status === 'fulfilled' && responses.value.responses) || [],
    },
  })
}

/** Loads To do (again, with `fresh`), sharing a load already under way. */
export function loadTodo(token: string, community: string, email?: string, fresh = false): Promise<void> {
  const key = `${community}|${token}`
  if (inFlight?.key === key) return inFlight.promise
  if (!fresh && state.key === key && state.data) return Promise.resolve()
  if (state.key !== key) set({ key, data: null, error: null })
  const promise = load(key, token, community, email).finally(() => {
    if (inFlight?.promise === promise) inFlight = null
  })
  inFlight = { key, promise }
  return promise
}

/** Changes the loaded copy after a decision, so the page and the count
 *  follow it without loading again. */
export function updateTodo(change: (d: TodoData) => TodoData) {
  if (state.data) set({ ...state, data: change(state.data) })
}

export function useTodo(token: string, community: string, email?: string, fresh = false) {
  const key = `${community}|${token}`
  useEffect(() => {
    void loadTodo(token, community, email, fresh)
  }, [token, community, email, fresh])
  const s = useSyncExternalStore(subscribe, () => state, () => state)
  return s.key === key ? s : { key, data: null, error: null }
}

/** The one number in the nav: what To do holds, or null until loaded. */
export function useTodoCount(token: string, community: string): number | null {
  const { data } = useTodo(token, community)
  return data ? todoCount(data) : null
}

/** For tests: forget what was loaded. */
export function resetTodo() {
  state = { key: '', data: null, error: null }
  inFlight = null
}
