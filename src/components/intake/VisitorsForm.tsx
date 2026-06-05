'use client'

import { useState } from 'react'
import type { ContactHospitalData, VisitorsData } from '@/types'
import { submitRequest } from '@/lib/submitRequest'
import ContactHospitalSection from './ContactHospitalSection'
import VisitorsSection from './VisitorsSection'

type Props = {
  hospitalId: string
  onClose: () => void
}

function makeContact(hospitalId: string): ContactHospitalData {
  return { fullName: '', phone: '', email: '', hospitalId, unitFloorRoom: '' }
}

function makeVisitors(): VisitorsData {
  return {
    patientName: '',
    patientAgeGroup: '',
    visitorType: [],
    visitFrequency: '',
    bestTimes: [],
    bestTimesOther: '',
    genderPreference: '',
    startDate: '',
    additionalInfo: '',
  }
}

export default function VisitorsForm({ hospitalId, onClose }: Props) {
  const [contact, setContact] = useState<ContactHospitalData>(() => makeContact(hospitalId))
  const [visitors, setVisitors] = useState<VisitorsData>(makeVisitors)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: string[] = []
    if (!contact.fullName.trim()) errs.push('Name is required.')
    if (!contact.phone.trim() && !contact.email.trim())
      errs.push('Phone or email is required.')
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    setSubmitting(true)
    try {
      await submitRequest('Visitors', contact, { ...visitors })
      setSubmitted(true)
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Something went wrong. Please try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Request Submitted</h3>
        <p className="text-sm text-muted mb-4">
          We'll be in touch shortly to coordinate your visitors.
        </p>
        <button
          onClick={onClose}
          className="bg-primary text-white font-semibold px-5 py-2 rounded-md cursor-pointer hover:bg-primary-dark transition-colors"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <ContactHospitalSection data={contact} onChange={setContact} />

      <VisitorsSection data={visitors} onChange={setVisitors} />

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-0.5">
          {errors.map((err, i) => (
            <p key={i} className="text-sm text-red-600">{err}</p>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-primary hover:bg-primary-dark text-white font-semibold px-6 py-3 rounded-md shadow transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting…' : 'Submit Request'}
      </button>
    </form>
  )
}
