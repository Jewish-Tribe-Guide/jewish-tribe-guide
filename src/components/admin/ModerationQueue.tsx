'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import type { EnrichedSubmission, ResourceSubmission } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { SubmissionCard } from './SubmissionCard'
import { SubmissionReview } from './SubmissionReview'

// The admin's default screen (mounted at /admin itself) — review and
// approve/reject every pending submission: new listings, edits to existing
// ones, removal reports, and brand-new categories suggested from the public
// "Suggest a category" flow.
//
// Clicking a card opens it (SubmissionReview): the original beside a form
// the admin can fix before approving. The open card is in the address
// (?open=<id>), so Back returns to the list and the link can be shared
// with another admin.

const OPENED = 'moderation-open'

// Which card is open: what the queue last opened itself, or, after Back and
// Forward (or a shared link), what the address says. Not read from the
// address after our own push: Next.js and the analytics script both wrap
// history.pushState, and the address changes a moment after the call, so
// reading it straight away still saw the list.
let openedHere: string | null | undefined

function openIdNow(): string | null {
  return openedHere !== undefined ? openedHere : new URLSearchParams(window.location.search).get('open')
}

function subscribeToAddress(onChange: () => void) {
  const onPop = () => {
    openedHere = undefined
    onChange()
  }
  window.addEventListener('popstate', onPop)
  window.addEventListener(OPENED, onChange)
  return () => {
    window.removeEventListener('popstate', onPop)
    window.removeEventListener(OPENED, onChange)
    // Coming back to the queue later reads the address afresh.
    openedHere = undefined
  }
}

function goTo(openId: string | null) {
  const url = new URL(window.location.href)
  if (openId) url.searchParams.set('open', openId)
  else url.searchParams.delete('open')
  openedHere = openId
  window.history.pushState(null, '', url)
  window.dispatchEvent(new Event(OPENED))
}

export default function ModerationQueue({ session }: { session: Session }) {
  const community = useCommunitySlug()
  const [items, setItems] = useState<EnrichedSubmission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const openId = useSyncExternalStore(subscribeToAddress, openIdNow, () => null)
  const [openError, setOpenError] = useState<string | null>(null)
  const token = session.access_token
  // Same categories the public site and the category admin editor read —
  // loaded fresh per admin page request (see /admin/layout.tsx's
  // ContentProvider), so a field added a minute ago already has a `label`
  // here without this component needing its own fetch or any per-field code.
  const categoriesById = new Map(useCategories().map((c) => [c.id, c]))

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(withCommunity('/api/admin/submissions', community), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        setError(`Signed in as ${session.user.email}, but this account is not an authorized admin.`)
        setItems([])
        return
      }
      const body = await parseOkJson<{ submissions: EnrichedSubmission[] }>(res, 'Failed to load.')
      setItems(body.submissions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, session.user.email, community])

  useLoadOnMount(load)

  function open(id: string) {
    setOpenError(null)
    goTo(id)
    window.scrollTo?.(0, 0)
  }

  function backToList() {
    goTo(null)
  }

  async function moderate(id: string, status: 'approved' | 'rejected', reason?: string, payload?: ResourceSubmission) {
    setBusyId(id)
    setOpenError(null)
    try {
      await fetchJson(
        withCommunity(`/api/admin/submissions/${id}`, community),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status, ...(reason ? { reason } : {}), ...(payload ? { payload } : {}) }),
        },
        'Failed to update.',
      )
      setItems((prev) => (prev ? prev.filter((s) => s.id !== id) : prev))
      if (openId === id) backToList()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      // An opened card keeps the admin's fixes on screen, with the reason
      // beside them, instead of losing them to an error at the top.
      if (openId === id) setOpenError(message)
      else setError(message)
    } finally {
      setBusyId(null)
    }
  }

  const opened = openId ? items?.find((s) => s.id === openId) : undefined
  if (opened) {
    const categoryId = (opened.payload as Partial<ResourceSubmission>).category ?? opened.current?.category
    return (
      <SubmissionReview
        key={opened.id}
        submission={opened}
        category={categoryId ? categoriesById.get(categoryId) : undefined}
        waiting={items?.length ?? 0}
        busy={busyId === opened.id}
        error={openError}
        onBack={backToList}
        onModerate={moderate}
      />
    )
  }

  return (
    <div>
      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {items === null ? (
        <p className="text-sm text-muted">Loading submissions…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">🎉 Nothing pending — the queue is clear.</p>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={s}
              busy={busyId === s.id}
              onModerate={moderate}
              categoriesById={categoriesById}
              onOpen={() => open(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
