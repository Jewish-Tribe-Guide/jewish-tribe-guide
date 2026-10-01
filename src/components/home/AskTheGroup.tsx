'use client'

import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@vercel/analytics'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { itemsField } from '@/lib/listingView'
import { cleanItemName } from '@/lib/itemMarks'
import { neighborhoodsFor, placeName, townsFrom } from '@/lib/places'
import { askMessage } from '@/lib/shareAnswer'
import { useShareLink } from '@/lib/useShareLink'
import { useOptionalCommunitySlug } from '@/lib/communityContext'
import TurnstileWidget from '@/components/TurnstileWidget'
import { TURNSTILE_ACTIVE } from '@/components/resources/useListingSubmit'

// The last thing a search that found nothing shows: where to ask, and how to
// put the answer in the guide once someone knows it. After whatever is close
// (see nearMiss), never instead of it — the people in the WhatsApp groups are
// who answer questions the guide can't yet, and the next person to ask
// shouldn't have to.
//
// Agreed Oct 1:
// - "Ask a WhatsApp group" opens the phone's share menu with the question
//   written (WhatsApp has no link that types into a group), ending with the
//   question's own link, which answers it once someone adds the answer. On a
//   computer it copies the question.
// - "Know where to find it?", for an item ("rugelach"), opens "Seen rugelach
//   somewhere? Where?": the item is filled in from the question, and the
//   visitor only picks a place already in the guide. It's the same
//   suggestion as "+ Add an item" on that place's own listing, for an admin
//   to check. A question that isn't about an item goes to `addHref` as before.

export type AskGroupProps = {
  nothingClose: boolean
  /** The community's WhatsApp groups page, when it has one. */
  askHref: string | null
  /** A new place's Add form, or a note to the admins. */
  addHref: string
  /** The question's own page (routes.ask), sent with the question. */
  sharePath: string
  /** The item asked for, as typed, when the question is about one. */
  item?: string | null
  /** Where the item could have been seen: listings whose category keeps an
   *  item list. */
  listings?: readonly DirectoryResource[]
  categories?: readonly CategoryConfig[]
}

export default function AskTheGroup({
  query,
  nothingClose,
  askHref,
  addHref,
  sharePath,
  item = null,
  listings = [],
  categories = [],
  className = '',
}: AskGroupProps & { query: string; className?: string }) {
  const { share, copied } = useShareLink(sharePath, query, () => askMessage(query))
  const [where, setWhere] = useState(false)
  const name = cleanItemName(item)
  const canSay = !!name && categories.some((c) => itemsField(c))
  return (
    <div className={`rounded-xl border border-slate-200 bg-white px-3.5 py-3 ${className}`} data-testid="ask-the-group">
      <p className="text-[14px] font-semibold leading-snug text-ink">
        {nothingClose ? `Nothing in the guide for “${query}” yet.` : 'Not what you’re looking for?'}
      </p>
      {where && canSay ? (
        <WhereSeen item={name!} listings={listings} categories={categories} addHref={addHref} onClose={() => setWhere(false)} />
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              track('asked_group')
              void share()
            }}
            className="mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-primary text-[15px] font-bold text-white transition-colors hover:bg-primary-dark"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M10 3v10M6 7l4-4 4 4M4 12v3a2 2 0 002 2h8a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {copied ? 'Question copied: paste it in the group' : 'Ask a WhatsApp group'}
          </button>
          <p className="mt-1.5 text-[12.5px] leading-snug text-muted">Opens your phone’s share menu with the question written. Pick WhatsApp, then the group.</p>
          <ul className="mt-2 space-y-1 text-[13.5px]">
            <li>
              {canSay ? (
                <button type="button" onClick={() => setWhere(true)} className="cursor-pointer font-semibold text-primary hover:text-primary-dark">
                  Know where to find it? Add it to the guide →
                </button>
              ) : (
                <Link href={addHref} className="font-semibold text-primary hover:text-primary-dark">
                  Know where to find it? Add it to the guide →
                </Link>
              )}
            </li>
            {askHref && (
              <li>
                <Link href={askHref} className="font-medium text-slate-500 hover:text-slate-700">
                  Not in a group? See the community’s groups →
                </Link>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}

type Outcome = { kind: 'added' | 'already'; item: string; place: string }

/** "Seen rugelach somewhere? Where?": the item from the question, a place
 *  picked from the guide's own, then the same suggestion "+ Add an item"
 *  sends (POST /api/resource/:id/item/add), with its bot check. */
function WhereSeen({
  item,
  listings,
  categories,
  addHref,
  onClose,
}: {
  item: string
  listings: readonly DirectoryResource[]
  categories: readonly CategoryConfig[]
  addHref: string
  onClose: () => void
}) {
  const community = useOptionalCommunitySlug()
  const inputId = useId()
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<DirectoryResource | null>(null)
  const [sometimes, setSometimes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Outcome | null>(null)

  // The places an item can be added to, each with its kind and where it is.
  const candidates = useMemo(() => {
    const kinds = new Map(categories.filter((c) => itemsField(c)).map((c) => [c.id, c]))
    const here = listings.filter((l) => kinds.has(l.category))
    const hoods = neighborhoodsFor(community)
    const towns = townsFrom(here)
    return here.map((l) => ({ listing: l, about: [kinds.get(l.category)!.label, placeName(l, hoods, towns)].filter(Boolean).join(' · ') }))
  }, [listings, categories, community])
  const typed = text.trim().toLowerCase()
  const matches =
    typed.length < 2 || picked
      ? []
      : candidates
          .filter((c) => {
            const n = c.listing.name.toLowerCase()
            return n.startsWith(typed) || n.split(/\s+/).some((w) => w.startsWith(typed))
          })
          .sort((a, b) => Number(b.listing.name.toLowerCase().startsWith(typed)) - Number(a.listing.name.toLowerCase().startsWith(typed)))
          .slice(0, 5)

  const send = async (token: string) => {
    if (!picked) return
    try {
      const res = await fetch(`/api/resource/${picked.id}/item/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, sometimes, from: 'question', turnstileToken: token, company: '' }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; item?: string; already?: { item?: string }; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'failed')
      setDone(json.already ? { kind: 'already', item: json.already.item ?? item, place: picked.name } : { kind: 'added', item: json.item ?? item, place: picked.name })
    } catch {
      setError('That didn’t send. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const add = () => {
    setBusy(true)
    setError(null)
    setAttempt((n) => n + 1)
    if (!TURNSTILE_ACTIVE) void send('')
  }

  if (done) {
    return (
      <div className="mt-2" role="status" data-testid="where-seen-done">
        <p className="text-[15px] font-bold text-emerald-700">
          {done.kind === 'added' ? `✓ Thanks! ${done.item} at ${done.place}` : `${done.place} already has ${done.item} in the guide.`}
        </p>
        {done.kind === 'added' && (
          <p className="mt-1 text-[14px] leading-snug text-slate-700">An admin checks it, usually within a day. Once it’s in, this same link answers the question.</p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2" data-testid="where-seen">
      <p className="text-[16px] font-extrabold text-ink">Seen {item} somewhere?</p>
      <label htmlFor={inputId} className="mt-0.5 block text-[13.5px] text-muted">
        Where? Start typing the place’s name.
      </label>
      <input
        id={inputId}
        autoFocus
        autoComplete="off"
        value={picked ? picked.name : text}
        onChange={(e) => {
          setPicked(null)
          setText(e.target.value)
        }}
        className="mt-2 h-11 w-full rounded-[10px] border-2 border-slate-300 px-3 text-base text-ink outline-none focus:border-primary"
      />
      {matches.length > 0 && (
        <div className="mt-1.5 overflow-hidden rounded-[10px] border border-slate-200">
          {matches.map((c) => (
            <button
              key={c.listing.id}
              type="button"
              onClick={() => setPicked(c.listing)}
              className="flex min-h-12 w-full cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-2 text-left first:border-t-0 hover:bg-slate-50"
            >
              <span className="text-[15px] text-ink">{c.listing.name}</span>
              {c.about && <span className="text-[13.5px] text-muted">· {c.about}</span>}
            </button>
          ))}
        </div>
      )}
      {typed.length >= 2 && !picked && matches.length === 0 && <p className="mt-2 text-[13.5px] text-muted">No place in the guide by that name.</p>}
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-ink">
        <input type="checkbox" checked={sometimes} onChange={(e) => setSometimes(e.target.checked)} className="h-5 w-5 accent-primary" />
        Not always in stock
      </label>
      <button
        type="button"
        disabled={!picked || busy}
        onClick={add}
        className="mt-1 h-11 w-full cursor-pointer rounded-[10px] bg-primary text-[15px] font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-default disabled:opacity-45"
      >
        {busy ? 'Sending…' : picked ? `Add ${item} at ${picked.name}` : 'Pick a place'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[13.5px] text-red-700">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-3 text-[13.5px]">
        <Link href={addHref} className="font-semibold text-primary hover:text-primary-dark">
          Not in the guide? Add a new place →
        </Link>
        <button type="button" onClick={onClose} className="cursor-pointer font-semibold text-slate-500 hover:text-slate-700">
          Cancel
        </button>
      </div>
      <p className="mt-1.5 text-[12.5px] text-muted">An admin checks it before everyone sees it.</p>
      {busy && TURNSTILE_ACTIVE && <TurnstileWidget key={attempt} onVerify={(token) => void send(token)} />}
    </div>
  )
}
