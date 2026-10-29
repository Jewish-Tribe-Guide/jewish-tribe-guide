'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { AdminBox, AdminSwitch, adminInputClass } from './AdminUI'

// Settings' Team tab (the admin redesign's board "Team"): who can sign in to
// THIS community's admin, added and removed here by any of its admins, and
// the signed-in admin's own two emails. Nobody can remove themselves (see
// DELETE /api/admin/team), so the team can't be left with no one by
// mistake; your own row says "You" instead.
//
// The two switches only ever touch the signed-in admin's OWN preferences
// (PATCH /api/admin/team always writes admin.email from the verified token,
// never anything client-supplied).

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export default function TeamManager({ token, me }: { token: string; me: string }) {
  const community = useCommunitySlug()
  const [adminEmails, setAdminEmails] = useState<string[] | null>(null)
  const [prefs, setPrefs] = useState<{ notify: boolean; reviewNotify: boolean } | null>(null)
  const [prefError, setPrefError] = useState<string | null>(null)
  const [savingPref, setSavingPref] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

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
      setPrefs({ notify: body.myNotify, reviewNotify: body.myReviewNotify })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  // Saved as soon as it's switched, put back if the save fails. The PATCH
  // carries only the one that changed, so it can't clobber the other.
  async function setPreference(field: 'notify' | 'reviewNotify', next: boolean) {
    if (!prefs || savingPref) return
    const previous = prefs
    const message = 'Could not update your notification preference.'
    setPrefs({ ...prefs, [field]: next })
    setPrefError(null)
    setSavingPref(true)
    try {
      await fetchJson(
        withCommunity('/api/admin/team', community),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ [field]: next }),
        },
        message,
      )
    } catch (err) {
      setPrefs(previous)
      setPrefError(err instanceof Error ? err.message : message)
    } finally {
      setSavingPref(false)
    }
  }

  async function changeTeam(method: 'POST' | 'DELETE', email: string, message: string) {
    setBusy(true)
    setListError(null)
    try {
      const { adminEmails: next } = await fetchJson<{ adminEmails: string[] }>(
        withCommunity('/api/admin/team', community),
        {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email }),
        },
        message,
      )
      setAdminEmails(next)
      if (method === 'POST') setNewEmail('')
      setConfirming(null)
    } catch (err) {
      setListError(err instanceof Error ? err.message : message)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!adminEmails || !prefs) return <p className="text-sm text-muted">Loading team…</p>

  const row = 'flex items-center gap-3 px-4 py-3 min-h-[52px] border-b border-slate-100'

  return (
    <div className="max-w-[840px] flex flex-col gap-4">
      <AdminBox title="Admins">
        <ul className="m-0 p-0 list-none">
          {adminEmails.map((email) =>
            confirming === email ? (
              <li key={email} className={`${row} flex-wrap bg-slate-50`}>
                <span className="flex-1 min-w-0 text-[15px] font-semibold text-slate-900 break-all">Remove {email}?</span>
                <button
                  type="button"
                  onClick={() => changeTeam('DELETE', email, 'Could not remove that admin.')}
                  disabled={busy}
                  className="min-h-10 px-3.5 rounded-lg bg-red-600 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  {busy ? 'Removing…' : 'Remove'}
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="min-h-10 px-3 text-sm font-semibold text-slate-700 cursor-pointer">
                  Leave it
                </button>
              </li>
            ) : (
              <li key={email} className={row}>
                <span className="flex-1 min-w-0 text-[15px] font-semibold text-slate-900 break-all">{email}</span>
                {sameEmail(email, me) ? (
                  <span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-px">You</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(email)}
                    aria-label={`Remove ${email}`}
                    className="min-h-10 text-sm font-semibold text-primary cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </li>
            ),
          )}
        </ul>
        <form
          noValidate
          className="flex gap-2 p-3 px-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (newEmail.trim()) changeTeam('POST', newEmail, 'Could not add that email.')
          }}
        >
          <input
            className={`${adminInputClass} flex-1 min-w-0`}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="name@example.com"
            aria-label="Email"
            type="email"
          />
          <button
            type="submit"
            disabled={busy || !newEmail.trim()}
            className="shrink-0 min-h-11 px-4 rounded-lg bg-primary text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            {busy && !confirming ? 'Adding…' : 'Add admin'}
          </button>
        </form>
        {listError && <p className="m-0 px-4 pb-3 text-[13px] text-red-700">{listError}</p>}
      </AdminBox>

      <AdminBox title="Emails to you">
        {(
          [
            ['notify', 'Something new to decide'],
            ['reviewNotify', 'Another admin decided something'],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="flex items-center gap-3 px-4 py-3 min-h-[52px] border-b border-slate-100 last:border-b-0">
            <span aria-hidden="true" className="flex-1 text-[15px] text-slate-900">
              {label}
            </span>
            <AdminSwitch checked={prefs[field]} onChange={(on) => setPreference(field, on)} label={label} />
          </div>
        ))}
        {prefError && <p className="m-0 px-4 pb-3 text-[13px] text-red-700">{prefError}</p>}
      </AdminBox>
    </div>
  )
}
