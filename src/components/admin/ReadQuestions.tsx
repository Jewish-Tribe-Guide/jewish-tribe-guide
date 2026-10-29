'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import CollapsibleSection from './CollapsibleSection'

// ── The "Read questions" tab: what the AI reader made of what people asked ──
// Every question the site's own search found nothing for, which the AI read
// in the background into the site's own filters (see questionReader.ts,
// learnFrom), most asked first, each with its reading in words. The AI
// isn't part of the search (the user, Oct 27): a reading never answers on
// the site, so there's nothing to approve. What it's for is the words it
// suggests teaching the search itself ("ikc" means Kosher Cert: IKC, see
// askWords.ts): taught, the site's own search reads that word that way in
// every question, instantly. Forget throws a wrong reading away.

type Word = { word: string; categoryId: string; field?: string; value?: string; label: string }
type TaughtWord = Word & { fromQuestion: string | null; taughtBy: string; taughtAt: string }
type ReadQuestion = {
  key: string
  question: string
  labels: string[]
  proposals: Word[]
  hits: number
  model: string
  lastUsedAt: string
}
type Loaded = { readings: ReadQuestion[]; available: boolean; words: TaughtWord[]; wordsAvailable: boolean }

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function QuestionRow({ q, busy, onForget, onTeach }: { q: ReadQuestion; busy: boolean; onForget: () => void; onTeach: (word: Word) => void }) {
  return (
    <li className="px-4 py-3" data-testid="read-question">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-slate-900">“{q.question}”</p>
        <p className="text-xs text-muted">
          {q.hits} {q.hits === 1 ? 'time' : 'times'} · last {formatDay(q.lastUsedAt)}
        </p>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
        <span className="text-xs font-semibold text-slate-500">Read as</span>
        {q.labels.length > 0 ? (
          q.labels.map((label) => (
            <span key={label} className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary">
              {label}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted">nothing the guide has</span>
        )}
      </p>
      {q.proposals.length > 0 && (
        <ul className="mt-2 space-y-1">
          {q.proposals.map((w) => (
            <li key={w.word} className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600" data-testid="word-proposal">
              <span>
                Teach the search: “<span className="font-semibold text-slate-800">{w.word}</span>” means {w.label}
              </span>
              <button type="button" disabled={busy} onClick={() => onTeach(w)} className="font-semibold text-primary hover:underline disabled:opacity-50">
                Teach
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <button type="button" disabled={busy} onClick={onForget} className="font-medium text-muted hover:text-slate-800 disabled:opacity-50">
          Forget
        </button>
      </div>
    </li>
  )
}

export default function ReadQuestions({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/read-questions', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load read questions.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  async function forget(key: string) {
    setSaveError(null)
    setBusy(key)
    try {
      await fetchJson(
        withCommunity('/api/admin/read-questions', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ key, action: 'forget' }) },
        'Could not save.',
      )
      setData((d) => d && { ...d, readings: d.readings.filter((r) => r.key !== key) })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  async function teach(key: string, question: string, w: Word) {
    setSaveError(null)
    setBusy(key)
    try {
      await fetchJson(
        withCommunity('/api/admin/read-questions', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'teach', word: { word: w.word, categoryId: w.categoryId, field: w.field, value: w.value }, question }) },
        'Could not save.',
      )
      const taught: TaughtWord = { ...w, fromQuestion: question, taughtBy: 'you', taughtAt: new Date().toISOString() }
      setData(
        (d) =>
          d && {
            ...d,
            words: [taught, ...d.words.filter((x) => x.word !== w.word)],
            readings: d.readings.map((r) => ({ ...r, proposals: r.proposals.filter((p) => p.word !== w.word) })),
          },
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  async function unteach(word: string) {
    setSaveError(null)
    setBusy(`word:${word}`)
    try {
      await fetchJson(
        withCommunity('/api/admin/read-questions', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unteach', word }) },
        'Could not save.',
      )
      setData((d) => d && { ...d, words: d.words.filter((x) => x.word !== word) })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading read questions…</p>


  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Searches that found nothing, as the AI read them, most asked first. Nothing here reaches the site until you{' '}
        <strong>Teach</strong> a word: then the search reads it that way everywhere, so teach only what it always means.
      </p>
      {!data.available && (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
          Read questions aren&rsquo;t set up on this site yet.
        </p>
      )}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      {data.available && data.readings.length === 0 ? (
        <p className="text-sm text-slate-600">No questions read yet.</p>
      ) : (
        data.available && (
          <>
            <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
              <h3 className="px-4 pt-3 pb-1 text-sm font-semibold text-slate-800">Questions ({data.readings.length})</h3>
              <ul className="divide-y divide-slate-100">
                {data.readings.map((q) => (
                  <QuestionRow key={q.key} q={q} busy={busy === q.key} onForget={() => void forget(q.key)} onTeach={(w) => void teach(q.key, q.question, w)} />
                ))}
              </ul>
            </section>
          </>
        )
      )}
      {data.wordsAvailable ? (
        <CollapsibleSection title="Taught words" description="Words the site's own search reads as a filter, in every question." count={data.words.length} contentClassName="">
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
                      Taught {formatDay(w.taughtAt)} by {w.taughtBy}
                      {w.fromQuestion ? `, from “${w.fromQuestion}”` : ''}
                    </span>
                    <button type="button" disabled={busy === `word:${w.word}`} onClick={() => void unteach(w.word)} className="font-medium text-muted hover:text-slate-800 disabled:opacity-50">
                      Unteach
                    </button>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      ) : (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
          Teaching the search words isn&rsquo;t set up on this site yet.
        </p>
      )}
    </div>
  )
}
