'use client'

import { useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchJson } from '@/lib/fetchJson'
import type { ResourceSubmission } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { splitSubmissions } from '@/lib/todo'
import { updateTodo, useTodo } from '@/lib/useTodo'
import { SubmissionCard } from './SubmissionCard'
import { SubmissionReview } from './SubmissionReview'
import TodoList from './TodoList'
import ChangeReview from './ChangeReview'
import { AdminBack } from './AdminUI'

// The admin's front page, To do (mounted at /<community>/admin itself):
// the one list of what's waiting (TodoList), and each suggestion opened to
// be decided. New listings and edits open to the original beside a form
// the admin can fix before approving (SubmissionReview); a removal, an
// eruv fix or a new category opens to its card. The open one is in the
// address (?open=<id>), so Back returns to the list and the link can be
// shared with another admin.

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
  const token = session.access_token
  // Loaded afresh each time To do opens; the nav's count reads the same copy.
  const { data, error: loadError } = useTodo(token, community, session.user.email, true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const openId = useSyncExternalStore(subscribeToAddress, openIdNow, () => null)
  const [openError, setOpenError] = useState<string | null>(null)
  // Same categories the public site and the category admin editor read —
  // loaded fresh per admin page request (see /admin/layout.tsx's
  // ContentProvider), so a field added a minute ago already has a `label`
  // here without this component needing its own fetch or any per-field code.
  const categoriesById = new Map(useCategories().map((c) => [c.id, c]))
  // In the order the list shows them: new places, then changes.
  const items = data ? Object.values(splitSubmissions(data.submissions)).flat() : null

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
      updateTodo((d) => ({ ...d, submissions: d.submissions.filter((s) => s.id !== id) }))
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

  const at = openId && items ? items.findIndex((s) => s.id === openId) : -1
  const opened = at >= 0 ? items![at] : undefined
  if (opened) {
    const next = items![at + 1]
    const categoryId = (opened.payload as Partial<ResourceSubmission>).category ?? opened.current?.category
    const reviewable = opened.target_type === 'listing' && opened.operation !== 'delete'
    const category = categoryId ? categoriesById.get(categoryId) : undefined
    const position = { at, total: items!.length, back: backToList, next: next ? () => open(next.id) : undefined }
    // A change to a listing (boards 3 and 20): the listing now beside what
    // it would show, and three answers.
    if (reviewable && opened.operation === 'update' && category && opened.current) {
      return (
        <ChangeReview
          key={opened.id}
          submission={opened}
          category={category}
          position={position}
          busy={busyId === opened.id}
          error={openError}
          token={token}
          onModerate={moderate}
          onUpdated={(id) => {
            updateTodo((d) => ({ ...d, submissions: d.submissions.filter((x) => x.id !== id) }))
            backToList()
          }}
        />
      )
    }
    const name = (opened.payload as Partial<ResourceSubmission>).name || opened.current?.name || 'To do'
    return (
      <div className="flex flex-col gap-3">
        <AdminBack
          back={{ label: 'To do', onClick: backToList }}
          title={name}
          right={
            <span className="flex items-center gap-3 md:-mt-3">
              <span className="text-[13.5px] text-slate-600 whitespace-nowrap">
                {at + 1} of {items!.length}
              </span>
              {next && (
                <button type="button" onClick={() => open(next.id)} className="max-md:hidden min-h-11 text-sm font-semibold text-primary cursor-pointer">
                  Next ›
                </button>
              )}
            </span>
          }
        />
        {reviewable ? (
          <SubmissionReview
            key={opened.id}
            submission={opened}
            category={category}
            busy={busyId === opened.id}
            error={openError}
            onModerate={moderate}
          />
        ) : (
          <>
            <SubmissionCard key={opened.id} submission={opened} busy={busyId === opened.id} onModerate={moderate} categoriesById={categoriesById} />
            {openError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{openError}</p>}
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      {(loadError || error) && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{loadError || error}</p>
      )}
      {data === null ? (
        <p className="text-sm text-muted">Loading submissions…</p>
      ) : (
        !loadError && <TodoList data={data} token={token} categoriesById={categoriesById} onOpen={open} />
      )}
    </div>
  )
}
