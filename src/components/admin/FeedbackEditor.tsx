'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import type { SiteSettings } from '@/lib/siteSettings'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { AdminBox, AdminField, AdminSwitch, adminInputClass } from './AdminUI'
import SaveBar, { useLeaveGuard } from './SaveBar'

// Feedback, the first row of Site's Forms tab (the admin redesign's board
// "Feedback form"): the footer button, the form's heading and what it says
// after sending, with the form beside them. These are site settings, so
// they save through /api/admin/site-settings, only these four keys.

const KEYS = ['feedbackEnabled', 'feedbackButtonLabel', 'feedbackHeading', 'feedbackSuccessMessage'] as const
type Feedback = Pick<SiteSettings, (typeof KEYS)[number]>

function pick(s: SiteSettings): Feedback {
  return Object.fromEntries(KEYS.map((k) => [k, s[k]])) as Feedback
}

export default function FeedbackEditor({ token, onBack }: { token: string; onBack: () => void }) {
  const community = useCommunitySlug()
  const [saved, setSaved] = useState<Feedback | null>(null)
  const [draft, setDraft] = useState<Feedback | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(withCommunity('/api/admin/site-settings', community), { headers: { Authorization: `Bearer ${token}` } })
      const body = await parseOkJson<{ settings: SiteSettings }>(res, 'Failed to load.')
      setSaved(pick(body.settings))
      setDraft(pick(body.settings))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  const changes = saved && draft ? KEYS.filter((k) => saved[k] !== draft[k]).length : 0
  useLeaveGuard(changes > 0)

  function set<K extends keyof Feedback>(key: K, value: Feedback[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
    setJustSaved(false)
  }

  async function save() {
    if (!draft) return
    setError(null)
    setSaving(true)
    try {
      const body = await fetchJson<{ settings: SiteSettings }>(
        withCommunity('/api/admin/site-settings', community),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(draft),
        },
        'Save failed.',
      )
      setSaved(pick(body.settings))
      setDraft(pick(body.settings))
      setJustSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (!draft) {
    return error ? <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-muted">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className="self-start inline-flex items-center min-h-11 -mt-3 text-sm font-semibold text-primary cursor-pointer">
        ‹ Forms
      </button>
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <header className="flex items-center gap-3">
            <h2 className="flex-1 m-0 text-[26px] font-bold text-slate-900">Feedback</h2>
            <AdminSwitch checked={draft.feedbackEnabled} onChange={(on) => set('feedbackEnabled', on)} label="On the site" />
            <span aria-hidden="true" className="text-[15px] font-semibold text-slate-900">On the site</span>
          </header>
          <AdminBox>
            <div className="flex flex-col gap-4 p-4">
              <AdminField label="Button in the footer">
                <input value={draft.feedbackButtonLabel} onChange={(e) => set('feedbackButtonLabel', e.target.value)} className={adminInputClass} />
              </AdminField>
              <AdminField label="Heading">
                <input value={draft.feedbackHeading} onChange={(e) => set('feedbackHeading', e.target.value)} className={adminInputClass} />
              </AdminField>
              <AdminField label="After sending">
                <textarea rows={2} value={draft.feedbackSuccessMessage} onChange={(e) => set('feedbackSuccessMessage', e.target.value)} className={adminInputClass} />
              </AdminField>
            </div>
          </AdminBox>
        </div>
        <aside aria-label="Preview" className="hidden lg:block shrink-0 sticky top-8 self-start">
          <FeedbackFormLook heading={draft.feedbackHeading} />
        </aside>
      </div>
      <SaveBar
        changes={changes}
        saving={saving}
        saved={justSaved}
        error={error}
        onUndo={() => {
          setDraft(saved)
          setError(null)
        }}
        onSave={save}
      />
    </div>
  )
}

/** How the feedback form looks, drawn here rather than mounted: the real
 *  one (FeedbackForm) loads Turnstile, which the console has no need of. At
 *  its own size, not shrunk with the page around it like the other
 *  previews: the form is all there is to see, and shrunk it can't be read.
 *  On a computer it's a dialog; on a phone, a page. */
function FeedbackFormLook({ heading }: { heading: string }) {
  const [device, setDevice] = useState<'computer' | 'phone'>('computer')
  const box = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] text-slate-400'
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Preview on" className="self-start inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        {(['computer', 'phone'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={device === d}
            onClick={() => setDevice(d)}
            className={`min-h-10 px-3.5 rounded-md text-sm font-semibold cursor-pointer ${device === d ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            {d === 'computer' ? 'Computer' : 'Phone'}
          </button>
        ))}
      </div>
      <div
        inert
        className={`bg-white border border-slate-200 p-4 ${device === 'phone' ? 'w-[240px] min-h-[420px] rounded-[22px] pt-8' : 'w-[340px] rounded-[10px]'}`}
      >
        <p className="m-0 text-[15px] font-semibold text-slate-900">{heading}</p>
        <p className="mt-3 mb-0 text-[12px] font-medium text-slate-700">Your feedback</p>
        <div className={`${box} h-16`}>What&apos;s on your mind?</div>
        <p className="mt-3 mb-0 text-[12px] font-medium text-slate-700">
          Email <span className="font-normal text-slate-400">(optional, if you&rsquo;d like a reply)</span>
        </p>
        <div className={box}>you@example.com</div>
        <div className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-center text-[12px] font-medium text-white">Send feedback</div>
      </div>
    </div>
  )
}
