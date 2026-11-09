'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EditorStep, StepAsk } from '@/components/resources/ListingEditor'
import { leadsTo, samePath, sharedLength, stepCount, stepsIn, withSteps, withoutSteps, type StepParam } from '@/lib/stepAddress'
import { isOwnStepBack, moveBackTo, moveTo } from './useScreenHistory'

// The steps open inside a screen (a row of the editor, a minyan in it, a
// source's Change over it) as entries in the history, each with its own
// address, so Back, Forward and a reload land on each (AGENTS.md: "A screen
// of its own is an entry in the browser's history"). Before this they were
// entries pushed behind Next's router with nothing in the address
// (useHistoryDepth): a reload went back to the list, Forward onto a closed
// row did nothing, and Back from another tab drew nothing.
//
// The screen keeps its own state, as it always has, and says where it is
// as a path (['hours'], ['minyans', '2']); this keeps the address in step.
// A step opened adds an entry per level, through Next's router; one closed
// on the screen goes back over them. Back and Forward, a link and a reload
// go the other way: the address is read and `reopen` asked to open that
// path, which may take a render or two (a row, then the minyan in it).
//
// `owner`: see stepAddress.ts. `inner`: the parameters of screens inside
// this one's steps (a change's Edit, inside what a read found), which a
// step closed here closes too: their entries are stepped back over with it.

/** How long a reopening may take to arrive before the screen is taken as
 *  showing all of it it can (a row since removed, say). */
const REOPEN_MS = 1500

export function useStepsInAddress(
  param: StepParam | null,
  path: readonly string[],
  reopen: (path: string[]) => void,
  { owner, inner = [] }: { owner?: string; inner?: readonly StepParam[] } = {},
) {
  const router = useRouter()
  const now = useRef({ path, reopen })
  useEffect(() => {
    now.current = { path, reopen }
  })
  // What the address has, or will once the moves under way have landed.
  const written = useRef<string[] | null>(null)
  // A path asked of `reopen`, until the screen shows it.
  const reopening = useRef<{ to: string[]; until: number } | null>(null)

  useEffect(() => {
    if (!param) return
    const read = () => stepsIn(window.location.search, param, owner)
    const take = (to: string[]) => {
      written.current = to
      if (samePath(to, now.current.path)) return
      reopening.current = { to, until: Date.now() + REOPEN_MS }
      now.current.reopen(to)
    }
    take(read())
    const onPop = () => {
      if (!isOwnStepBack()) take(read())
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      written.current = null
    }
  }, [param, owner])

  const key = path.join('\n')
  useEffect(() => {
    const was = written.current
    if (!param || was === null) return
    const asked = reopening.current
    if (asked) {
      if (samePath(path, asked.to)) {
        reopening.current = null
        return
      }
      // On its way there.
      if (leadsTo(path, asked.to) && Date.now() < asked.until) return
      reopening.current = null
    }
    if (samePath(was, path)) return
    const shared = sharedLength(was, path)
    const at = (p: readonly string[]) => () => withSteps(window.location.pathname, window.location.search, param, p, owner)
    if (was.length > shared) {
      const to = path.slice(0, shared)
      const closing = was.length - shared
      void moveBackTo(router, () => closing + stepCount(window.location.search, inner), () => withSteps(window.location.pathname, new URL(withoutSteps(window.location.pathname, window.location.search, inner), window.location.origin).search, param, to, owner))
    }
    for (let i = shared; i < path.length; i++) void moveTo(router, 'push', at(path.slice(0, i + 1)))
    written.current = [...path]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the path
  }, [param, owner, key, router, inner.join()])
}

const NO_STEPS: string[] = []

/** A ListingEditor's steps, for a host that keeps them in the address: its
 *  step now and the path it's at, what to hand it (`onStep`, `reopen`), and
 *  `ask`, which opens a path in it. */
export function useEditorSteps() {
  const [step, setStep] = useState<EditorStep | null>(null)
  const [reopen, setReopen] = useState<StepAsk | null>(null)
  const ask = useCallback((path: readonly string[]) => setReopen((a) => ({ path, n: (a?.n ?? 0) + 1 })), [])
  return { step, path: step?.path ?? NO_STEPS, onStep: setStep, reopen, ask }
}
