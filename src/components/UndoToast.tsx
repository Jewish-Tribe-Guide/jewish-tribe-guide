'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookmarkIcon } from '@/components/icons'

// The dark bar after a save or a remove: "Saved to You · Undo" (canvas page
// "you", boards YouSave and YouRemove). One at a time; a new one replaces the
// last. Tapping again to take something off is safe because of it, which is
// why nothing asks "Are you sure?".

type Toast = { id: number; text: string; saved: boolean; undo: () => void }

type UndoToastValue = {
  /** Shows `text` with Undo; `saved` fills the bookmark beside it. */
  show: (text: string, undo: () => void, saved?: boolean) => void
}

const UndoToastContext = createContext<UndoToastValue | null>(null)

/** How long the bar stays: long enough to read four words and reach Undo. */
export const UNDO_TOAST_MS = 5000

export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const nextId = useRef(0)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), UNDO_TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])

  const show = useCallback((text: string, undo: () => void, saved = true) => {
    nextId.current += 1
    setToast({ id: nextId.current, text, saved, undo })
  }, [])
  const value = useMemo(() => ({ show }), [show])

  return (
    <UndoToastContext.Provider value={value}>
      {children}
      {toast &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            data-testid="undo-toast"
            // Above the tab bar and the floating "+" on a phone (3.75rem is
            // MobileTabBar's height, as GenericDirectory's "+" clears it);
            // bottom centre on desktop, which has neither.
            className="fixed inset-x-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+5rem)] z-[70] mx-auto flex max-w-sm items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-[15px] font-semibold text-white shadow-lg desktop:bottom-6"
          >
            <BookmarkIcon filled={toast.saved} className="h-[17px] w-[17px] shrink-0" />
            <span className="min-w-0 flex-1">{toast.text}</span>
            <button
              type="button"
              onClick={() => {
                toast.undo()
                setToast(null)
              }}
              className="cursor-pointer font-bold text-blue-300 hover:underline"
            >
              Undo
            </button>
          </div>,
          document.body,
        )}
    </UndoToastContext.Provider>
  )
}

/** No provider (the admin's category preview, a unit test that doesn't
 *  care): saving still works, there's just no bar. */
export function useUndoToast(): UndoToastValue {
  return useContext(UndoToastContext) ?? NO_TOAST
}

const NO_TOAST: UndoToastValue = { show: () => {} }
