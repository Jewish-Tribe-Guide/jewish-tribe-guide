'use client'

import { useEffect, useState } from 'react'
import { getVoterToken, getMyVotedIds, noteMyVote } from '@/lib/voteToken'
import { usePreviewSend, useFetchOrPreview } from '@/lib/previewSend'
import { ThumbIcon } from '@/components/icons'
import { storageSet } from '@/lib/safeStorage'

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
  storageSet(VOTED_KEY, JSON.stringify([...s]))
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
  storageSet(COUNT_KEY, JSON.stringify(all))
}


export default function UpvoteButton({
  resourceId,
  count: initialCount,
  onCountChange,
  name,
}: {
  resourceId: string
  count: number
  /** Notifies the parent of the latest count so it can re-sort by popularity. */
  onCountChange?: (count: number) => void
  /** The listing's name, for a screen reader: "Upvote Judah". */
  name?: string
}) {
  const [count, setCount] = useState(initialCount)
  const [voted, setVoted] = useState(false) // set from localStorage after mount (hydration-safe)
  const [busy, setBusy] = useState(false)
  const fetchOrPreview = useFetchOrPreview()
  // The admin console's preview: its vote isn't kept as this browser's.
  const preview = usePreviewSend()

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
      const res = await fetchOrPreview(
        '/api/votes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceId, token: getVoterToken() }),
        },
        { count: prevCount + (prevVoted ? -1 : 1), voted: !prevVoted },
      )
      const body = await res.json()
      if (res.ok && body.ok) {
        applyCount(body.count)
        setVoted(body.voted)
        if (!preview) {
          rememberVote(resourceId, body.voted)
          rememberCount(resourceId, body.count)
          noteMyVote(resourceId, body.voted)
        }
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

  // The small outline thumbs-up beside an opened listing's name, with the
  // count only once there is one. Its one look: a bordered 👍 tile and an
  // inline "👍 5" chip were left from the old listing cards, used by no
  // screen (Nov 18, review item 43).
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-pressed={voted}
      aria-label={`Upvote${name ? ` ${name}` : ''}${count > 0 ? `, ${count} upvote${count === 1 ? '' : 's'}` : ''}`}
      title={title}
      className={[
        'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border text-sm font-bold transition-colors cursor-pointer disabled:opacity-60',
        count > 0 ? 'px-3' : 'w-9',
        voted ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400',
      ].join(' ')}
    >
      <ThumbIcon className="h-4 w-4" />
      {count > 0 && <span aria-hidden="true">{count}</span>}
    </button>
  )
}
