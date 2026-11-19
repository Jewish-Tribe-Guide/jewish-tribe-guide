'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { moveBackTo, moveTo } from '@/components/admin/useScreenHistory'
import { samePath, sharedLength, stepsIn, withSteps } from '@/lib/stepAddress'

// ─────────────────────────────────────────────────────────────────────────────
// A listing's editor, opened over the listing, and its Request removal
// screen, in the address (AGENTS.md: "A screen of its own is an entry in the
// browser's history"):
//
//   ?editing=<id>~listing           the editor
//   ?editing=<id>~listing/removal   its Request removal, opened from inside it
//   ?editing=<id>~removal           Request removal, straight from the edit bar
//
// Under the listing's id (stepAddress's `owner`): a view of another listing
// reads it as none. A phone's category page keeps every listing's sheet it
// has opened, and the Map draws the next place it shows in a new view, so
// without it the next listing opened over an editor's address came up in
// its editor.
//
// Each level is an entry, so Back, Escape and the phone's back swipe step
// out of removal into the edit (what was typed there still there), then out
// to the listing, never off the page; from the bar's Request removal, Back
// is the listing. The removal screen has no Cancel of its own.
//
// Until Nov 19 these were entries pushed behind Next's router with nothing
// in the address: a reload went back to the listing while the history still
// held the editor, so the next Back seemed to do nothing, and Back to one
// from another page changed the address and drew nothing. Written through
// Next's router now, queued (useScreenHistory), and read back on opening and
// on every Back and Forward, so what shows and where the browser is can't
// drift apart.
//
// `enabled` false: an editor opened on (the admin preview's Adding), with
// no listing under it to step back to. It is state alone then.
// ─────────────────────────────────────────────────────────────────────────────

export type EditorInAddress = {
  formOpen: 'edit' | null
  removalOpen: boolean
  /** Opens the editor: one entry. */
  openForm: (mode: 'edit') => void
  /** The edit bar's Request removal: straight to that screen, one entry,
   *  so Back returns to the listing. */
  openRemoval: () => void
  /** One step back: from removal to the edit (or the listing, opened from
   *  the bar), from the edit to the listing. */
  stepBack: () => void
  /** All the way out of the editor, over every entry it has. */
  closeForm: () => void
  /** The editor's own switch to and from its removal screen. */
  changeRemovalOpen: (open: boolean) => void
  /** Forgets an editor open for a listing no longer showing. State only:
   *  whoever showed another listing has moved the address. */
  reset: () => void
}

type Path = readonly string[]

const EDIT: Path = ['listing']
const REMOVAL_IN_EDIT: Path = ['listing', 'removal']
const REMOVAL: Path = ['removal']
const NONE: Path = []
const SCREENS = [NONE, EDIT, REMOVAL_IN_EDIT, REMOVAL]

/** The screen of `owner`'s editor the address names; none for one it
 *  doesn't know, or another listing's. */
export function editingIn(search: string, owner?: string): Path {
  const path = stepsIn(search, 'editing', owner)
  return SCREENS.find((s) => samePath(s, path)) ?? NONE
}

/** `owner`: the listing's id. */
export function useEditorInAddress(enabled = true, owner?: string): EditorInAddress {
  const router = useRouter()
  const [path, setPath] = useState<Path>(NONE)
  // The path as of the last move, for a second one before the next render.
  const now = useRef<Path>(NONE)
  // Our own steps back, on their way: their popstate is ours, not the
  // visitor's, and the address read then is a step behind what's showing.
  const ownBacks = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const read = () => {
      now.current = editingIn(window.location.search, owner)
      setPath(now.current)
    }
    read()
    const onPop = () => {
      if (ownBacks.current === 0) read()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [enabled, owner])

  // The same functions every render, so an effect can list them.
  const moves = useMemo(() => {
    const at = (path: Path) => () => withSteps(window.location.pathname, window.location.search, 'editing', path, owner)
    const go = (to: Path) => {
      const was = now.current
      if (samePath(was, to)) return
      now.current = to
      setPath(to)
      if (!enabled) return
      const shared = sharedLength(was, to)
      if (was.length > shared) {
        ownBacks.current++
        void moveBackTo(router, was.length - shared, at(to.slice(0, shared)), { keepState: true }).finally(() => ownBacks.current--)
      }
      for (let i = shared; i < to.length; i++) void moveTo(router, 'push', at(to.slice(0, i + 1)), { keepState: true })
    }
    const inRemoval = () => now.current[now.current.length - 1] === 'removal'
    return {
      openForm: () => go(EDIT),
      openRemoval: () => go(REMOVAL),
      stepBack: () => go(now.current.slice(0, -1)),
      closeForm: () => go(NONE),
      changeRemovalOpen: (removal: boolean) => {
        if (removal && !inRemoval()) go(REMOVAL_IN_EDIT)
        else if (!removal && inRemoval()) go(now.current.slice(0, -1))
      },
      reset: () => {
        now.current = NONE
        setPath(NONE)
      },
    }
  }, [router, enabled, owner])

  return { formOpen: path.length > 0 ? 'edit' : null, removalOpen: path[path.length - 1] === 'removal', ...moves }
}
