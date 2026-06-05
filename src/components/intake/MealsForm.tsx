'use client'

import { useState } from 'react'
import type { ContactHospitalData, MealsData } from '@/types'
import ContactHospitalSection from './ContactHospitalSection'
import MealsSection from './MealsSection'

type Props = {
  hospitalId: string
  onClose: () => void
}

function makeContact(hospitalId: string): ContactHospitalData {
  return { fullName: '', phone: '', email: '', hospitalId, unitFloorRoom: '' }
}

function makeMeals(): MealsData {
  return {
    mealsFor: '',
    numberOfPeople: '',
    numberOfDays: '',
    mealTypes: [],
    dietaryRequirements: [],
    dietaryOther: '',
    hechsher: '',
    notes: '',
  }
}

export default function MealsForm({ hospitalId, onClose }: Props) {
  const [contact, setContact] = useState<ContactHospitalData>(() => makeContact(hospitalId))
  const [meals, setMeals] = useState<MealsData>(makeMeals)
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: string[] = []
    if (!contact.fullName.trim()) errs.push('Name is required.')
    if (!contact.phone.trim() && !contact.email.trim())
      errs.push('Phone or email is required.')
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    console.log('Meals request:', JSON.stringify({ contact, meals }, null, 2))
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Request Submitted</h3>
        <p className="text-sm text-muted mb-4">
          We'll be in touch shortly to coordinate your meals.
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

      <MealsSection data={meals} onChange={setMeals} />

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-0.5">
          {errors.map((err, i) => (
            <p key={i} className="text-sm text-red-600">{err}</p>
          ))}
        </div>
      )}

      <button
        type="submit"
        className="w-full bg-primary hover:bg-primary-dark text-white font-semibold px-6 py-3 rounded-md shadow transition-colors cursor-pointer"
      >
        Submit Request
      </button>
    </form>
  )
}
