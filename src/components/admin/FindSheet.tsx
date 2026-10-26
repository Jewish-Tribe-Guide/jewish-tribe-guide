'use client'

import { useCallback, useState, type FormEvent } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { useIsMobile } from '@/lib/useIsMobile'
import type { GooglePlace } from '@/lib/googleJob'
import ActionDialog from '@/components/resources/ActionDialog'
import MobileSheet from '@/components/resources/MobileSheet'
import { BUTTON, LINK } from './JobBoxes'

export type Post = (body: Record<string, unknown>) => Promise<{ place?: GooglePlace; found?: Found[] }>
type Found = { placeId: string; name: string; address: string }

/** Find it on Google: what Google finds, searched again on a different
 *  name, and This one beside each. */
export function FindSheet({ place: p, post, onPicked, onClose }: { place: GooglePlace; post: Post; onPicked: (p: GooglePlace) => void; onClose: () => void }) {
  const isMobile = useIsMobile()
  const [query, setQuery] = useState(p.name)
  const [found, setFound] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const search = useCallback(
    async (q?: string) => {
      setBusy(true)
      setError(null)
      try {
        setFound((await post({ action: 'find', id: p.id, ...(q ? { query: q } : {}) })).found ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google didn’t answer.')
      } finally {
        setBusy(false)
      }
    },
    [post, p.id],
  )
  useLoadOnMount(useCallback(() => search(), [search]))
  async function pick(placeId: string) {
    setBusy(true)
    setError(null)
    try {
      const got = await post({ action: 'pick', id: p.id, placeId })
      if (got.place) onPicked(got.place)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that one.')
      setBusy(false)
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) void search(query.trim())
  }
  const body = (
    <div className="grid gap-3 px-4 pb-4">
      <p className="text-[13px] text-slate-500">{[p.name, p.address?.split(',')[0]].filter(Boolean).join(' · ')}</p>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search Google for" className="h-9 min-w-0 flex-[1_1_12rem] rounded-md border border-slate-300 px-2.5 text-sm" />
        <button type="submit" disabled={busy} className={BUTTON}>
          Search
        </button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {busy && !found && <p className="text-sm text-slate-500">Asking Google…</p>}
      {found && !found.length && <p className="text-sm text-slate-500">Google found nothing by that name.</p>}
      {found && found.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200" aria-label="Found on Google">
          {found.map((f) => (
            <li key={f.placeId} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                {f.name}
                <span className="block text-[12.5px] font-normal text-slate-500">{f.address}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => void pick(f.placeId)} className={LINK}>
                This one
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return isMobile ? (
    <MobileSheet isOpen onClose={onClose} title="Find it on Google">
      {body}
    </MobileSheet>
  ) : (
    <ActionDialog isOpen onClose={onClose} title="Find it on Google">
      {body}
    </ActionDialog>
  )
}
