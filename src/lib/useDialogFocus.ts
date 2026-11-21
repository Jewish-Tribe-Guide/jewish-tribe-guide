'use client'

import { useEffect, useRef, type RefObject } from 'react'

// ── A dialog takes the focus, keeps it, and gives it back (Nov 20) ──
// None of the site's dialogs or sheets moved the focus (the health sweep).
// A keyboard or screen-reader visitor who opened one stayed on the button
// behind it: Tab walked the page under the dimmed backdrop, and the dialog
// itself was reachable only after everything before it in the page.
//
// So each one with aria-modal takes `ref` from here: when it opens, the
// focus goes into it (to the dialog itself, unless a field in it has
// autoFocus); Tab and Shift+Tab go round inside it; and when it closes,
// the focus goes back to what had it before. With one sheet over another,
// only the top one keeps the focus. src/test/dialogsTakeFocus.test.ts
// fails on an aria-modal dialog that doesn't use this.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** What Tab can reach inside `root`, in order. Only what's shown: a
 *  control CSS hides (a phone's sheet has buttons only a computer shows)
 *  can't take the focus, so counting it as the first or last left the
 *  focus nowhere to go round to, and Shift+Tab walked out of the sheet
 *  (e2e/focus-and-announcements.spec.ts, on a phone). jsdom has no
 *  checkVisibility, and no layout to ask, so there everything counts. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[inert], [hidden], [aria-hidden="true"]') && (typeof el.checkVisibility !== 'function' || el.checkVisibility({ visibilityProperty: true })),
  )
}

// The last few elements that had the focus. A field with autoFocus takes
// it while the dialog mounts, before any effect of the dialog's runs, so
// what had it before is read from here.
const recent: HTMLElement[] = []
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (e) => {
      if (!(e.target instanceof HTMLElement)) return
      recent.push(e.target)
      if (recent.length > 8) recent.shift()
    },
    true,
  )
}

/** The open dialogs, the top one last: only it keeps the focus. */
const open: HTMLElement[] = []

/** For a modal dialog: the ref to put on the element with aria-modal, or
 *  `given`, one it already has. `active` false for one mounted but closed. */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(active = true, given?: RefObject<T | null>): RefObject<T | null> {
  const own = useRef<T>(null)
  const ref = given ?? own
  useEffect(() => {
    const dialog = ref.current
    if (!active || !dialog) return
    // A picture of a dialog isn't one to use: the form editor's preview
    // draws the form, a dialog, in a frame of its own under `inert`. It took
    // the focus whenever that frame finished loading, out of the field the
    // admin was typing in (FormsManager.test.tsx lost the rest of a word, 2
    // runs in 5). So one in another document, or under inert, takes none.
    if (dialog.ownerDocument !== document || dialog.closest('[inert]')) return
    const at = document.activeElement
    const before = [...(at instanceof HTMLElement ? [at] : []), ...[...recent].reverse()].find((el) => el !== document.body && !dialog.contains(el)) ?? null
    open.push(dialog)
    if (!dialog.contains(document.activeElement)) {
      if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1')
      dialog.focus({ preventScroll: true })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || open.at(-1) !== dialog) return
      const list = focusables(dialog)
      const now = document.activeElement
      if (!list.length) {
        e.preventDefault()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && (now === first || now === dialog || !dialog.contains(now))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (now === last || !dialog.contains(now))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = open.lastIndexOf(dialog)
      if (i >= 0) open.splice(i, 1)
      // Back to what had it, unless the focus has gone somewhere else of
      // its own (a link in the dialog went to another page).
      const now = document.activeElement
      const lost = !now || now === document.body || dialog.contains(now)
      if (lost && before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [active, ref])
  return ref
}
