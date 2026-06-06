'use client'

import { useState } from 'react'
import type { IntakeFormData } from '@/types'
import { submitRequest } from '@/lib/submitRequest'
import { validateContact } from '@/lib/validation'
import {
  Field, TextInput, Textarea, SelectInput, CheckboxGroup, RadioGroup,
  SectionDivider, ServiceSection, SubmitButton,
} from './FormControls'
import ContactHospitalSection from './ContactHospitalSection'
import MealsSection from './MealsSection'
import TransportationSection from './TransportationSection'
import FamilyHousingSection from './FamilyHousingSection'
import VisitorsSection from './VisitorsSection'

// ── Initial state ─────────────────────────────────────────────────────────────

function makeInitialData(hospitalId: string): IntakeFormData {
  return {
    contact: {
      fullName: '',
      phone: '',
      email: '',
      preferredContact: '',
      hospitalId,
      unitFloorRoom: '',
    },
    patientName: '',
    relationship: '',
    situation: '',
    assistanceNeeded: [],
    timing: '',
    specificDate: '',
    additionalInfo: '',
    meals: {
      mealsFor: '',
      numberOfPeople: '',
      startDate: '',
      endDate: '',
      mealTypes: [],
      dietaryRequirements: [],
      dietaryOther: '',
      hechsher: '',
      notes: '',
    },
    transportation: {
      rides: [{
        pickup: '', destination: '', date: '', time: '',
        recurring: false, endDate: '', numberOfPassengers: '', notes: '',
      }],
    },
    familyHousing: {
      housingFor: '',
      numberOfAdults: '',
      numberOfChildren: '',
      arrivalDate: '',
      departureDate: '',
      maxDistance: '',
      transportationAvailable: '',
      accommodationRequirements: [],
      accessibilityRequirements: [],
      accessibilityOther: '',
      notes: '',
    },
    visitors: {
      patientName: '',
      patientAgeGroup: '',
      visitorType: [],
      visitorTypeOther: '',
      visitFrequency: '',
      bestTimes: [],
      bestTimesOther: '',
      genderPreference: '',
      startDate: '',
      additionalInfo: '',
    },
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  hospitalId: string
  hospitalName: string
  onBack: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IntakeForm({ hospitalId, hospitalName, onBack }: Props) {
  const [form, setForm] = useState<IntakeFormData>(() => makeInitialData(hospitalId))
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const update = <K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const has = (service: string) => form.assistanceNeeded.includes(service)

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateContact(form.contact)
    if (form.assistanceNeeded.length === 0)
      errs.push('Please select at least one type of assistance.')
    if (!form.timing) errs.push('Please select a timing preference.')
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    setSubmitting(true)
    try {
      const { contact, ...formData } = form
      await submitRequest('Direct Support', contact, formData)
      setSubmitted(true)
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Something went wrong. Please try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success view ────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div>
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="text-center py-12">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-semibold text-slate-800 mb-2">Request Submitted</h2>
          <p className="text-muted mb-1">A community representative will reach out to you shortly.</p>
          <p className="text-muted text-sm mb-8">For urgent needs, please call the Bikur Cholim line directly.</p>
          <button onClick={onBack} className="bg-primary text-white font-semibold px-6 py-2.5 rounded-md shadow hover:bg-primary-dark transition-colors cursor-pointer">
            Back to Get Assistance
          </button>
        </div>
      </div>
    )
  }

  // ── Form view ───────────────────────────────────────────────────────────────

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Request Direct Support</h2>
        <p className="text-sm text-muted mt-0.5">{hospitalName}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-4">

          {/* ── Contact + Hospital + Preferred Contact ──────────────────────── */}
          <ContactHospitalSection
            data={form.contact}
            onChange={(d) => update('contact', d)}
          />

          {/* ── Patient Information ──────────────────────────────────────────── */}
          <SectionDivider title="Patient Information" icon="🏥" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Patient Name (optional)">
              <TextInput
                value={form.patientName}
                onChange={(e) => update('patientName', e.target.value)}
                placeholder="Patient's full name"
              />
            </Field>
            <Field label="Your relationship to the patient">
              <SelectInput
                value={form.relationship}
                onChange={(e) => update('relationship', e.target.value)}
                options={['Self', 'Spouse', 'Parent', 'Child', 'Relative', 'Friend', 'Other'].map((r) => ({
                  value: r.toLowerCase(), label: r,
                }))}
              />
            </Field>
          </div>

          {/* ── Situation ────────────────────────────────────────────────────── */}
          <SectionDivider title="Situation" icon="📝" />
          <Field label="Brief description of the situation">
            <Textarea
              rows={4}
              value={form.situation}
              onChange={(e) => update('situation', e.target.value)}
              placeholder="Please share what's happening so we can best support you…"
            />
          </Field>

          {/* ── Assistance Needed ─────────────────────────────────────────────── */}
          <SectionDivider title="Assistance Needed" icon="🤲" required />
          <CheckboxGroup
            columns={2}
            options={[
              { value: 'meals', label: 'Meals' },
              { value: 'visitors', label: 'Visitors' },
              { value: 'familyHousing', label: 'Family Housing' },
              { value: 'transportation', label: 'Transportation' },
              { value: 'other', label: 'Other' },
            ]}
            selected={form.assistanceNeeded}
            onChange={(v) => update('assistanceNeeded', v)}
          />

          {has('meals') && (
            <ServiceSection title="Meals" icon="🍽️">
              <MealsSection data={form.meals} onChange={(d) => update('meals', d)} />
            </ServiceSection>
          )}
          {has('transportation') && (
            <ServiceSection title="Transportation" icon="🚗">
              <TransportationSection data={form.transportation} onChange={(d) => update('transportation', d)} />
            </ServiceSection>
          )}
          {has('familyHousing') && (
            <ServiceSection title="Family Housing" icon="🏠">
              <FamilyHousingSection data={form.familyHousing} onChange={(d) => update('familyHousing', d)} />
            </ServiceSection>
          )}
          {has('visitors') && (
            <ServiceSection title="Visitors" icon="🤝">
              <VisitorsSection data={form.visitors} onChange={(d) => update('visitors', d)} />
            </ServiceSection>
          )}

          {/* ── Timing ───────────────────────────────────────────────────────── */}
          <SectionDivider title="Timing" icon="🕐" required />
          <RadioGroup
            name="timing"
            columns={2}
            options={[
              { value: 'asap', label: 'ASAP' },
              { value: '24hours', label: 'Within 24 Hours' },
              { value: 'thisWeek', label: 'This Week' },
              { value: 'flexible', label: 'Flexible' },
              { value: 'specificDate', label: 'Specific Date' },
            ]}
            value={form.timing}
            onChange={(v) => update('timing', v)}
          />
          {form.timing === 'specificDate' && (
            <Field label="Specific date">
              <TextInput
                type="date"
                value={form.specificDate}
                onChange={(e) => update('specificDate', e.target.value)}
              />
            </Field>
          )}

          {/* ── Additional Information ────────────────────────────────────────── */}
          <SectionDivider title="Additional Information" icon="💬" />
          <Field label="Anything else you'd like us to know">
            <Textarea
              rows={4}
              value={form.additionalInfo}
              onChange={(e) => update('additionalInfo', e.target.value)}
              placeholder="Any other context, preferences, or requests…"
            />
          </Field>

          {/* ── Validation errors ─────────────────────────────────────────────── */}
          {errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700 mb-1">Please fix the following:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {errors.map((err, i) => <li key={i} className="text-sm text-red-600">{err}</li>)}
              </ul>
            </div>
          )}

          {/* ── Submit ─────────────────────────────────────────────────────────── */}
          <div className="pb-8">
            <SubmitButton submitting={submitting} />
          </div>

        </div>
      </form>
    </div>
  )
}
