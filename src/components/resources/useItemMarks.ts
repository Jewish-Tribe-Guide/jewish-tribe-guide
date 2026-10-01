'use client'

import { useMemo, useState } from 'react'
import type { DirectoryResource } from '@/types'
import { resolveCapabilities, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { itemMarks, type ItemMark } from '@/lib/itemMarks'
import { ui } from '@/lib/uiConfig'
import { TURNSTILE_ACTIVE } from './useListingSubmit'

// ── An opened listing's items, and this visitor's answers about them ────────
// Shared by the items card (tap an item) and the listing's one question
// ("Kosher steak here today?"), so an answer in either shows in both.
//
// "Still here" is instant (POST /api/resource/:id/item, no bot check, as
// Mark as current). "Not anymore" files a removal for an admin, so it needs
// the bot check: tapping it starts the check, and the answer goes once it
// passes. Either can be undone while the listing is open.

/** Which of this browser's answers an item carries, for Undo. */
type Mine =
  | { kind: 'seen'; seenAt: string; previous: string | null; clearedGone: string | null; activityId: number | null; undoable: boolean }
  | { kind: 'gone'; goneAt: string; submissionId: string | null; activityId: number | null; undoable: boolean }

export type ItemState = {
  mine: Mine | null
  busy: boolean
  error: string | null
}

/** Where the answer was given: the list's row, the listing's question,
 *  or the list's "Add an item" box. */
export type AnswerFrom = 'row' | 'question' | 'add'

/** An item this visitor added, waiting for an admin's check. Shown to them
 *  alone, in the list, until they leave. */
export type AddedItem = { name: string; sometimes: boolean; submissionId: string | null; busy: boolean; error: string | null }

/** How an "Add an item" went: filed for a check, or the store has it
 *  already (counted as its "Still here"), or it failed. */
export type AddOutcome = 'added' | 'already' | 'failed'

export type ItemMarksApi = {
  marks: ItemMark[]
  stateOf: (mark: ItemMark) => ItemState
  /** Whether "Not anymore" is offered: edits allowed for the community and
   *  this category. */
  canReport: boolean
  seen: (mark: ItemMark, from: AnswerFrom) => void
  gone: (mark: ItemMark, from: AnswerFrom) => void
  undo: (mark: ItemMark) => void
  /** Items this visitor added, waiting for a check. */
  added: AddedItem[]
  /** "+ Add an item": files it for a check, or, for an item the store
   *  already has under any name, counts as that item's "Still here". */
  add: (name: string, sometimes: boolean) => Promise<AddOutcome>
  withdraw: (added: AddedItem) => void
  /** A "Not anymore" or an "Add an item" waiting on the bot check, and
   *  where it was tapped, so that place shows the check. */
  challenge: { from: AnswerFrom; attempt: number; onVerify: (token: string) => void } | null
}

const id = (m: Pick<ItemMark, 'key' | 'name'>) => `${m.key}:${m.name.toLowerCase()}`
const FAILED = 'That didn’t send. Please try again.'

export function useItemMarks(item: DirectoryResource, category: CategoryConfig, field: CategoryField | null): ItemMarksApi {
  // Dates as this visitor's answers left them, over the listing's own.
  const [dated, setDated] = useState<Record<string, { seenAt: string | null; goneAt: string | null }>>({})
  const [states, setStates] = useState<Record<string, ItemState>>({})
  const [pending, setPending] = useState<
    | { kind: 'gone'; mark: ItemMark; from: AnswerFrom; attempt: number }
    | { kind: 'add'; name: string; sometimes: boolean; from: AnswerFrom; attempt: number; settle: (o: AddOutcome) => void }
    | null
  >(null)
  const [added, setAdded] = useState<AddedItem[]>([])

  const marks = useMemo(
    () => (field ? itemMarks(item, field).map((m) => ({ ...m, ...dated[id(m)] })) : []),
    [item, field, dated],
  )
  const canReport = ui.contributions.edit && resolveCapabilities(category.capabilities).edit

  const patch = (m: ItemMark, s: Partial<ItemState>) =>
    setStates((prev) => ({ ...prev, [id(m)]: { ...(prev[id(m)] ?? { mine: null, busy: false, error: null }), ...s } }))
  const date = (m: ItemMark, d: Partial<{ seenAt: string | null; goneAt: string | null }>) =>
    setDated((prev) => ({ ...prev, [id(m)]: { ...(prev[id(m)] ?? { seenAt: m.seenAt, goneAt: m.goneAt }), ...d } }))

  async function call(url: string, method: string, body: unknown): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      return res.ok && json.ok ? json : null
    } catch {
      return null
    }
  }

  async function seen(m: ItemMark) {
    patch(m, { busy: true, error: null })
    const json = await call(`/api/resource/${item.id}/item`, 'POST', { field: m.key, item: m.name })
    if (!json || typeof json.seenAt !== 'string') return patch(m, { busy: false, error: FAILED })
    const seenAt = json.seenAt
    date(m, { seenAt, goneAt: json.changed ? null : m.goneAt })
    patch(m, {
      busy: false,
      mine: {
        kind: 'seen',
        seenAt,
        previous: typeof json.previous === 'string' ? json.previous : null,
        clearedGone: typeof json.clearedGone === 'string' ? json.clearedGone : null,
        activityId: typeof json.activityId === 'number' ? json.activityId : null,
        // Inside the cooldown nothing changed, so there's nothing to undo.
        undoable: json.changed !== false,
      },
    })
  }

  async function sendGone(m: ItemMark, token: string) {
    const json = await call(`/api/resource/${item.id}/item/gone`, 'POST', { field: m.key, item: m.name, turnstileToken: token, company: '' })
    if (!json || typeof json.goneAt !== 'string') return patch(m, { busy: false, error: FAILED })
    date(m, { goneAt: json.goneAt })
    patch(m, {
      busy: false,
      mine: {
        kind: 'gone',
        goneAt: json.goneAt,
        submissionId: typeof json.submissionId === 'string' ? json.submissionId : null,
        activityId: typeof json.activityId === 'number' ? json.activityId : null,
        // Someone said so already: it's with an admin, not this visitor's.
        undoable: json.changed === true,
      },
    })
  }

  // "Not anymore" goes once the bot check has a token; at once, where
  // there's no check configured. Each tap gets its own check: a token is
  // single-use.
  function gone(m: ItemMark, from: AnswerFrom) {
    patch(m, { busy: true, error: null })
    if (!TURNSTILE_ACTIVE) return void sendGone(m, '')
    setPending((prev) => ({ kind: 'gone', mark: m, from, attempt: (prev?.attempt ?? 0) + 1 }))
  }
  function verified(token: string) {
    if (!pending) return
    setPending(null)
    if (pending.kind === 'gone') void sendGone(pending.mark, token)
    else void sendAdd(pending.name, pending.sometimes, token).then(pending.settle)
  }

  async function sendAdd(name: string, sometimes: boolean, token: string): Promise<AddOutcome> {
    const json = await call(`/api/resource/${item.id}/item/add`, 'POST', { item: name, sometimes, turnstileToken: token, company: '' })
    if (!json) return 'failed'
    const already = json.already as { item?: unknown; field?: unknown } | undefined
    if (already && typeof already.item === 'string') {
      const m = marks.find((x) => x.name === already.item && x.key === already.field)
      if (m) void seen(m)
      return 'already'
    }
    const named = typeof json.item === 'string' ? json.item : name
    const submissionId = typeof json.submissionId === 'string' ? json.submissionId : null
    setAdded((prev) => [...prev.filter((a) => a.name.toLowerCase() !== named.toLowerCase()), { name: named, sometimes, submissionId, busy: false, error: null }])
    return 'added'
  }

  /** Each Add gets its own bot check, as each "Not anymore" does. */
  function add(name: string, sometimes: boolean): Promise<AddOutcome> {
    if (!TURNSTILE_ACTIVE) return sendAdd(name, sometimes, '')
    return new Promise((settle) => setPending((prev) => ({ kind: 'add', name, sometimes, from: 'add', attempt: (prev?.attempt ?? 0) + 1, settle })))
  }

  async function withdraw(a: AddedItem) {
    if (!a.submissionId) return
    const set = (s: Partial<AddedItem>) => setAdded((prev) => prev.map((x) => (x === a || x.name === a.name ? { ...x, ...s } : x)))
    set({ busy: true, error: null })
    const json = await call(`/api/resource/${item.id}/item/add`, 'DELETE', { submissionId: a.submissionId })
    if (!json) return set({ busy: false, error: 'Couldn’t undo that. Please try again.' })
    setAdded((prev) => prev.filter((x) => x.name !== a.name))
  }

  async function undo(m: ItemMark) {
    const mine = states[id(m)]?.mine
    if (!mine?.undoable) return
    patch(m, { busy: true, error: null })
    if (mine.kind === 'seen') {
      const json = await call(`/api/resource/${item.id}/item`, 'DELETE', {
        field: m.key,
        item: m.name,
        seenAt: mine.seenAt,
        previous: mine.previous,
        clearedGone: mine.clearedGone,
        activityId: mine.activityId,
      })
      if (!json) return patch(m, { busy: false, error: 'Couldn’t undo that. Please try again.' })
      date(m, { seenAt: mine.previous, goneAt: mine.clearedGone ?? m.goneAt })
    } else {
      const json = await call(`/api/resource/${item.id}/item/gone`, 'DELETE', {
        field: m.key,
        item: m.name,
        goneAt: mine.goneAt,
        submissionId: mine.submissionId,
        activityId: mine.activityId,
      })
      if (!json) return patch(m, { busy: false, error: 'Couldn’t undo that. Please try again.' })
      if (json.changed) date(m, { goneAt: null })
    }
    patch(m, { busy: false, mine: null })
  }

  return {
    marks,
    stateOf: (m) => states[id(m)] ?? { mine: null, busy: false, error: null },
    canReport,
    seen: (m) => void seen(m),
    gone,
    undo: (m) => void undo(m),
    added,
    add,
    withdraw: (a) => void withdraw(a),
    challenge: pending ? { from: pending.from, attempt: pending.attempt, onVerify: verified } : null,
  }
}
