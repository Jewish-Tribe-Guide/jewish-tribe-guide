'use client'

import { useState } from 'react'
import type { IntakeFormData } from '@/types'
import {
  Field, Textarea, CheckboxGroup, RadioGroup, SectionDivider, ServiceSection,
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
      hospitalId,
      unitFloorRoom: '',
    },
    preferredContact: '',
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
      numberOfDays: '',
      mealTypes: [],
      dietaryRequirements: [],
      dietaryOther: '',
      hechsher: '',
      notes: '',
    },
    transportation: {
      rides: [{
        pickup: '', destination: '', date: '', time: '',
        transportationType: [], endDate: '', numberOfPassengers: '', notes: '',
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
      notes: '',
    },
    visitors: {
      visitorType: [],
      patientAgeGroup: '',
      bestTimes: '',
      notes: '',
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
  const [errors, setErrors] = useState<string[]>([])

  const update = <K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const has = (service: string) => form.assistanceNeeded.includes(service)

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: string[] = []
    if (!form.contact.fullName.trim()) errs.push('Full name is required.')
    if (!form.contact.phone.trim() && !form.contact.email.trim())
      errs.push('At least one contact method (phone or email) is required.')
    if (form.assistanceNeeded.length === 0)
      errs.push('Please select at least one type of assistance.')
    if (!form.timing) errs.push('Please select a timing preference.')
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    console.log('Intake form payload:', JSON.stringify(form, null, 2))
    setSubmitted(true)
  }

  // ── Success view ────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="text-center py-12">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-semibold text-slate-800 mb-2">Request Submitted</h2>
          <p className="text-muted mb-1">A community representative will reach out to you shortly.</p>
          <p className="text-muted text-sm mb-8">
            For urgent needs, please call the Bikur Cholim line directly.
          </p>
          <button
            onClick={onBack}
            className="bg-primary text-white font-semibold px-6 py-2.5 rounded-md shadow hover:bg-primary-dark transition-colors cursor-pointer"
          >
            Back to Get Assistance
          </button>
        </div>
      </div>
    )
  }

  // ── Form view ───────────────────────────────────────────────────────────────

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
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

          {/* ── Contact + Hospital (shared section) ──────────────────────────── */}
          <ContactHospitalSection
            data={form.contact}
            onChange={(d) => update('contact', d)}
          />

          {/* ── Preferred contact method (big-form only) ─────────────────────── */}
          <SectionDivider title="Preferred Contact Method" icon="📱" />
          <RadioGroup
            name="preferredContact"
            columns={2}
            options={[
              { value: 'phone', label: 'Phone call' },
              { value: 'text', label: 'Text message' },
              { value: 'email', label: 'Email' },
            ]}
            value={form.preferredContact}
            onChange={(v) => update('preferredContact', v)}
          />

          {/* ── Patient Information ──────────────────────────────────────────── */}
          <SectionDivider title="Patient Information" icon="🏥" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Patient Name (optional)">
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                value={form.patientName}
                onChange={(e) => update('patientName', e.target.value)}
                placeholder="Patient's full name"
              />
            </Field>
            <Field label="Your relationship to the patient">
              <div className="relative">
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none pr-8"
                  value={form.relationship}
                  onChange={(e) => update('relationship', e.target.value)}
                >
                  <option value="">Select…</option>
                  {['Self', 'Spouse', 'Parent', 'Child', 'Relative', 'Friend', 'Other'].map((r) => (
                    <option key={r} value={r.toLowerCase()}>{r}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
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
          <SectionDivider title="Assistance Needed" icon="🤲" />

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

          {/* Dynamic service sections */}
          {has('meals') && (
            <ServiceSection title="Meals" icon="🍽️">
              <MealsSection data={form.meals} onChange={(d) => update('meals', d)} />
            </ServiceSection>
          )}
          {has('transportation') && (
            <ServiceSection title="Transportation" icon="🚗">
              <TransportationSection
                data={form.transportation}
                onChange={(d) => update('transportation', d)}
              />
            </ServiceSection>
          )}
          {has('familyHousing') && (
            <FamilyHousingSection
              data={form.familyHousing}
              onChange={(d) => update('familyHousing', d)}
            />
          )}
          {has('visitors') && (
            <VisitorsSection data={form.visitors} onChange={(d) => update('visitors', d)} />
          )}

          {/* ── Timing ───────────────────────────────────────────────────────── */}
          <SectionDivider title="Timing" icon="🕐" />

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
              <input
                type="date"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
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
                {errors.map((err, i) => (
                  <li key={i} className="text-sm text-red-600">{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Submit ─────────────────────────────────────────────────────────── */}
          <div className="pt-4 pb-8">
            <button
              type="submit"
              className="w-full bg-primary hover:bg-primary-dark text-white font-semibold px-6 py-3 rounded-md shadow transition-colors cursor-pointer text-base"
            >
              Submit Request
            </button>
            <p className="text-xs text-muted text-center mt-3">
              A community representative will review your request and reach out within 24 hours.
            </p>
          </div>

        </div>
      </form>
    </div>
  )
}
