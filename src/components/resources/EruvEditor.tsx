'use client'

import { useRef, useState } from 'react'
import type { Eruv } from '@/lib/eruv'
import { ERUV_SUGGESTION_FIELDS, eruvChanges, type EruvSuggestionField } from '@/lib/eruvSuggestion'
import { initialsOf } from '@/lib/listingRow'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import CategoryIcon from '@/components/CategoryIcon'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget, { type TurnstileHandle } from '@/components/TurnstileWidget'
import { TURNSTILE_ACTIVE } from './useListingSubmit'
import { SUBMIT_PILL } from './submitPill'
import { ChangedTag, EditorAddLine, EditorEmptyRows, EditorOpenCard, EditorRowCard, EditorSent, editorInputClass, sendChangesLabel } from './editorParts'

// ── Suggest an edit, an eruv (Oct 13) ───────────────────────────────────────
// The same editor every listing has (editorParts): the eruv's own rows as
// cards, a tap opening one where it is, Changed on what's been changed,
// what it doesn't have yet under "Not on the listing yet", Send counting
// the changes, then Sent. Its rows are the four anyone can fix
// (eruvSuggestion.ts); its name, status page and map are the admin's, so
// its name heads the list without a ›. It goes to the moderation queue
// and shows once an admin approves it.

type Values = Record<EruvSuggestionField, string>

export default function EruvEditor({ eruv, color, onClose }: { eruv: Eruv; color: string; onClose: () => void }) {
  const community = useCommunitySlug()
  const [values, setValues] = useState<Values>(() => ({ covers: eruv.covers ?? '', website: eruv.website ?? '', hotline: eruv.hotline ?? '', alertsUrl: eruv.alertsUrl ?? '' }))
  const [openKey, setOpenKey] = useState<EruvSuggestionField | null>(null)
  const [honeypot, setHoneypot] = useState('')
  const [token, setToken] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const changed = new Set(eruvChanges(eruv, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null]))).map((c) => c.key))
  const verifying = TURNSTILE_ACTIVE && !token

  async function send() {
    if (changed.size === 0 || sending || verifying) return
    setErrors([])
    setSending(true)
    try {
      const res = await fetch(withCommunity('/api/submissions', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'update', targetType: 'eruv', targetId: eruv.id, payload: values, company: honeypot, turnstileToken: token }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        if (body.code === 'turnstile') {
          turnstileRef.current?.reset()
          setToken('')
          setErrors(['Verification expired. We’ve refreshed it, so tap Send again.'])
          return
        }
        setErrors(body.errors ?? ['Something went wrong. Please try again.'])
        return
      }
      setSent(true)
    } catch {
      setErrors(['Network error. Please check your connection and try again.'])
    } finally {
      setSending(false)
    }
  }

  if (sent) return <EditorSent message="An admin checks it, usually within a day." onDone={onClose} />

  const input = (f: (typeof ERUV_SUGGESTION_FIELDS)[number]) => {
    const common = {
      'aria-label': f.label,
      value: values[f.key],
      autoFocus: true,
      onChange: (e: { target: { value: string } }) => setValues({ ...values, [f.key]: e.target.value }),
    }
    return f.long ? (
      <textarea {...common} rows={4} className={`${editorInputClass} h-auto py-2.5`} />
    ) : (
      // Text, not type="url": the browser would refuse "centercityeruv.org",
      // which the server takes and adds https:// to (eruvSuggestion.ts).
      <input {...common} type="text" inputMode={f.url ? 'url' : f.key === 'hotline' ? 'tel' : undefined} autoCapitalize={f.url ? 'none' : undefined} className={editorInputClass} />
    )
  }
  const tags = (key: EruvSuggestionField) => changed.has(key) && <ChangedTag />
  const openCard = (f: (typeof ERUV_SUGGESTION_FIELDS)[number]) => (
    <EditorOpenCard testId={`editor-open-${f.key}`} title={f.label} tags={tags(f.key)} onClose={() => setOpenKey(null)}>
      {input(f)}
    </EditorOpenCard>
  )
  // Filled now, or filled before (emptied is a change to see, not a line to add).
  const filled = ERUV_SUGGESTION_FIELDS.filter((f) => values[f.key].trim() || eruv[f.key])
  const empty = ERUV_SUGGESTION_FIELDS.filter((f) => !filled.includes(f))

  return (
    <div className="space-y-4" data-testid="editor-list">
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <div className="flex items-center gap-3 px-1">
        <CategoryIcon icon="" initials={initialsOf(eruv.name)} shape="square" color={color} className="h-11 w-11 shrink-0 text-lg" sizePx={44} />
        <p className="min-w-0 flex-1 text-[16px] font-extrabold text-slate-900">{eruv.name}</p>
      </div>
      <ul className="space-y-2">
        {filled.map((f) => (
          <li key={f.key}>
            {openKey === f.key ? (
              openCard(f)
            ) : (
              <EditorRowCard
                onOpen={() => setOpenKey(f.key)}
                testId={`editor-row-${f.key}`}
                opens="here"
                changed={changed.has(f.key)}
                title={f.label}
                summary={values[f.key].trim() || 'Taken off'}
                tags={tags(f.key)}
              />
            )}
          </li>
        ))}
      </ul>
      {empty.length > 0 && (
        <EditorEmptyRows>
          {empty.map((f) => (
            <li key={f.key}>{openKey === f.key ? openCard(f) : <EditorAddLine onOpen={() => setOpenKey(f.key)} testId={`editor-add-${f.key}`} opens="here" title={f.label} />}</li>
          ))}
        </EditorEmptyRows>
      )}
      {errors.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
      <button type="button" onClick={send} disabled={changed.size === 0 || sending || verifying} className={SUBMIT_PILL}>
        {sendChangesLabel(changed.size, sending, verifying)}
      </button>
      {changed.size > 0 && <TurnstileWidget ref={turnstileRef} onVerify={setToken} />}
    </div>
  )
}
