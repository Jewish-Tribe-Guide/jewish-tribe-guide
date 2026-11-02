'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { EnrichedSubmission } from '@/types'
import { parseOkJson } from './fetchJson'
import { withCommunity } from './useCommunityData'
import { todoCount, unmatchedPlaces, type TodoResponse, type TodoUnmatched } from './todo'
import { setupLeft, type SetupState } from './setup'
import { loadJobs, type Jobs } from '@/components/admin/useWatchJobs'
import { notBeingRead, waitingNotQueued, type TodoNotRead, type TodoWaiting } from '@/components/admin/todoWaiting'

// What To do holds, loaded once and shared: the To do page shows it and
// the nav counts it, from the same copy, so a decision taken on the page
// changes the count at once. The page loads it afresh when it opens; the
// nav only loads it when nothing has yet.

export type TodoData = {
  submissions: EnrichedSubmission[]
  responses: TodoResponse[]
  /** Places waiting to be found on Google, or said not to be on it. */
  unmatched: TodoUnmatched[]
  /** What a job read that waits on a decision but isn't in the queue: a
   *  closure, a check against Google, a menu. Loaded after the rest. */
  waiting?: TodoWaiting[]
  /** A source that has stopped being read. Loaded with `waiting`. */
  notRead?: TodoNotRead[]
  /** What the setup checklist ticks off; null if it couldn't be read, so
   *  no checklist shows rather than a wrong one. */
  setup: SetupState | null
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
  const [subs, responses, setup, google] = await Promise.allSettled([
    get<{ submissions: EnrichedSubmission[] }>(at('/api/admin/submissions'), token, 'Failed to load.'),
    get<{ responses: TodoResponse[] }>(at('/api/admin/responses?new=1'), token, 'Failed to load the responses.'),
    get<{ setup: SetupState }>(at('/api/admin/setup'), token, 'Failed to load the setup.'),
    get<{ places: Parameters<typeof unmatchedPlaces>[0] }>(at('/api/admin/watches/google'), token, 'Failed to load Google’s places.'),
  ])
  if (state.key !== key) return
  if (subs.status === 'rejected') {
    const error =
      subs.reason instanceof Unauthorized
        ? `Signed in as ${email}, but this account is not an authorized admin.`
        : subs.reason instanceof Error
          ? subs.reason.message
          : 'Something went wrong.'
    set({ key, data: { submissions: [], responses: [], unmatched: [], setup: null }, error })
    return
  }
  set({
    key,
    error: null,
    data: {
      submissions: subs.value.submissions,
      responses: (responses.status === 'fulfilled' && responses.value.responses) || [],
      unmatched: google.status === 'fulfilled' && google.value.places ? unmatchedPlaces(google.value.places) : [],
      setup: setup.status === 'fulfilled' ? setup.value.setup : null,
      // Kept until the jobs answer again, so the count doesn't dip meanwhile.
      waiting: state.data?.waiting,
      notRead: state.data?.notRead,
    },
  })
  void loadWaiting(key, token, community)
}

let waitingLoads = 0

/** Every job's reading, after the rest so To do doesn't wait on them; what
 *  couldn't load just isn't counted. Only the latest load's answer is kept. */
async function loadWaiting(key: string, token: string, community: string) {
  const load = ++waitingLoads
  const jobs: Jobs = {}
  await loadJobs(token, community, (k, v) => void (jobs[k] = v), (k) => void (jobs[k] = null))
  if (state.key === key && load === waitingLoads) updateTodo((d) => ({ ...d, waiting: waitingNotQueued(jobs, Date.now()), notRead: notBeingRead(jobs, Date.now()) }))
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

/** The one number in the nav: what To do holds, setup steps left
 *  included, or null until loaded. */
export function useTodoCount(token: string, community: string): number | null {
  const { data } = useTodo(token, community)
  return data ? todoCount(data) + setupLeft(data.setup) : null
}

/** For tests: forget what was loaded. */
export function resetTodo() {
  state = { key: '', data: null, error: null }
  inFlight = null
}
