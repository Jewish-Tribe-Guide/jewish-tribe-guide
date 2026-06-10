'use client'

import { useState } from 'react'
import type { ContactHospitalData } from '@/types'
import { submitRequest } from '@/lib/submitRequest'
import { validateContact } from '@/lib/validation'
import { Field, TextInput, SectionDivider, SubmitButton } from './FormControls'

type Props = {
  onClose: () => void
  onSubmitted?: () => void
}

function makeContact(): ContactHospitalData {
  return { fullName: '', phone: '', email: '', preferredContact: '', hospitalId: '', unitFloorRoom: '' }
}

export default function VolunteerRemovalForm({ onClose, onSubmitted }: Props) {
  const [contact, setContact] = useState<ContactHospitalData>(makeContact)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const setContactField = <K extends keyof ContactHospitalData>(key: K, value: ContactHospitalData[K]) =>
    setContact({ ...contact, [key]: value })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateContact(contact)
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    setSubmitting(true)
    try {
      await submitRequest('Volunteer Removal', contact, { reason: reason.trim() })
      setSubmitted(true)
      onSubmitted?.()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Something went wrong. Please try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">✓</div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Request Received</h3>
        <p className="text-sm text-muted mb-4">
          We&apos;ve received your removal request and will take you off the volunteer list shortly.
          Thank you for everything you&apos;ve done for the community.
        </p>
        <button onClick={onClose} className="bg-primary text-white font-semibold px-5 py-2 rounded-md cursor-pointer hover:bg-primary-dark transition-colors">
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <SectionDivider title="Your Contact Info" icon="👤" />
      <p className="text-sm text-muted -mt-2">
        We&apos;ll use this to find your record. Please use the same name and phone number you signed up with.
      </p>

      <Field label="Name" required>
        <TextInput
          value={contact.fullName}
          onChange={(e) => setContactField('fullName', e.target.value)}
          placeholder="Your full name"
          autoComplete="name"
        />
      </Field>

      <Field label="Phone" required>
        <TextInput
          type="tel"
          value={contact.phone}
          onChange={(e) => setContactField('phone', e.target.value)}
          placeholder="(215) 555-0100"
          autoComplete="tel"
        />
      </Field>

      <Field label="Email (optional)">
        <TextInput
          type="email"
          value={contact.email}
          onChange={(e) => setContactField('email', e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </Field>

      <SectionDivider title="Reason (optional)" icon="📝" />

      <Field label="Why are you removing yourself?">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Moving out of the city, schedule changed…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </Field>

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-0.5">
          {errors.map((err, i) => <p key={i} className="text-sm text-red-600">{err}</p>)}
        </div>
      )}
      <SubmitButton submitting={submitting} label="Submit Removal Request" />
    </form>
    </div>
  )
}
