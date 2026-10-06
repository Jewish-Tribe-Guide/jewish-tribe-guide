'use client'

import { useState } from 'react'
import { useNow } from '@/lib/useNow'
import { isStale } from '@/lib/listingView'
import { shortDate } from './listingParts'


type Props = {
  resourceId: string
  confirmedAt?: string
  /** Said first: "Phone and website from Google, Sep 30". */
  lead?: string
  /** What's confirmed, where it isn't the whole listing: "Times". */
  subject?: string
  /** False for what hardly changes: just when it was last checked, with no
   *  "Still right?" and no button ("Kosher details last checked Aug 20"). */
  ask?: boolean
  /** One section's own date, not the listing's: a mikvah's women's hours
   *  ("womenTevillah", Oct 6). */
  section?: string
}

// Shown at the end of every opened listing, and in a shul's times card: when
// someone last confirmed the listing, and a one-tap way to confirm it again.
/** The listing's dated line (agreed Sep 30): a quiet date while the last
 *  confirmation is recent, "Still right?" once it's ASK_AFTER_DAYS old, and
 *  a plain "not confirmed by anyone yet" with a way to confirm when nobody
 *  has. `lead` goes first: which of its details Google keeps, and when.
 *  `subject` names what's confirmed where that isn't the whole listing ("Times"
 *  in a shul's times card).
 *
 *  It used to carry a quiet "Suggest a correction" link opposite it too. It
 *  sat at the same weight as the date and read as part of it; every
 *  surface has the "Suggest an edit" bar instead (ListingEditBar). What
 *  stays is the confirmation itself: a one-tap contribution of its own, not
 *  a second door to the edit form. */
export default function FreshnessFooter(props: Props) {
  return <FreshnessStatus {...props} />
}

function FreshnessStatus({ resourceId, confirmedAt: initialConfirmedAt, lead, subject, ask = true, section }: Props) {
  const now = useNow()
  const [confirmedAt, setConfirmedAt] = useState(initialConfirmedAt)
  // What confirmedAt was right before the most recent confirm — lets a
  // misclick be undone back to the prior state instead of just cleared.
  const [previousConfirmedAt, setPreviousConfirmedAt] = useState<string | undefined>(undefined)
  const [justConfirmedNow, setJustConfirmedNow] = useState(false)
  // What the server handed back for this browser's own confirmation, sent
  // back on undo: the stamp lets the server refuse to undo if someone else
  // has confirmed since, and the activity id takes it back out of the log.
  // `undoable` is false when the tap landed inside the server's cooldown
  // (someone confirmed minutes ago): nothing changed, so there's nothing to
  // undo, and offering Undo would restore a stamp this browser never set.
  const [mine, setMine] = useState<{ confirmedAt: string; activityId: number | null; undoable: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function confirm() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(
        `/api/resource/${resourceId}/confirm`,
        section ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section }) } : { method: 'POST' },
      )
      const json = (await res.json()) as { ok: boolean; confirmedAt?: string; changed?: boolean; activityId?: number | null }
      if (json.ok && json.confirmedAt) {
        setPreviousConfirmedAt(confirmedAt)
        setConfirmedAt(json.confirmedAt)
        setMine({ confirmedAt: json.confirmedAt, activityId: json.activityId ?? null, undoable: json.changed !== false })
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
        body: JSON.stringify({ previousConfirmedAt, confirmedAt: mine?.confirmedAt, activityId: mine?.activityId, ...(section ? { section } : {}) }),
      })
      const json = (await res.json()) as { ok: boolean; confirmedAt?: string | null }
      if (json.ok) {
        setConfirmedAt(json.confirmedAt ?? undefined)
        setMine(null)
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

  const failed = error && <span className="ml-1 text-red-600">Didn’t save. Try again.</span>
  const leadText = lead ? `${lead}. ` : ''
  const button = (label: string) => (
    <button onClick={confirm} disabled={loading} className="cursor-pointer font-bold text-primary hover:underline disabled:opacity-50">
      {loading ? 'Saving…' : label}
    </button>
  )

  if (!ask) {
    const what = subject ?? 'Listing'
    return (
      <p className="text-[13.5px] leading-snug text-slate-600" data-testid="freshness">
        {leadText}
        {confirmedAt ? `${what} last checked ${shortDate(confirmedAt, now)}.` : `${what} not checked by anyone yet.`}
      </p>
    )
  }

  if (justConfirmedNow) {
    return (
      <p className="text-[13.5px] leading-snug text-emerald-700" data-testid="freshness">
        <span className="font-semibold">✓ Confirmed. Thanks!</span>{' '}
        {mine?.undoable !== false && (
          <button onClick={undo} disabled={loading} className="cursor-pointer text-slate-500 hover:text-slate-700 hover:underline disabled:opacity-50">
            {loading ? 'Undoing…' : 'Undo'}
          </button>
        )}
        {failed}
      </p>
    )
  }

  if (confirmedAt) {
    const stale = isStale(confirmedAt, now)
    return (
      <p className="text-[13.5px] leading-snug text-slate-600" data-testid="freshness">
        {leadText}
        {subject ? `${subject} confirmed` : 'Confirmed'} {shortDate(confirmedAt, now)}.
        {stale && <> Still right? {button('Yes')}</>}
        {failed}
      </p>
    )
  }

  return (
    <p className="text-[13.5px] leading-snug text-slate-600" data-testid="freshness">
      {leadText}
      {subject ? `${subject} not confirmed by anyone yet.` : 'Not confirmed by anyone yet.'} Right? {button('Yes')}
      {failed}
    </p>
  )
}
