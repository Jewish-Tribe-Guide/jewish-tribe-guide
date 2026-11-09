import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { screenHref, type EditorScreen } from '@/lib/editorScreenUrl'

// A screen's moves through the history, one at a time. Next's router writes
// an entry only once its navigation lands, and drops a navigation a newer
// one overtakes: a quick second click (Add a field, then Make your own) lost
// the first screen's entry, and a later step back went one too far, out of
// the editor (Nov 9, found walking it). So each push, replace or step back
// waits for the one before to land. What shows changes at once regardless;
// only the address follows.

const LANDING_LIMIT_MS = 4000

function landedOn(href: string): Promise<void> {
  return new Promise((done) => {
    const start = Date.now()
    const check = () => {
      if (window.location.pathname + window.location.search === href || Date.now() - start > LANDING_LIMIT_MS) done()
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
      done()
    }
    const limit = setTimeout(finish, LANDING_LIMIT_MS)
    window.addEventListener('popstate', finish)
    window.history.go(-steps)
  })
}

export function useScreenHistory() {
  const router = useRouter()
  const queue = useRef<Promise<void>>(Promise.resolve())
  const next = (move: () => Promise<void>) => {
    queue.current = queue.current.then(move)
    return queue.current
  }
  const to = (how: 'push' | 'replace', screen: EditorScreen) =>
    next(() => {
      const href = screenHref(window.location.pathname, window.location.search, screen)
      router[how](href, { scroll: false })
      return landedOn(href)
    })
  return {
    push: (screen: EditorScreen) => to('push', screen),
    replace: (screen: EditorScreen) => to('replace', screen),
    /** Back `steps` entries, once the moves before it have landed. */
    back: (steps = 1) => next(() => steppedBack(steps)),
  }
}
