'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { parseOkJson } from '@/lib/fetchJson'
import { AdminBox, AdminSwitch, adminInputClass } from './AdminUI'
import { useAdminApi } from './useAdminApi'
import type { CommunityEmailLoaded } from './CommunityEmailPage'

// Settings' Team tab (the admin redesign's board "Team"): who can sign in to
// THIS community's admin, added and removed here by any of its admins, and
// the signed-in admin's own two emails. Nobody can remove themselves (see
// DELETE /api/admin/team), so the team can't be left with no one by
// mistake; your own row says "You" instead.
//
// Above the admins, the community email (board E2, Nov 25): the guide's own
// Gmail, what it's used for, and Change, which opens its page.
//
// The two switches only ever touch the signed-in admin's OWN preferences
// (PATCH /api/admin/team always writes admin.email from the verified token,
// never anything client-supplied).

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const TICK = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="M5 12l5 5L19 7" />
  </svg>
)
const NOT_YET = <span aria-hidden="true" className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-slate-300" />
const CHEVRON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Board E2's box. Not set up: one row that opens its page. */
export function CommunityEmailBox({ own, href }: { own: CommunityEmailLoaded; href: string }) {
  if (!own.email) {
    return (
      <AdminBox title="Community email">
        <Link href={href} className="flex items-center gap-3 px-4 py-3.5 min-h-[52px] text-slate-900 hover:bg-slate-50">
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-[0.9375rem] font-semibold">Not set up yet</span>
            <span className="text-[0.8125rem] text-slate-600">For replies and the shuls’ and eruvs’ emails</span>
          </span>
          <span className="min-h-10 inline-flex items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">Set it up</span>
        </Link>
      </AdminBox>
    )
  }
  return (
    <AdminBox
      title="Community email"
      action={
        <Link href={href} className="min-h-10 inline-flex items-center px-1 text-sm font-semibold text-primary">
          Change
        </Link>
      }
    >
      <p className="m-0 px-4 pt-3.5 pb-1.5 text-[1.0625rem] font-semibold text-slate-900 [overflow-wrap:anywhere]">{own.email}</p>
      <p className="m-0 flex items-center gap-2.5 px-4 py-1.5 min-h-9 text-[0.9375rem] text-slate-900">
        {TICK}
        <span className="flex-1">Replies to the site’s emails</span>
      </p>
      <Link href={href} className="flex items-center gap-2.5 px-4 pt-2 pb-3.5 min-h-11 text-[0.9375rem] text-slate-900 hover:bg-slate-50 rounded-b-[10px]">
        {own.checkedAt ? TICK : NOT_YET}
        <span className="flex-1">The shuls’ and eruvs’ emails</span>
        <span className="text-sm text-slate-600">{!own.checkedAt ? 'Not set up' : own.lastEmailAt ? `Last one ${shortDay(own.lastEmailAt)}` : 'None in yet'}</span>
        {CHEVRON}
      </Link>
    </AdminBox>
  )
}

export default function TeamManager({ token, me }: { token: string; me: string }) {
  const api = useAdminApi(token)
  const base = adminBase(useCommunitySlug())
  const [own, setOwn] = useState<CommunityEmailLoaded | null>(null)
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
      const res = await api.fetch('/api/admin/team')
      const body = await parseOkJson<{ adminEmails: string[]; myNotify: boolean; myReviewNotify: boolean }>(
        res,
        'Failed to load the team list.',
      )
      setAdminEmails(body.adminEmails)
      setPrefs({ notify: body.myNotify, reviewNotify: body.myReviewNotify })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [api])

  useLoadOnMount(load)

  // On its own: the team still shows if this can't be read.
  const loadOwn = useCallback(async () => {
    setOwn((await api.get<CommunityEmailLoaded>('/api/admin/community-email', '').catch(() => null)) ?? null)
  }, [api])
  useLoadOnMount(loadOwn)

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
      await api.send('PATCH', '/api/admin/team', { [field]: next }, message)
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
      const { adminEmails: next } = await api.send<{ adminEmails: string[] }>(method, '/api/admin/team', { email }, message)
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
      {own && <CommunityEmailBox own={own} href={`${base}/team/email`} />}
      <AdminBox title="Admins">
        <ul className="m-0 p-0 list-none">
          {adminEmails.map((email) =>
            confirming === email ? (
              <li key={email} className={`${row} flex-wrap bg-slate-50`}>
                <span className="flex-1 min-w-0 text-[0.9375rem] font-semibold text-slate-900 break-all">Remove {email}?</span>
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
                <span className="flex-1 min-w-0 text-[0.9375rem] font-semibold text-slate-900 break-all">{email}</span>
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
        {listError && <p className="m-0 px-4 pb-3 text-[0.8125rem] text-red-700">{listError}</p>}
      </AdminBox>

      <AdminBox title="Emails to you">
        {(
          [
            ['notify', 'Something new to decide'],
            ['reviewNotify', 'Another admin decided something'],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="flex items-center gap-3 px-4 py-3 min-h-[52px] border-b border-slate-100 last:border-b-0">
            <span aria-hidden="true" className="flex-1 text-[0.9375rem] text-slate-900">
              {label}
            </span>
            <AdminSwitch checked={prefs[field]} onChange={(on) => setPreference(field, on)} label={label} />
          </div>
        ))}
        {prefError && <p className="m-0 px-4 pb-3 text-[0.8125rem] text-red-700">{prefError}</p>}
      </AdminBox>
    </div>
  )
}
