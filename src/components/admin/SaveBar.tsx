'use client'

import { useEffect } from 'react'

// One way to save (the admin redesign's brief, rule 4): a bar along the
// bottom that appears once something changed, saying how much, with Undo
// and Save. Leaving with changes asks first (useLeaveGuard below).

/** "1 change", "3 changes". */
export function changesLabel(n: number): string {
  return `${n} ${n === 1 ? 'change' : 'changes'}`
}

export default function SaveBar({
  changes,
  saving = false,
  saved = false,
  error,
  onUndo,
  onSave,
  undoLabel = 'Undo',
  saveLabel = 'Save',
  status,
}: {
  /** How many things changed; the bar shows only while this is above 0,
   *  or just after a save. */
  changes: number
  saving?: boolean
  /** Just saved: the bar says so until the next change. */
  saved?: boolean
  error?: string | null
  onUndo: () => void
  onSave: () => void
  undoLabel?: string
  saveLabel?: string
  /** What the bar says instead of "N changes". */
  status?: string
}) {
  if (changes === 0 && !saved && !error) return null
  return (
    <div
      role="region"
      aria-label="Save"
      className="sticky bottom-[var(--admin-tabs,0px)] z-20 -mx-4 md:-mx-10 mt-2 flex flex-wrap items-center gap-3 bg-white border-t border-slate-200 px-4 md:px-10 py-3"
    >
      <p role="status" className="flex-1 m-0 text-[15px] font-semibold text-slate-900">
        {error ? <span className="text-red-700">{error}</span> : changes > 0 ? (status ?? changesLabel(changes)) : 'Saved.'}
      </p>
      {changes > 0 && (
        <>
          <button
            type="button"
            onClick={onUndo}
            disabled={saving}
            className="min-h-11 px-4 rounded-lg border border-slate-300 bg-white text-[15px] font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
          >
            {undoLabel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-h-11 px-5 rounded-lg bg-primary text-white text-[15px] font-semibold hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
        </>
      )}
    </div>
  )
}

export const LEAVE_QUESTION = 'Leave without saving? Your changes will be lost.'

/** While `dirty`, leaving asks first: closing or reloading the tab (the
 *  browser's own question), and following a link out of the screen (ours).
 *  `stays(path)` names links that keep the changes, such as another tab
 *  sharing the same draft. */
export function useLeaveGuard(dirty: boolean, stays?: (path: string) => boolean) {
  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank') return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname || stays?.(url.pathname)) return
      if (!window.confirm(LEAVE_QUESTION)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty, stays])
}
