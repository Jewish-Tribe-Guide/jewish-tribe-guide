'use client'

import { useState } from 'react'

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months !== 1 ? 's' : ''} ago`
}

type Props = {
  resourceId: string
  confirmedAt?: string
}

// Shown in the footer of every expanded listing card. Lets visitors signal that
// the community-curated fields (kosher info, tags, hours) are still accurate —
// separate from the "via Google" synced fields which don't need this.
export default function FreshnessFooter({ resourceId, confirmedAt: initialConfirmedAt }: Props) {
  const [confirmedAt, setConfirmedAt] = useState(initialConfirmedAt)
  // What confirmedAt was right before the most recent confirm — lets a
  // misclick be undone back to the prior state instead of just cleared.
  const [previousConfirmedAt, setPreviousConfirmedAt] = useState<string | undefined>(undefined)
  const [justConfirmedNow, setJustConfirmedNow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function confirm() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/resource/${resourceId}/confirm`, { method: 'POST' })
      const json = (await res.json()) as { ok: boolean; confirmedAt?: string }
      if (json.ok && json.confirmedAt) {
        setPreviousConfirmedAt(confirmedAt)
        setConfirmedAt(json.confirmedAt)
        setJustConfirmedNow(true)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  async function undo() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/resource/${resourceId}/confirm`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previousConfirmedAt }),
      })
      const json = (await res.json()) as { ok: boolean; confirmedAt?: string | null }
      if (json.ok) {
        setConfirmedAt(json.confirmedAt ?? undefined)
        setJustConfirmedNow(false)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (justConfirmedNow) {
    return (
      <span className="text-xs text-green-600 font-medium">
        ✓ Confirmed — thanks!{' '}
        <button
          onClick={undo}
          disabled={loading}
          className="text-slate-400 hover:text-slate-600 hover:underline cursor-pointer disabled:opacity-50 font-normal"
        >
          {loading ? 'Undoing…' : 'Undo'}
        </button>
        {error && <span className="ml-1 text-red-500">Failed — try again</span>}
      </span>
    )
  }

  if (confirmedAt) {
    return (
      <span className="text-xs text-muted">
        Confirmed {timeAgo(confirmedAt)} ·{' '}
        <button
          onClick={confirm}
          disabled={loading}
          className="text-primary hover:underline cursor-pointer disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Still right?'}
        </button>
        {error && <span className="ml-1 text-red-500">Failed — try again</span>}
      </span>
    )
  }

  return (
    <span className="text-xs text-muted">
      Is this info current?{' '}
      <button
        onClick={confirm}
        disabled={loading}
        className="text-primary hover:underline cursor-pointer disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Mark as current'}
      </button>
      {error && <span className="ml-1 text-red-500">Failed — try again</span>}
    </span>
  )
}
