'use client'

import { useEffect, useState } from 'react'
import { getVoterToken, getMyVotedIds } from '@/lib/voteToken'

const VOTED_KEY = 'jpc_voted'
const COUNT_KEY = 'jpc_vote_counts'

// Listing pages are cached for up to an hour (see resourceStore.ts's own
// comment on listApprovedResources), and a vote deliberately does NOT force
// an immediate rebuild (see POST /api/votes's own comment on why) — so the
// very next page load can still serve the pre-vote count for as long as an
// hour. Nobody but the voter ever notices this — it's only visible to the
// one person whose own action briefly appears to have been undone.
// Remembering the count THIS browser last confirmed (straight from the vote
// response, not the cached page) and preferring it over a
// fresher-looking-but-actually-older server count fixes that, without
// touching the caching decision itself. Bounded to a short window so a vote
// cast from a different device eventually wins once the cache genuinely
// catches up, rather than this browser disagreeing with reality forever.
const REMEMBER_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours — matches cacheLife('hours')

function getVotedSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(VOTED_KEY) || '[]') as string[])
  } catch {
    return new Set()
  }
}

function rememberVote(id: string, voted: boolean) {
  const s = getVotedSet()
  if (voted) s.add(id)
  else s.delete(id)
  localStorage.setItem(VOTED_KEY, JSON.stringify([...s]))
}

function getRememberedCounts(): Record<string, { count: number; at: number }> {
  try {
    return JSON.parse(localStorage.getItem(COUNT_KEY) || '{}') as Record<string, { count: number; at: number }>
  } catch {
    return {}
  }
}

function rememberCount(id: string, count: number) {
  const all = getRememberedCounts()
  all[id] = { count, at: Date.now() }
  localStorage.setItem(COUNT_KEY, JSON.stringify(all))
}


export default function UpvoteButton({
  resourceId,
  count: initialCount,
  onCountChange,
  variant = 'box',
}: {
  resourceId: string
  count: number
  /** Notifies the parent of the latest count so it can re-sort by popularity. */
  onCountChange?: (count: number) => void
  /** 'box' — the bordered 👍/count tile. 'inline' — a minimal "👍 count" that
   *  sits in a row (used in the collapsed listing header). */
  variant?: 'box' | 'inline'
}) {
  const [count, setCount] = useState(initialCount)
  const [voted, setVoted] = useState(false) // set from localStorage after mount (hydration-safe)
  const [busy, setBusy] = useState(false)

  // Fast paint from the local cache first, then correct against the server's
  // own record below — not a useSyncExternalStore candidate: this reconciles
  // with an async server call and gets rewritten by rememberVote elsewhere,
  // not a pure read from one external source.
  useEffect(() => {
    // The local "jpc_voted" cache can drift from the server (evicted
    // independently of the vote itself, or never written back after a
    // successful vote), and the server is the only durable copy of "did this
    // browser actually vote."
    const localVoted = getVotedSet().has(resourceId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoted(localVoted)
    getMyVotedIds().then((serverIds) => {
      const serverVoted = serverIds.has(resourceId)
      if (serverVoted !== localVoted) {
        setVoted(serverVoted)
        rememberVote(resourceId, serverVoted)
      }
    })

    // Same idea for the count: prefer a recent, this-browser-confirmed count
    // over `initialCount`, which can be a cache-stale snapshot from just
    // before this browser's own last vote (see REMEMBER_WINDOW_MS's comment).
    const remembered = getRememberedCounts()[resourceId]
    if (remembered && Date.now() - remembered.at < REMEMBER_WINDOW_MS && remembered.count !== initialCount) {
      applyCount(remembered.count)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId])

  function applyCount(next: number) {
    setCount(next)
    onCountChange?.(next)
  }

  async function toggle() {
    if (busy) return
    setBusy(true)

    const prevVoted = voted
    const prevCount = count
    // Optimistic update.
    setVoted(!prevVoted)
    applyCount(prevCount + (prevVoted ? -1 : 1))

    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId, token: getVoterToken() }),
      })
      const body = await res.json()
      if (res.ok && body.ok) {
        applyCount(body.count)
        setVoted(body.voted)
        rememberVote(resourceId, body.voted)
        rememberCount(resourceId, body.count)
      } else {
        setVoted(prevVoted)
        applyCount(prevCount)
      }
    } catch {
      setVoted(prevVoted)
      applyCount(prevCount)
    } finally {
      setBusy(false)
    }
  }

  // Stop propagation so upvoting inside a tappable card header doesn't also
  // toggle the card open/closed.
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggle()
  }

  const title = voted ? 'Remove your upvote' : 'Upvote this place'

  if (variant === 'inline') {
    return (
      <button
        onClick={handleClick}
        disabled={busy}
        aria-pressed={voted}
        title={title}
        className={[
          // Negative margin + padding grows the tap area to ~32px for touch
          // without shifting the surrounding header layout. Mobile only — desktop
          // keeps the original compact hit area (sm:m-0 sm:p-0).
          'inline-flex items-center gap-1 -m-2 p-2 sm:m-0 sm:p-0 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors disabled:opacity-60',
          voted ? 'text-primary' : 'text-slate-600 hover:text-primary',
        ].join(' ')}
      >
        <span aria-hidden="true">👍</span>
        {count}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      aria-pressed={voted}
      title={title}
      className={[
        'flex flex-col items-center justify-center rounded-md border px-2.5 py-1 cursor-pointer transition-colors min-w-[2.75rem]',
        voted
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-slate-300 text-slate-500 hover:border-primary hover:text-primary',
      ].join(' ')}
    >
      <span className="text-sm leading-none" aria-hidden="true">👍</span>
      <span className="text-xs font-semibold leading-tight">{count}</span>
    </button>
  )
}
