'use client'

import { useState } from 'react'
import type { CategorySubmissionPayload } from '@/types'
import AddressInput, { type PlaceSelectResult } from '@/components/intake/AddressInput'
import UpButton from '@/components/UpButton'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget from '@/components/TurnstileWidget'

type Props = {
  onUp: () => void
  onSubmitted: () => void
}

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary'

// Lets anyone propose a brand-new category (e.g. "Dentists"). Because a category
// is usually requested with a specific place in mind, the form also captures its
// first listing. On approval, the category and its first listing are created.
export default function CategoryForm({ onUp, onSubmitted }: Props) {
  const [label, setLabel] = useState('')
  const [keywords, setKeywords] = useState('')

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const [submitterName, setSubmitterName] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState(false)

  // Picking a business from the address autocomplete fills in its name + phone,
  // the same way the regular "add a listing" form does.
  function handlePlaceSelect(result: PlaceSelectResult) {
    if (result.name) setName(result.name)
    if (result.phone) setPhone(result.phone)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors([])

    const payload: CategorySubmissionPayload = {
      label,
      // Stored as the category's description, but its real job is search: these
      // words feed the keyword index so the card surfaces for related searches.
      description: keywords.trim() || undefined,
      firstListing: {
        name,
        anchorId: 'all',
        distance: null,
        address,
        phone,
        geo: coords,
      },
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
        body: JSON.stringify({ operation: 'create', targetType: 'category', payload, submittedBy, company: honeypot, turnstileToken }),
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
        <UpButton label="All resources" onClick={onSubmitted} />
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-2xl mb-2">🙏</p>
          <h2 className="text-lg font-semibold text-green-800 mb-1">Thank you!</h2>
          <p className="text-sm text-green-700">
            Your category suggestion was received and will appear once it&apos;s reviewed and approved.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />

      <h2 className="text-xl font-semibold text-slate-800 mb-1">Suggest a new category</h2>
      <p className="text-sm text-muted mb-5">
        Don&apos;t see the right category? Suggest one and add the first place. New categories are
        reviewed before they appear.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Honeypot value={honeypot} onChange={setHoneypot} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Category name *</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="e.g. Dentists, Car Repair" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Search keywords</label>
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={inputClass} placeholder="e.g. shul, minyan, davening" />
          <p className="text-xs text-muted mt-1">
            Words people might search to find this — the category will come up for these, not just its exact name. Separate them with commas.
          </p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">First listing in this category</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Address *</label>
              <AddressInput
                value={address}
                onChange={setAddress}
                onCoords={setCoords}
                onPlaceSelect={handlePlaceSelect}
                includedPrimaryTypes={['establishment']}
                placeholder="Search by business name or address…"
              />
              <p className="text-xs text-muted mt-1">Find the place to auto-fill its name and phone. Distance is calculated from the address.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Dr. Cohen, DDS" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="(215) 555-0100" />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Your information</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name (optional)</label>
              <input value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email (optional)</label>
              <input type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {errors.length > 0 && (
          <ul className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 list-disc list-inside space-y-0.5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}

        <TurnstileWidget onVerify={setTurnstileToken} />

        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto bg-primary text-white font-medium px-5 py-2.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>
      </div>
    </div>
  )
}

