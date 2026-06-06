'use client'

import { useState } from 'react'
import type { ContactHospitalData, TransportationData } from '@/types'
import { submitRequest } from '@/lib/submitRequest'
import { validateContact } from '@/lib/validation'
import { SectionDivider, SubmitButton } from './FormControls'
import ContactHospitalSection from './ContactHospitalSection'
import TransportationSection from './TransportationSection'

type Props = {
  hospitalId: string
  onClose: () => void
}

function makeContact(hospitalId: string): ContactHospitalData {
  return { fullName: '', phone: '', email: '', preferredContact: '', hospitalId, unitFloorRoom: '' }
}

function makeTransportation(): TransportationData {
  return {
    rides: [{
      pickup: '', destination: '', date: '', time: '',
      recurring: false, endDate: '', numberOfPassengers: '', notes: '',
    }],
  }
}

export default function TransportationForm({ hospitalId, onClose }: Props) {
  const [contact, setContact] = useState<ContactHospitalData>(() => makeContact(hospitalId))
  const [transportation, setTransportation] = useState<TransportationData>(makeTransportation)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateContact(contact)
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    setSubmitting(true)
    try {
      await submitRequest('Transportation', contact, { ...transportation })
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
        <p className="text-sm text-muted mb-4">We'll be in touch shortly to coordinate your transportation.</p>
        <button onClick={onClose} className="bg-primary text-white font-semibold px-5 py-2 rounded-md cursor-pointer hover:bg-primary-dark transition-colors">
          Close
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <ContactHospitalSection data={contact} onChange={setContact} />
      <SectionDivider title="Ride Details" icon="🚗" />
      <TransportationSection data={transportation} onChange={setTransportation} />
      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-0.5">
          {errors.map((err, i) => <p key={i} className="text-sm text-red-600">{err}</p>)}
        </div>
      )}
      <SubmitButton submitting={submitting} />
    </form>
  )
}
