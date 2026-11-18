'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { parseOkJson } from '@/lib/fetchJson'
import type { SiteSettings } from '@/lib/siteSettings'
import { useAdminApi } from './useAdminApi'
import { AdminBack, AdminBox, AdminField, AdminSwitch, adminInputClass } from './AdminUI'
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
  const api = useAdminApi(token)
  const [saved, setSaved] = useState<Feedback | null>(null)
  const [draft, setDraft] = useState<Feedback | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `api` is kept across a new token (hourly, useAdminApi), so the draft
  // isn't loaded again over what's being typed.
  const load = useCallback(async () => {
    try {
      const res = await api.fetch('/api/admin/site-settings')
      const body = await parseOkJson<{ settings: SiteSettings }>(res, 'Failed to load.')
      setSaved(pick(body.settings))
      setDraft(pick(body.settings))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [api])
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
      const body = await api.send<{ settings: SiteSettings }>('PATCH', '/api/admin/site-settings', draft, 'Save failed.')
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
      <AdminBack back={{ label: 'Forms', onClick: onBack }} title="Feedback" />
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-[10px] px-4 py-2.5 min-h-[52px] md:bg-transparent md:border-0 md:p-0 md:min-h-0">
            <span aria-hidden="true" className="flex-1 text-[15px] font-semibold text-slate-900 md:flex-none md:order-last">On the site</span>
            <AdminSwitch checked={draft.feedbackEnabled} onChange={(on) => set('feedbackEnabled', on)} label="On the site" />
          </div>
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
 *  A page on both: on a computer the form on the left and the Tell us card
 *  on the right; on a phone the card first, then the form. */
function FeedbackFormLook({ heading }: { heading: string }) {
  const [device, setDevice] = useState<'computer' | 'phone'>('computer')
  const box = 'mt-1 w-full rounded-[8px] border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] text-slate-400'
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
        className={`bg-slate-50 border border-slate-200 p-4 ${device === 'phone' ? 'w-[240px] min-h-[420px] rounded-[22px] pt-8' : 'w-[520px] rounded-[10px]'}`}
      >
        <p className="m-0 text-[16px] font-extrabold text-slate-900">{heading}</p>
        <div className={device === 'phone' ? '' : 'mt-3 grid grid-cols-[minmax(0,1fr)_170px] items-start gap-3'}>
          <div className={`rounded-[12px] border border-slate-200 bg-white p-2.5 text-[12px] font-bold text-slate-900 ${device === 'phone' ? 'mt-3' : 'col-start-2 row-start-1'}`}>Know something we don’t?</div>
          <div className={`rounded-[12px] border border-slate-200 bg-white p-3 ${device === 'phone' ? 'mt-2' : 'col-start-1 row-start-1'}`}>
            <p className="m-0 text-[13px] font-extrabold text-slate-900">{device === 'phone' ? 'Anything else?' : 'What’s on your mind?'}</p>
            <p className="mt-2 mb-0 text-[12px] font-bold text-slate-900">Your note</p>
            <div className={`${box} h-16`}>An idea, something that didn’t work…</div>
            <p className="mt-3 mb-0 text-[12px] font-bold text-slate-900">Email, for a reply</p>
            <div className={box}>you@example.com</div>
            <div className="mt-3 w-full rounded-[10px] bg-blue-600 px-3 py-2 text-center text-[12px] font-bold text-white">Send</div>
          </div>
        </div>
      </div>
    </div>
  )
}
