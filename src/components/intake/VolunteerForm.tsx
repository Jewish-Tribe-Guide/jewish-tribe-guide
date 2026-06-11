'use client'

import { useState } from 'react'
import type { ContactHospitalData, VolunteerData } from '@/types'
import { submitRequest } from '@/lib/submitRequest'
import { validateContact } from '@/lib/validation'
import { Field, TextInput, RadioGroup, SectionDivider, SubmitButton } from './FormControls'
import VolunteerSection from './VolunteerSection'

type Props = {
  onClose: () => void
  /** Fires once the form has been submitted successfully (e.g. so a parent
   *  intro banner can hide itself once the thank-you screen takes over). */
  onSubmitted?: () => void
  /** 'signup' (default) — new volunteer registration.
   *  'edit' — update an existing commitment; shows a restate-everything warning
   *  and submits as 'Volunteer Edit'. */
  mode?: 'signup' | 'edit'
  /** Ways-to-help boxes to pre-check (e.g. ['meals'] when arriving via the
   *  "Cook a Meal" card) — opens the form with that service's section showing. */
  preselect?: string[]
}

function makeContact(): ContactHospitalData {
  return { fullName: '', phone: '', email: '', preferredContact: '', hospitalId: '', unitFloorRoom: '' }
}

function makeVolunteer(preselect: string[] = []): VolunteerData {
  return {
    waysToHelp: preselect,
    waysToHelpOther: '',
    hospitals: [],
    availability: [],
    hasCar: '',
    notes: '',
    visiting: { gender: '', ageGroup: '' },
    meals: { kosherStandard: '' },
    transportation: { maxPassengers: '' },
    housing: {
      apartmentType: '',
      numberOfRooms: '',
      numberOfBeds: '',
      address: '',
      wheelchairAccessible: false,
      elevatorInBuilding: false,
      maxDays: '',
    },
  }
}

export default function VolunteerForm({ onClose, onSubmitted, mode = 'signup', preselect }: Props) {
  const [contact, setContact] = useState<ContactHospitalData>(makeContact)
  const [volunteer, setVolunteer] = useState<VolunteerData>(() => makeVolunteer(preselect))
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const isEdit = mode === 'edit'

  const setContactField = <K extends keyof ContactHospitalData>(key: K, value: ContactHospitalData[K]) =>
    setContact({ ...contact, [key]: value })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateContact(contact)
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    setSubmitting(true)
    try {
      await submitRequest(isEdit ? 'Volunteer Edit' : 'Volunteer', contact, { ...volunteer })
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
        <div className="text-4xl mb-3">🙏</div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Thank You</h3>
        <p className="text-sm text-muted mb-4">
          {isEdit
            ? "We’ve received your updated commitment. We’ll apply the changes to your record shortly."
            : "We’ve added you to our volunteer list and will reach out when there’s a need that matches what you can offer."}
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

      <SectionDivider title="Contact Information" icon="👤" />

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

      <Field label="Preferred contact method">
        <RadioGroup
          name="preferredContact"
          columns={2}
          options={[
            { value: 'phone', label: 'Phone call' },
            { value: 'text', label: 'Text message' },
            { value: 'email', label: 'Email' },
          ]}
          value={contact.preferredContact}
          onChange={(v) => setContactField('preferredContact', v)}
        />
      </Field>

      <SectionDivider title="How You Can Help" icon="🤲" />
      <VolunteerSection data={volunteer} onChange={setVolunteer} />

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-0.5">
          {errors.map((err, i) => <p key={i} className="text-sm text-red-600">{err}</p>)}
        </div>
      )}
      <SubmitButton submitting={submitting} label={isEdit ? 'Update My Commitment' : 'Sign Up to Volunteer'} />
    </form>
    </div>
  )
}
