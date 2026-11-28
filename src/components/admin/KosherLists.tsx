'use client'

import { useState } from 'react'
import type { NightKindView } from '@/lib/nightKinds'
import SwipeRow, { SwipeRowGroup } from '@/components/SwipeRow'
import { PlusIcon } from '@/components/icons'
import { AdminGroup, adminInputClass } from './AdminUI'
import IconAction from './IconAction'
import { useAdminApi } from './useAdminApi'

// ── Kosher certification's lists (boards L2e, L2g, L2h, Nov 28) ─────────────
// Under From, each list the job reads: its name, its site and when it was
// last read. On a computer a pencil and a × at the row's end; on a phone a
// swipe shows the same two as circles, Edit and Remove. Edit opens its
// address under the row, and Done reads the new one at once (adding a
// list checks it). Remove asks nothing: the row says Removed, with Undo.
// No Read now: the job reads every list each night. The last row adds one.

/** "kcl.org". */
function site(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

type List = { id: string; name: string; url: string; status: string; bad: boolean }

const button = 'inline-flex items-center justify-center min-h-10 px-3.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'

function AddressField({ start, busy, error, onDone, onCancel, done }: { start: string; busy: boolean; error: string | null; onDone: (url: string) => void; onCancel: () => void; done: string }) {
  const [url, setUrl] = useState(start)
  return (
    <form
      className="flex flex-col gap-2 px-4 pb-3"
      onSubmit={(e) => {
        e.preventDefault()
        onDone(url.trim())
      }}
    >
      <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Its address" placeholder="the agency’s list of places" className={adminInputClass} data-testid="kosher-list-field" />
      {error && <p className="m-0 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !url.trim()} className={`${button} border border-primary bg-primary text-white`}>
          {busy ? 'Reading…' : done}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={`${button} border border-slate-300 bg-white text-slate-900`}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function KosherLists({ views, token, onChanged }: { views: readonly NightKindView[]; token: string; onChanged: () => Promise<void> }) {
  const api = useAdminApi(token)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Removed here, kept for Undo until the page is left. */
  const [removed, setRemoved] = useState<List[]>([])
  const tracked = views.find((v) => v.id === 'kosher')?.tracked ?? []
  const lists: List[] = tracked.flatMap((t) => (t.watch ? [{ id: t.watch.id, name: t.name, url: t.watch.url, status: t.status, bad: t.bad }] : []))
  const gone = new Set(removed.map((r) => r.url))
  const rows = [...lists.filter((l) => !gone.has(l.url)), ...removed].sort((a, b) => a.name.localeCompare(b.name))

  async function run(what: () => Promise<void>, failed: string) {
    setBusy(true)
    setError(null)
    try {
      await what()
      setOpen(null)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : failed)
    } finally {
      setBusy(false)
    }
  }
  const add = async (url: string) => {
    await api.post('/api/admin/watches', { action: 'add', url, purpose: 'kosher' }, 'Could not read that list.')
  }
  const remove = (l: List) =>
    run(async () => {
      await api.post('/api/admin/watches', { action: 'remove', id: l.id }, 'Could not remove it.')
      setRemoved((r) => [...r, l])
    }, 'Could not remove it.')
  const undo = (l: List) =>
    run(async () => {
      await add(l.url)
      setRemoved((r) => r.filter((x) => x !== l))
    }, 'Could not put it back.')
  // A new address is a new list, read at once; the old one goes.
  const edit = (l: List, url: string) =>
    url === l.url
      ? setOpen(null)
      : run(async () => {
          await add(url)
          await api.post('/api/admin/watches', { action: 'remove', id: l.id }, 'Could not remove the old address.')
        }, 'Could not read that list.')

  return (
    <AdminGroup title="From">
      <SwipeRowGroup>
        <div className="[&>*+*]:border-t [&>*+*]:border-slate-100">
        {rows.map((l) => {
          const isRemoved = removed.includes(l)
          if (isRemoved) {
            return (
              <div key={`removed-${l.url}`} className="flex min-h-[58px] items-center gap-3 px-4 py-2" data-testid="kosher-list">
                <span className="flex-1 text-[0.9375rem] text-slate-500">
                  <span className="font-semibold text-slate-700">{l.name}</span> removed
                </span>
                <button type="button" disabled={busy} onClick={() => void undo(l)} className="min-h-10 cursor-pointer text-[0.9375rem] font-semibold text-primary">
                  Undo
                </button>
              </div>
            )
          }
          const editing = open === l.id
          return (
            <div key={l.id} data-testid="kosher-list">
              <SwipeRow
                rowId={l.id}
                enabled={!editing}
                contentClassName="bg-white"
                actions={[
                  { id: 'edit', label: 'Edit', ariaLabel: `Edit ${l.name}`, active: false, onSelect: () => setOpen(l.id) },
                  { id: 'remove', label: 'Remove', ariaLabel: `Remove ${l.name}`, active: false, onSelect: () => void remove(l) },
                ]}
              >
                <div className="flex min-h-[58px] items-center gap-3 px-4 py-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[0.9375rem] font-semibold text-slate-900">{l.name}</span>
                    <span className={`text-[0.8125rem] ${l.bad ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>
                      {site(l.url)} · {l.status}
                    </span>
                  </span>
                  {!editing && (
                    <span className="hidden pointer-fine:inline-flex items-center gap-1">
                      <IconAction kind="edit" of={l.name} disabled={busy} onClick={() => setOpen(l.id)} />
                      <IconAction kind="remove" of={l.name} disabled={busy} onClick={() => void remove(l)} />
                    </span>
                  )}
                </div>
              </SwipeRow>
              {editing && <AddressField start={l.url} busy={busy} error={error} done="Done" onDone={(url) => void edit(l, url)} onCancel={() => setOpen(null)} />}
            </div>
          )
        })}
        </div>
      </SwipeRowGroup>
      {open === 'add' ? (
        <div className="pt-3">
          <AddressField start="" busy={busy} error={error} done="Add it" onDone={(url) => void run(() => add(url), 'Could not read that list.')} onCancel={() => setOpen(null)} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen('add')} className="flex min-h-[46px] w-full cursor-pointer items-center gap-2 px-4 text-left text-[0.9375rem] font-semibold text-primary hover:bg-slate-50">
          <PlusIcon className="h-4 w-4" /> Add a kosher list
        </button>
      )}
      {error && open === null && <p className="m-0 px-4 pb-3 text-sm text-red-700">{error}</p>}
    </AdminGroup>
  )
}
