'use client'

import type { ReactNode, Ref } from 'react'
import { CheckIcon, ChevronRightIcon, PlusIcon } from '@/components/icons'
import { SUBMIT_PILL } from './submitPill'

// ── The editor's look, shared (Oct 13) ──────────────────────────────────────
// What "Suggest an edit" looks like (agreed Oct 11, canvas pages "editor"
// and "editorlook"): the listing's boxes as white cards on the page's gray,
// each its heading, what it says now and a ›; a short one opens where it
// is with Done under it; boxes it doesn't have yet are + lines under "Not
// on the listing yet"; Send counts the changes; then Sent. ListingEditor
// and the eruv's editor (EruvEditor) both draw it from here, so they can't
// drift apart.

export const editorInputClass = 'h-11.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15.5px] text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none'
export const editorFieldLabel = 'mb-1.5 block text-[14px] font-bold text-slate-700'

export function ChangedTag() {
  return <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[12.5px] font-extrabold text-amber-800">Changed</span>
}

/** A row, closed: its heading, what it says now, and a ›. */
export function EditorRowCard({
  title,
  summary,
  changed = false,
  tags,
  leading,
  onOpen,
  testId,
  opens,
}: {
  title: ReactNode
  summary?: ReactNode
  changed?: boolean
  /** Changed, Needed: after the text. */
  tags?: ReactNode
  /** The listing's picture, on its name row. */
  leading?: ReactNode
  onOpen: () => void
  testId: string
  /** Where it opens, for tests; nothing on screen says (the user, Oct 11). */
  opens: 'here' | 'screen'
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={testId}
      data-opens={opens}
      className={`flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-left ${changed ? 'border-amber-200 bg-yellow-50' : 'border-slate-200 bg-white'}`}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-extrabold text-slate-900">{title}</span>
        {summary && <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-muted">{summary}</span>}
      </span>
      {tags}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  )
}

/** A short row, open where it is: its fields inside its card, Done under
 *  them. Its heading closes it too. */
export function EditorOpenCard({ title, tags, onClose, children, cardRef, testId }: { title: ReactNode; tags?: ReactNode; onClose: () => void; children: ReactNode; cardRef?: Ref<HTMLDivElement>; testId: string }) {
  return (
    <div ref={cardRef} data-testid={testId} className="scroll-my-4 space-y-4 rounded-2xl border-[1.5px] border-slate-400 bg-white px-4 pt-2.5 pb-4 shadow-sm">
      <button type="button" onClick={onClose} aria-expanded="true" className="flex min-h-11 w-full cursor-pointer items-center gap-3 text-left">
        <span className="min-w-0 flex-1 text-[16px] font-extrabold text-slate-900">{title}</span>
        {tags}
        <ChevronRightIcon className="h-4 w-4 shrink-0 -rotate-90 text-slate-500" />
      </button>
      {children}
      <button type="button" onClick={onClose} className="h-11 w-full cursor-pointer rounded-full border border-slate-300 bg-white text-[15px] font-bold text-primary">
        Done
      </button>
    </div>
  )
}

/** "Not on the listing yet": its heading, over its + lines. Plain lines on
 *  the gray, so they don't read as boxes the listing has. */
export function EditorEmptyRows({ children }: { children: ReactNode }) {
  return (
    <div data-testid="editor-empty">
      <p className="pb-1 text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-muted">Not on the listing yet</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  )
}

/** A box the listing doesn't have yet, to add. */
export function EditorAddLine({ title, onOpen, testId, opens }: { title: ReactNode; onOpen: () => void; testId: string; opens: 'here' | 'screen' }) {
  return (
    <button type="button" onClick={onOpen} data-testid={testId} data-opens={opens} className="flex min-h-11 w-full cursor-pointer items-center gap-2 text-left text-[15px] font-bold text-primary">
      <PlusIcon className="h-4 w-4 shrink-0" />
      {title}
    </button>
  )
}

/** After Send. */
export function EditorSent({ message, onDone }: { message: string; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-8 text-center" role="status" data-testid="editor-sent">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
        <CheckIcon className="h-8 w-8 text-emerald-700" />
      </span>
      <p className="text-[22px] font-extrabold text-ink">Sent</p>
      <p className="text-[15.5px] text-slate-700">{message}</p>
      <button type="button" onClick={onDone} className={`${SUBMIT_PILL} mt-6`}>
        Done
      </button>
    </div>
  )
}

/** "Send 2 changes", "No changes yet". */
export function sendChangesLabel(count: number, sending: boolean, verifying = false): string {
  return sending ? 'Sending…' : count === 0 ? 'No changes yet' : verifying ? 'Verifying…' : `Send ${count} change${count === 1 ? '' : 's'}`
}
