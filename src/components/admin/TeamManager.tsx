'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'

// ── The 'team' tab: who can sign in to THIS community's admin console, plus
// the signed-in admin's own two notification checkboxes (new submissions;
// another admin's approve/reject decisions). The list is deliberately
// add-only — any of this community's own admins can grow it (see POST
// /api/admin/team), but removing someone is a superadmin-only action from
// /admin's Communities tab. That split means one admin can't lock another
// admin (or themselves) out by mistake, while still letting a community
// bring on its own help without waiting on the site owner.
//
// The notification checkboxes are the opposite shape on purpose: everyone
// can only ever touch their OWN preferences (PATCH /api/admin/team always
// writes admin.email from the verified token, never anything
// client-supplied), so there's no equivalent "ask the site owner" step
// needed for them. ──

export default function TeamManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [adminEmails, setAdminEmails] = useState<string[] | null>(null)
  const [myNotify, setMyNotify] = useState<boolean | null>(null)
  const [myReviewNotify, setMyReviewNotify] = useState<boolean | null>(null)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const [notifySaving, setNotifySaving] = useState(false)
  const [reviewNotifyError, setReviewNotifyError] = useState<string | null>(null)
  const [reviewNotifySaving, setReviewNotifySaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(withCommunity('/api/admin/team', community), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await parseOkJson<{ adminEmails: string[]; myNotify: boolean; myReviewNotify: boolean }>(
        res,
        'Failed to load the team list.',
      )
      setAdminEmails(body.adminEmails)
      setMyNotify(body.myNotify)
      setMyReviewNotify(body.myReviewNotify)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  // Always the signed-in admin's OWN preference — both checkboxes reflect
  // and control this account only, never another admin's (see PATCH
  // /api/admin/team's own comment). Optimistic, with a revert on failure:
  // the point of a checkbox is that it doesn't need a separate "Save".
  // `field` picks which of the two independent preferences this call
  // touches — the PATCH body only ever carries the one that changed, so
  // toggling one can never clobber the other's last-saved value.
  async function togglePreference(field: 'notify' | 'reviewNotify', next: boolean) {
    const setValue = field === 'notify' ? setMyNotify : setMyReviewNotify
    const setSaving = field === 'notify' ? setNotifySaving : setReviewNotifySaving
    const setFieldError = field === 'notify' ? setNotifyError : setReviewNotifyError
    const previous = field === 'notify' ? myNotify : myReviewNotify
    const errorMessage = 'Could not update your notification preference.'

    setValue(next)
    setFieldError(null)
    setSaving(true)
    try {
      await fetchJson(
        withCommunity('/api/admin/team', community),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ [field]: next }),
        },
        errorMessage,
      )
    } catch (err) {
      setValue(previous)
      setFieldError(err instanceof Error ? err.message : errorMessage)
    } finally {
      setSaving(false)
    }
  }

  async function addEmail() {
    setAdding(true)
    setAddError(null)
    try {
      const { adminEmails: next } = await fetchJson<{ adminEmails: string[] }>(
        withCommunity('/api/admin/team', community),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email: newEmail }),
        },
        'Could not add that email.',
      )
      setAdminEmails(next)
      setNewEmail('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add that email.')
    } finally {
      setAdding(false)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!adminEmails) return <p className="text-sm text-muted">Loading team…</p>

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Team</h2>
        <p className="text-sm text-muted">Everyone who can sign in to this admin console.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-md px-3 py-2.5 space-y-3">
        <div>
          <label className="flex items-center gap-2 text-sm text-slate-900 cursor-pointer">
            <input
              type="checkbox"
              checked={myNotify ?? false}
              disabled={myNotify === null || notifySaving}
              onChange={(e) => togglePreference('notify', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed"
            />
            Email me about new submissions
          </label>
          {notifyError && <p className="text-xs text-red-700 mt-1">{notifyError}</p>}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-900 cursor-pointer">
            <input
              type="checkbox"
              checked={myReviewNotify ?? false}
              disabled={myReviewNotify === null || reviewNotifySaving}
              onChange={(e) => togglePreference('reviewNotify', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed"
            />
            Email me when another admin approves or rejects a submission
          </label>
          {reviewNotifyError && <p className="text-xs text-red-700 mt-1">{reviewNotifyError}</p>}
        </div>

        <p className="text-xs text-muted">
          Only for your own sign-in — everyone else on the team sets these for themselves.
        </p>
      </div>

      <ul className="space-y-1">
        {adminEmails.length > 0 ? (
          adminEmails.map((email) => (
            <li
              key={email}
              className="text-sm text-slate-900 font-mono bg-white border border-slate-200 rounded-md px-3 py-2"
            >
              {email}
            </li>
          ))
        ) : (
          <li className="text-sm text-muted italic">
            Nobody&rsquo;s been added yet — sign-in falls back to the site owner&rsquo;s superadmin list.
          </li>
        )}
      </ul>

      <div className="border-t border-slate-200 pt-4">
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Add someone
          <div className="flex gap-2 mt-1">
            <input
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="teammate@example.com"
              type="email"
              onKeyDown={(e) => e.key === 'Enter' && newEmail.trim() && addEmail()}
            />
            <button
              onClick={addEmail}
              disabled={adding || !newEmail.trim()}
              className="text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer shrink-0"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </label>
        {addError && <p className="text-xs text-red-700 mt-1">{addError}</p>}
        <p className="text-xs text-muted mt-2">
          Anyone added here can sign in and make changes here. To remove someone, ask the site owner — that can only
          be done from the superadmin console.
        </p>
      </div>
    </div>
  )
}
