'use client'

import { useCallback, useState } from 'react'
import type { FormConfig } from '@/lib/forms'
import type { SiteSettings } from '@/lib/siteSettings'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { parseOkJson } from '@/lib/fetchJson'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { INBOX_BASE, adminBase } from '@/lib/adminNav'
import { AdminBox, AdminRow } from './AdminUI'
import FeedbackEditor from './FeedbackEditor'
import FormEditor from './FormEditor'

// Site's Forms tab (the admin redesign's board "Forms 2"): Feedback first,
// then each form, a row each saying where it shows and whether it's on;
// each opens to its own screen. `openId` is the URL's: 'feedback',
// 'form:new', or 'form:<id>' (form ids are made from their names, so one
// could be "feedback").

const FORM_PREFIX = 'form:'

/** Support and Volunteer answers go to the inbox; the rest to Responses. */
const INBOX_FORM_IDS = new Set(['support', 'volunteer'])

export default function FormsManager({
  token,
  openId,
  onOpen,
  onClose,
}: {
  token: string
  openId: string | null
  onOpen: (id: string) => void
  onClose: () => void
}) {
  const community = useCommunitySlug()
  const [forms, setForms] = useState<FormConfig[] | null>(null)
  const [feedbackOn, setFeedbackOn] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [formRes, settingsRes] = await Promise.all([
        fetch(withCommunity('/api/admin/forms', community), { headers }),
        fetch(withCommunity('/api/admin/site-settings', community), { headers }),
      ])
      const formBody = await parseOkJson<{ forms: FormConfig[] }>(formRes, 'Failed to load forms.')
      const settingsBody = await parseOkJson<{ settings: SiteSettings }>(settingsRes, 'Failed to load.')
      setForms([...formBody.forms].sort((a, b) => a.title.localeCompare(b.title)))
      setFeedbackOn(settingsBody.settings.feedbackEnabled)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  if (openId === 'feedback') return <FeedbackEditor token={token} onBack={onClose} />

  if (openId?.startsWith(FORM_PREFIX)) {
    const id = openId.slice(FORM_PREFIX.length)
    const done = () => {
      load()
      onClose()
    }
    if (id === 'new') return <FormEditor token={token} form={null} onPublished={done} onBack={onClose} onChanged={load} />
    const form = forms?.find((f) => f.id === id)
    if (!form) return <p className="text-sm text-muted">{forms ? 'There’s no such form.' : 'Loading…'}</p>
    return (
      <FormEditor
        key={form.id}
        token={token}
        form={form}
        responsesHref={INBOX_FORM_IDS.has(form.id) ? INBOX_BASE : `${adminBase(community)}/responses?form=${encodeURIComponent(form.id)}`}
        onPublished={done}
        onBack={onClose}
        onChanged={load}
      />
    )
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!forms || feedbackOn === null) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-3">
      <AdminBox>
        <AdminRow onClick={() => onOpen('feedback')} name="Feedback" line="In the footer and the More menu" aside={<OnPill on={feedbackOn} />} />
        {forms.map((f) => (
          <AdminRow
            key={f.id}
            onClick={() => onOpen(`${FORM_PREFIX}${f.id}`)}
            name={f.title}
            line={f.draft ? 'A tile in the category list · Draft not published' : 'A tile in the category list'}
            aside={<OnPill on={f.active !== false} />}
          />
        ))}
      </AdminBox>
      <button type="button" onClick={() => onOpen(`${FORM_PREFIX}new`)} className="self-start min-h-11 text-sm font-semibold text-primary cursor-pointer">
        + Add a form
      </button>
    </div>
  )
}

function OnPill({ on }: { on: boolean }) {
  return on ? (
    <span className="text-xs font-semibold text-green-800 bg-green-50 border border-green-200 rounded-full px-2 py-px">On</span>
  ) : (
    <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-px">Off</span>
  )
}
