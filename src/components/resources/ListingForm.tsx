'use client'

import { useState } from 'react'
import { fieldIsVisible, type CategoryConfig, type CategoryField } from '@/lib/categories'
import type { DirectoryResource, ResourceSubmission } from '@/types'
import TagsInput from './TagsInput'
import AddressInput from '@/components/intake/AddressInput'
import HoursInput from '@/components/intake/HoursInput'
import MinyanimInput from '@/components/intake/MinyanimInput'

type Props = {
  /** The category this listing belongs to (fixed by where the form was opened). */
  category: CategoryConfig
  mode: 'create' | 'edit'
  /** Existing listing to pre-fill, when editing. */
  existing?: DirectoryResource
  onBack: () => void
  onSubmitted: () => void
}

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary'

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  )
}

export default function ListingForm({ category, mode, existing, onBack, onSubmitted }: Props) {
  const config = category
  const community = !!category.community

  const [name, setName] = useState(existing?.name ?? '')
  const [address, setAddress] = useState(existing?.address ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    (existing?.geo as { lat: number; lng: number } | undefined) ?? null,
  )
  const [details, setDetails] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const field of config?.detailFields ?? []) {
      if (existing && field.key in existing) init[field.key] = existing[field.key]
    }
    return init
  })
  const [submitterName, setSubmitterName] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState(false)

  function setDetail(key: string, value: unknown) {
    setDetails((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors([])

    // Only submit values for fields that are actually shown (respects showIf and
    // community categories that hide hospital/address/distance/phone).
    const visibleDetails: Record<string, unknown> = {}
    for (const field of config.detailFields) {
      if (fieldIsVisible(field, details)) visibleDetails[field.key] = details[field.key]
    }

    const payload: ResourceSubmission = {
      category: category.id,
      name,
      // Listings aren't hospital-scoped anymore; distance is computed from the
      // geocoded address. Community categories have no address at all.
      hospitalId: community ? 'community' : 'all',
      distance: null,
      address: community ? '' : address,
      phone: community ? '' : phone,
      details: visibleDetails,
      geo: community ? null : coords,
    }
    const submittedBy =
      submitterName.trim() || submitterEmail.trim()
        ? { name: submitterName.trim() || undefined, email: submitterEmail.trim() || undefined }
        : undefined

    setSubmitting(true)
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: mode === 'edit' ? 'update' : 'create',
          targetType: 'listing',
          targetId: mode === 'edit' ? existing?.id : undefined,
          payload,
          submittedBy,
        }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        setErrors(body.errors ?? ['Something went wrong. Please try again.'])
        return
      }
      setDone(true)
    } catch {
      setErrors(['Network error. Please check your connection and try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div>
        <BackButton onBack={onSubmitted} />
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-2xl mb-2">🙏</p>
          <h2 className="text-lg font-semibold text-green-800 mb-1">Thank you!</h2>
          <p className="text-sm text-green-700">
            Your {mode === 'edit' ? 'suggested edit' : 'submission'} was received and will appear once
            it&apos;s reviewed and approved.
          </p>
        </div>
      </div>
    )
  }

  const heading =
    mode === 'edit' ? 'Suggest an edit' : `Add a ${config?.label ?? 'listing'}`

  return (
    <div>
      <BackButton onBack={onBack} />

      <h2 className="text-xl font-semibold text-slate-800 mb-1">{heading}</h2>
      <p className="text-sm text-muted mb-5">
        {mode === 'edit'
          ? 'Change what’s wrong below. Edits are reviewed before they go live.'
          : 'New listings are reviewed before they appear on the site.'}
      </p>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Kosher Mart" />
        </div>

        {!community && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Address *</label>
              <AddressInput value={address} onChange={setAddress} onCoords={setCoords} placeholder="Start typing an address…" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="(215) 555-0100" />
            </div>
          </>
        )}

        {config.detailFields.some((f) => fieldIsVisible(f, details)) && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            {config.detailFields
              .filter((field) => fieldIsVisible(field, details))
              .map((field) => (
                <DetailFieldInput key={field.key} field={field} value={details[field.key]} onChange={(v) => setDetail(field.key, v)} />
              ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 pt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your name (optional)</label>
            <input value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your email (optional)</label>
            <input type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} className={inputClass} />
          </div>
        </div>

        {errors.length > 0 && (
          <ul className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 list-disc list-inside space-y-0.5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto bg-primary text-white font-medium px-5 py-2.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {submitting ? 'Submitting…' : mode === 'edit' ? 'Submit edit for review' : 'Submit for review'}
        </button>
      </form>
      </div>
    </div>
  )
}

function DetailFieldInput({
  field,
  value,
  onChange,
}: {
  field: CategoryField
  value: unknown
  onChange: (value: unknown) => void
}) {
  const label = `${field.label}${field.required ? ' *' : ''}`

  if (field.type === 'tags') {
    return <TagsInput field={field} value={(value as string[]) ?? []} onChange={onChange} />
  }

  if (field.type === 'url') {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <input
          type="url"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? 'https://…'}
          className={inputClass}
        />
        {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      </div>
    )
  }

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
        />
        <span className="text-sm font-medium text-slate-700">{field.label}</span>
      </label>
    )
  }

  if (field.type === 'hours') {
    return <HoursInput label={label} value={value} onChange={onChange} />
  }

  if (field.type === 'minyanim') {
    return <MinyanimInput label={label} value={value} onChange={onChange} />
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder} className={inputClass} />
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={field.type === 'number' ? 'number' : field.type === 'tel' ? 'tel' : 'text'}
        value={(value as string) ?? ''}
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={field.placeholder}
        className={inputClass}
      />
      {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
    </div>
  )
}
