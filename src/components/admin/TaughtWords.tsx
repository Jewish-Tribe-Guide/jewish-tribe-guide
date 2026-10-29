'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { shortDay } from '@/lib/todo'
import CollapsibleSection from './CollapsibleSection'

// The words the site's own search has been taught (askWords.ts), on the
// Searches page under the searches themselves: who taught each, from which
// search, and Unteach. Teaching happens on To do, from a search that found
// nothing (TodoList).

type TaughtWord = { word: string; label: string; fromQuestion: string | null; taughtBy: string; taughtAt: string }
type Loaded = { words: TaughtWord[]; wordsAvailable: boolean }

export default function TaughtWords({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/read-questions', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the taught words.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  async function unteach(word: string) {
    setError(null)
    setBusy(word)
    try {
      await fetchJson(
        withCommunity('/api/admin/read-questions', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unteach', word }) },
        'Could not save.',
      )
      setData((d) => d && { ...d, words: d.words.filter((x) => x.word !== word) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return null
  if (!data.wordsAvailable) {
    return (
      <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
        Teaching the search words isn&rsquo;t set up on this site yet.
      </p>
    )
  }

  return (
    <CollapsibleSection title="Taught words" count={data.words.length} contentClassName="">
      {data.words.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-600">None yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.words.map((w) => (
            <li key={w.word} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3" data-testid="taught-word">
              <p className="text-sm text-slate-800">
                “<span className="font-semibold">{w.word}</span>” means {w.label}
              </p>
              <p className="flex flex-wrap items-center gap-3 text-xs text-muted">
                <span>
                  {shortDay(w.taughtAt)} by {w.taughtBy}
                  {w.fromQuestion ? `, from “${w.fromQuestion}”` : ''}
                </span>
                <button type="button" disabled={busy === w.word} onClick={() => void unteach(w.word)} className="min-h-11 font-medium text-muted hover:text-slate-800 disabled:opacity-50 cursor-pointer">
                  Unteach
                </button>
              </p>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  )
}
