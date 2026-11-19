import { useRouter } from 'next/navigation'
import { screenHref, type EditorScreen } from '@/lib/editorScreenUrl'

// A screen's moves through the history, one at a time. Next's router writes
// an entry only once its navigation lands, and drops a navigation a newer
// one overtakes: a quick second click (Add a field, then Make your own) lost
// the first screen's entry, and a later step back went one too far, out of
// the editor (Nov 9, found walking it). So each push, replace or step back
// waits for the one before to land. What shows changes at once regardless;
// only the address follows.
//
// One queue for the whole page, not one per screen: a place and the editor
// inside it move together (closing a row, then the place), and two queues
// would let the second overtake the first.

const LANDING_LIMIT_MS = 4000

let queue: Promise<void> = Promise.resolve()
function next(move: () => Promise<void>): Promise<void> {
  // The page gone (a test torn down mid-move): nothing left to move, and
  // working out an address would throw after the file had passed.
  const run = queue.then(() => (typeof window === 'undefined' ? undefined : move()))
  // A move that fails is its caller's to hear about; the ones after it
  // still run.
  queue = run.catch(() => undefined)
  return run
}

// Set while a step back of ours is on its way, so the screens listening for
// Back and Forward don't take it for the admin's own.
let ownStepBack = 0
export const isOwnStepBack = () => ownStepBack > 0

const here = () => window.location.pathname + window.location.search

function landedOn(href: string): Promise<void> {
  return new Promise((done) => {
    const start = Date.now()
    const check = () => {
      // The page gone (a test torn down mid-move): nothing to wait for.
      if (typeof window === 'undefined' || here() === href || Date.now() - start > LANDING_LIMIT_MS) done()
      else setTimeout(check, 20)
    }
    check()
  })
}

function steppedBack(steps: number): Promise<void> {
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(limit)
      window.removeEventListener('popstate', finish)
      ownStepBack--
      done()
    }
    const limit = setTimeout(finish, LANDING_LIMIT_MS)
    window.addEventListener('popstate', finish)
    ownStepBack++
    window.history.go(-steps)
  })
}

type NavigationEntries = { currentEntry?: { index: number } | null; entries?: () => { url: string | null }[] }

/** The address `steps` entries back, where the browser says (the Navigation
 *  API); undefined where it can't. */
function addressBack(steps: number): string | null | undefined {
  const nav = (globalThis as { navigation?: NavigationEntries }).navigation
  const at = nav?.currentEntry?.index
  if (!nav?.entries || at === undefined) return undefined
  const url = nav.entries()[at - steps]?.url
  if (!url) return null
  const u = new URL(url)
  return u.origin === window.location.origin ? u.pathname + u.search : null
}

type Router = ReturnType<typeof useRouter>

// Next's own keys in an entry's state. Everything else is the page's.
const NEXT_KEYS = new Set(['__NA', '__N', '__PRIVATE_NEXTJS_INTERNALS_TREE'])

/** `keepState`: the entry written keeps the page's own keys of the one it
 *  was written from. Next's router writes only its own, and a public page
 *  still reads its places from there (a listing's `step`, the map's
 *  `mapSheetOpen`): an editor's entry without them was a listing closed to
 *  its Back and Forward. Put back with Next's keys on top, which tells
 *  Next the write is its own (AGENTS.md), so its router isn't told. */
type MoveOptions = { keepState?: boolean }

function pageState(): Record<string, unknown> | null {
  const state = window.history.state as Record<string, unknown> | null
  if (!state || typeof state !== 'object') return null
  const own = Object.fromEntries(Object.entries(state).filter(([k]) => !NEXT_KEYS.has(k)))
  return Object.keys(own).length ? own : null
}

function landedKeeping(href: string, kept: Record<string, unknown> | null): Promise<void> {
  return landedOn(href).then(() => {
    if (!kept || typeof window === 'undefined' || here() !== href) return
    window.history.replaceState({ ...kept, ...(window.history.state as object | null) }, '', window.location.href)
  })
}

/** Writes `href` (worked out when the move runs, after those before it). */
export function moveTo(router: Router, how: 'push' | 'replace', href: () => string, { keepState = false }: MoveOptions = {}): Promise<void> {
  return next(() => {
    const to = href()
    if (to === here()) return Promise.resolve()
    const kept = keepState ? pageState() : null
    router[how](to, { scroll: false })
    return landedKeeping(to, kept)
  })
}

/** Back `steps` entries, once the moves before it have landed. */
export function moveBack(steps: number): Promise<void> {
  return next(() => (steps > 0 ? steppedBack(steps) : Promise.resolve()))
}

/** Back `steps` entries to `to()`, when that's the entry there. Opened from
 *  a link or a reload, the screens behind it were never entries in this
 *  history (or are someone else's page): it's put in this entry's place
 *  instead, so Back never leaves the admin from a screen inside it. */
export function moveBackTo(router: Router, stepsNow: number | (() => number), to: () => string, { keepState = false }: MoveOptions = {}): Promise<void> {
  return next(() => {
    const steps = typeof stepsNow === 'number' ? stepsNow : stepsNow()
    const href = to()
    const behind = addressBack(steps)
    if (steps > 0 && (behind === undefined || behind === href)) return steppedBack(steps)
    if (href === here()) return Promise.resolve()
    const kept = keepState ? pageState() : null
    router.replace(href, { scroll: false })
    return landedKeeping(href, kept)
  })
}

export function useScreenHistory() {
  const router = useRouter()
  const to = (how: 'push' | 'replace', screen: EditorScreen) => moveTo(router, how, () => screenHref(window.location.pathname, window.location.search, screen))
  return {
    push: (screen: EditorScreen) => to('push', screen),
    replace: (screen: EditorScreen) => to('replace', screen),
    /** Back `steps` entries, once the moves before it have landed. */
    back: (steps = 1) => moveBack(steps),
  }
}
