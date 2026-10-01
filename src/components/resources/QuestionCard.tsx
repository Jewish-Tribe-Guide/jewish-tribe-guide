'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { answerSubmission, pickListingQuestion, pickQuestion, type PickedQuestion } from '@/lib/questionCards'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { usePersistedState } from '@/lib/usePersistedState'
import TurnstileWidget from '@/components/TurnstileWidget'
import type { CategoryField } from '@/lib/categories'
import { itemPhrase, itemWording, lastSeenText, pickItemToAsk, type ItemMark } from '@/lib/itemMarks'
import { useNow } from '@/lib/useNow'
import { community as communityConfig } from '@/community.config'
import { TURNSTILE_ACTIVE } from './useListingSubmit'
import type { ItemMarksApi } from './useItemMarks'

// ── One question card in a category page's list ─────────────────────────────
// See questionCards.ts for what's asked, of which place, and in what words.
// This is the card: one tap answers, "Not sure" moves on, and a thank-you
// replaces the question until "Next question".
//
// An answer is an edit suggestion (POST /api/submissions, as the Edit form
// sends), so it needs the bot check. Browsing never loads it: the check
// starts on the first tap, and the answer goes as soon as it passes.
// "Yes, still right" is the listing's own Mark as current, which has no
// bot check (see /api/resource/[id]/confirm).

type Props = {
  category: CategoryConfig
  /** The list as shown, in its order. */
  shown?: readonly DirectoryResource[]
  /** Every listing in the category. */
  all?: readonly DirectoryResource[]
  /** Where a place is, as its row says it ("Rittenhouse"). */
  place?: (item: DirectoryResource) => string | null
  /** "Something changed": the listing's own Edit. */
  onEdit?: (item: DirectoryResource) => void
  /** An opened listing's one question, about that listing alone
   *  (pickListingQuestion), in place of the list's. */
  listing?: DirectoryResource
  /** The opened listing's items, when they're its main thing: with nothing
   *  else to ask, it asks about one ("Kosher steak here today?"). */
  items?: { field: CategoryField; api: ItemMarksApi }
}

type Phase =
  | { kind: 'asking' }
  | { kind: 'sending'; value: string | boolean }
  | { kind: 'thanks'; text: string }
  | { kind: 'failed'; text: string }

export default function QuestionCard({ category, shown = [], all = [], place = () => null, onEdit, listing, items }: Props) {
  const community = useCommunitySlug()
  // The places this browser has been asked about, so the card moves on.
  const askedKey = `jpc:asked:${community}:${category.id}`
  const [asked, setAsked] = usePersistedState<string[]>(
    [],
    () => {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(askedKey) ?? '[]')
        return Array.isArray(stored) ? stored.filter((v): v is string => typeof v === 'string') : []
      } catch {
        return []
      }
    },
    useCallback(
      (ids: string[]) => {
        try {
          localStorage.setItem(askedKey, JSON.stringify(ids))
        } catch {
          // Private windows: it just asks again next visit.
        }
      },
      [askedKey],
    ),
  )
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' })
  // Held while a thank-you or an error shows, so the card keeps talking
  // about the place just answered rather than jumping to the next one.
  const [held, setHeld] = useState<PickedQuestion | null>(null)
  const [token, setToken] = useState('')
  // Each answer gets its own bot check: a token is single-use, so a retry
  // after a failure mounts a fresh one (the key below).
  const [attempt, setAttempt] = useState(0)

  const picked = listing ? pickListingQuestion(category, listing, new Set(asked)) : pickQuestion(category, shown, all, new Set(asked), place)
  const titleId = useId()
  const q = held ?? picked

  const markAsked = (id: string) => setAsked((prev) => (prev.includes(id) ? prev : [...prev, id]))
  const next = () => {
    setHeld(null)
    setPhase({ kind: 'asking' })
  }

  // The answer goes once the bot check has a token (at once, where there's
  // no check configured).
  const sending = phase.kind === 'sending' ? phase : null
  useEffect(() => {
    if (!sending || !held || held.kind !== 'field') return
    if (TURNSTILE_ACTIVE && !token) return
    let cancelled = false
    const payload = answerSubmission(category, held.item, held.field, sending.value)
    fetch(withCommunity('/api/submissions', community), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'update',
        targetType: 'listing',
        targetId: held.item.id,
        payload,
        note: listing ? `Answered the question on the listing itself: ${held.field.label}` : `Answered the ${category.pluralLabel} page’s question card: ${held.field.label}`,
        company: '',
        turnstileToken: token,
      }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; errors?: string[] }
        if (cancelled) return
        if (res.ok && body.ok) {
          markAsked(held.item.id)
          setPhase({ kind: 'thanks', text: 'Thanks! An admin will check it before it shows.' })
        } else {
          setPhase({ kind: 'failed', text: body.errors?.[0] ?? 'That didn’t send. Please try again.' })
        }
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: 'failed', text: 'That didn’t send. Please check your connection and try again.' })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sends once per answer, when the token arrives
  }, [sending, token])

  if (!q) {
    return listing && items ? (
      <ItemQuestion listingId={listing.id} asked={asked.includes(listing.id)} markAsked={() => markAsked(listing.id)} field={items.field} api={items.api} />
    ) : null
  }

  const answer = (value: string | boolean) => {
    setHeld(q)
    setToken('')
    setAttempt((n) => n + 1)
    setPhase({ kind: 'sending', value })
  }
  const notSure = () => {
    markAsked(q.item.id)
    next()
  }
  const confirm = async () => {
    setHeld(q)
    setPhase({ kind: 'sending', value: true })
    try {
      const res = await fetch(`/api/resource/${q.item.id}/confirm`, { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (res.ok && body.ok) {
        markAsked(q.item.id)
        setPhase({ kind: 'thanks', text: 'Thanks! It’s marked as current.' })
      } else {
        setPhase({ kind: 'failed', text: body.error ?? 'That didn’t send. Please try again.' })
      }
    } catch {
      setPhase({ kind: 'failed', text: 'That didn’t send. Please check your connection and try again.' })
    }
  }
  const changed = () => {
    markAsked(q.item.id)
    next()
    onEdit?.(q.item)
  }

  const busy = phase.kind === 'sending'
  const button = 'h-9 cursor-pointer rounded-full border border-slate-300 bg-white px-3.5 text-[14px] font-semibold text-ink transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-60'

  return (
    <section aria-labelledby={titleId} data-testid={listing ? 'listing-question' : 'question-card'} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
      <h2 id={titleId} className="text-xs font-bold uppercase tracking-[0.06em] text-slate-500">
        {q.kind === 'field' ? 'Quick question' : 'Been there lately?'}
      </h2>
      <p className="mt-1 text-[15.5px] font-semibold text-ink">{q.question}</p>

      {phase.kind === 'thanks' ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1" role="status">
          <span className="text-[14px] text-green-700">{phase.text}</span>
          {picked && !listing && (
            <button type="button" onClick={next} className="cursor-pointer text-[14px] font-bold text-primary hover:underline">
              Next question
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {q.kind === 'field' ? (
              <>
                {q.answers.map((a) => (
                  <button key={String(a.value)} type="button" disabled={busy} onClick={() => answer(a.value)} className={button}>
                    {a.label}
                  </button>
                ))}
                <button type="button" disabled={busy} onClick={notSure} className={`${button} border-transparent bg-transparent text-slate-600`}>
                  Not sure
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={confirm} className={button}>
                  Yes, still right
                </button>
                <button type="button" disabled={busy} onClick={changed} className={button}>
                  Something changed
                </button>
              </>
            )}
          </div>
          {phase.kind === 'failed' && (
            <p role="alert" className="mt-2 text-[13.5px] text-red-700">
              {phase.text}
            </p>
          )}
          <p className="mt-2 text-[13px] text-slate-500">{busy ? 'Sending…' : q.footnote}</p>
        </>
      )}
      {/* The bot check, only once an answer has been tapped. */}
      {phase.kind === 'sending' && q.kind === 'field' && <TurnstileWidget key={attempt} onVerify={setToken} />}
    </section>
  )
}

// ── An opened listing's question about one of its items (agreed Oct 1) ──────
// Asked when the listing has nothing else to ask: an item that's only
// sometimes there first, then the one gone longest unseen (pickItemToAsk).
// "Yes" is the item's Still here and "No" its Not anymore, the same answers
// the items card gives, so an answer here shows there too.

function ItemQuestion({
  listingId,
  asked,
  markAsked,
  field,
  api,
}: {
  listingId: string
  asked: boolean
  markAsked: () => void
  field: CategoryField
  api: ItemMarksApi
}) {
  const clock = useNow()
  const titleId = useId()
  // The item answered here stays the question while its thanks shows,
  // rather than the card moving on to the next.
  const [held, setHeld] = useState<string | null>(null)
  const heldMark = held ? (api.marks.find((m) => `${m.key}:${m.name}` === held) ?? null) : null
  // Picked once the page knows the time, so the server and browser agree.
  const mark: ItemMark | null = heldMark ?? (asked || clock === null ? null : pickItemToAsk(api.marks, clock))
  if (!mark) return null
  const { mine, busy, error } = api.stateOf(mark)
  const phrase = itemPhrase(field, mark.name)
  const say = itemWording(field)
  const answer = (yes: boolean) => {
    setHeld(`${mark.key}:${mark.name}`)
    markAsked()
    if (yes) api.seen(mark, 'question')
    else api.gone(mark, 'question')
  }
  const notSure = () => markAsked()
  const button = 'h-9 cursor-pointer rounded-full border border-slate-300 bg-white px-3.5 text-[14px] font-semibold text-ink transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-60'
  const footnote = mark.sometimes ? `Listed as ${say.sometimes}.` : lastSeenText(mark, clock, communityConfig.timezone)

  return (
    <section aria-labelledby={titleId} data-testid="listing-question" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
      <h2 id={titleId} className="text-xs font-bold uppercase tracking-[0.06em] text-slate-500">
        Quick question
      </h2>
      <p className="mt-1 text-[15.5px] font-semibold text-ink">{say.question(phrase)}</p>
      {mine ? (
        <p className="mt-2.5 text-[14px] text-green-700" role="status">
          {mine.kind === 'seen' ? 'Thanks! Marked as seen today.' : mine.undoable ? 'Thanks. We’ll check before taking it off.' : 'Someone said so already. We’ll check before taking it off.'}
          {mine.undoable && (
            <button type="button" disabled={busy} onClick={() => api.undo(mark)} className="ml-2 cursor-pointer font-bold text-primary hover:underline disabled:opacity-50">
              {busy ? 'Undoing…' : 'Undo'}
            </button>
          )}
        </p>
      ) : (
        <>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => answer(true)} className={button}>
              Yes
            </button>
            {api.canReport && (
              <button type="button" disabled={busy} onClick={() => answer(false)} className={button}>
                No
              </button>
            )}
            <button type="button" disabled={busy} onClick={notSure} className={`${button} border-transparent bg-transparent text-slate-600`}>
              Not sure
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[13.5px] text-red-700">
              {error}
            </p>
          )}
          <p className="mt-2 text-[13px] text-slate-500">{busy ? 'Sending…' : footnote}</p>
        </>
      )}
      {api.challenge?.from === 'question' && busy && <TurnstileWidget key={`${listingId}:${api.challenge.attempt}`} onVerify={api.challenge.onVerify} />}
    </section>
  )
}
