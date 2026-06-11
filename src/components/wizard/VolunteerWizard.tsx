'use client'

import Wizard, { type Answers, type Step } from './Wizard'
import { submitRequest } from '@/lib/submitRequest'
import { hospitals } from '@/data/hospitals'
import type { VolunteerData } from '@/types'

const ANYWHERE = 'anywhere'

const helps = (way: string) => (a: Answers) =>
  Array.isArray(a.waysToHelp) && a.waysToHelp.includes(way)

const steps: Step[] = [
  {
    id: 'waysToHelp',
    kind: 'multi',
    question: 'How would you like to help?',
    hint: 'Tap all that apply.',
    options: [
      { value: 'meals', label: 'Cook or deliver meals', icon: '🍲' },
      { value: 'visiting', label: 'Visit patients', icon: '🫂' },
      { value: 'transportation', label: 'Give rides', icon: '🚙' },
      { value: 'housing', label: 'Host a family', icon: '🛏️' },
      { value: 'other', label: 'Something else', icon: '❤️' },
    ],
  },
  {
    id: 'waysToHelpOther',
    kind: 'textarea',
    when: helps('other'),
    question: 'How else would you like to help?',
    placeholder: 'Tell us…',
  },

  // ── Meals ─────────────────────────────────────────────────────────────────
  {
    id: 'meals_kosher',
    kind: 'text',
    when: helps('meals'),
    optional: true,
    question: 'What kosher standard do you keep?',
    placeholder: 'e.g. Glatt, Chalav Yisrael, OU…',
  },

  // ── Visiting ────────────────────────────────────────────────────────────────
  {
    id: 'visiting_gender',
    kind: 'single',
    when: helps('visiting'),
    optional: true,
    question: 'Your gender?',
    hint: 'Optional — helps us match patients who have a preference.',
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'preferNotToSay', label: 'Prefer not to say' },
    ],
  },

  // ── Transportation ────────────────────────────────────────────────────────
  {
    id: 'transport_passengers',
    kind: 'number',
    when: helps('transportation'),
    optional: true,
    question: 'How many passengers can you take?',
    placeholder: 'e.g. 3',
  },

  // ── Hosting ───────────────────────────────────────────────────────────────
  {
    id: 'housing_type',
    kind: 'single',
    when: helps('housing'),
    optional: true,
    question: 'What best describes your home?',
    options: [
      { value: 'family', label: 'Family' },
      { value: 'fullyMale', label: 'All male' },
      { value: 'fullyFemale', label: 'All female' },
      { value: 'mixedGender', label: 'Mixed' },
    ],
  },
  {
    id: 'housing_beds',
    kind: 'number',
    when: helps('housing'),
    optional: true,
    question: 'How many guests can you sleep?',
    placeholder: 'e.g. 3',
  },
  {
    id: 'housing_address',
    kind: 'text',
    when: helps('housing'),
    optional: true,
    question: 'What’s your address?',
    placeholder: 'Street, city, zip',
  },

  // ── Common ────────────────────────────────────────────────────────────────
  {
    id: 'areas',
    kind: 'multi',
    question: 'Where can you help?',
    options: [
      ...hospitals.map((h) => ({ value: h.id, label: h.name })),
      { value: ANYWHERE, label: 'Anywhere in the Philadelphia area' },
    ],
  },
  {
    id: 'availability',
    kind: 'multi',
    question: 'When are you usually free?',
    options: [
      { value: 'weekdayMornings', label: 'Weekday mornings' },
      { value: 'weekdayAfternoons', label: 'Weekday afternoons' },
      { value: 'weekdayEvenings', label: 'Weekday evenings' },
      { value: 'weekends', label: 'Weekends' },
      { value: 'flexible', label: 'Flexible / varies' },
    ],
  },
  {
    id: 'hasCar',
    kind: 'single',
    question: 'Do you have a car you could use to help?',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'sometimes', label: 'Sometimes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    id: 'notes',
    kind: 'textarea',
    optional: true,
    question: 'Anything else you’d like us to know?',
    hint: 'Languages you speak, experience, anything else.',
    placeholder: 'Optional',
  },
  {
    id: 'name',
    kind: 'text',
    question: 'What’s your name?',
    placeholder: 'Your full name',
  },
  {
    id: 'phone',
    kind: 'tel',
    question: 'Best number to reach you?',
    placeholder: '(215) 555-0100',
  },
]

type Props = {
  preselect?: string[]
  onClose: () => void
}

export default function VolunteerWizard({ preselect, onClose }: Props) {
  const initial: Answers = preselect && preselect.length ? { waysToHelp: preselect } : {}

  const handleSubmit = async (a: Answers) => {
    const str = (id: string) => (typeof a[id] === 'string' ? (a[id] as string) : '')
    const arr = (id: string) => (Array.isArray(a[id]) ? (a[id] as string[]) : [])
    const accessibility = arr('housing_accessibility')

    const contact = {
      fullName: str('name'),
      phone: str('phone'),
      email: '',
      preferredContact: '',
      hospitalId: '',
      unitFloorRoom: '',
    }

    const volunteer: VolunteerData = {
      waysToHelp: arr('waysToHelp'),
      waysToHelpOther: str('waysToHelpOther'),
      hospitals: arr('areas'),
      availability: arr('availability'),
      hasCar: str('hasCar'),
      notes: str('notes'),
      visiting: { gender: str('visiting_gender'), ageGroup: '' },
      meals: { kosherStandard: str('meals_kosher') },
      transportation: { maxPassengers: str('transport_passengers') },
      housing: {
        apartmentType: str('housing_type'),
        numberOfRooms: '',
        numberOfBeds: str('housing_beds'),
        address: str('housing_address'),
        wheelchairAccessible: accessibility.includes('wheelchair'),
        elevatorInBuilding: accessibility.includes('elevator'),
        maxDays: '',
      },
    }

    await submitRequest('Volunteer', contact, volunteer)
  }

  return (
    <Wizard
      steps={steps}
      initial={initial}
      onSubmit={handleSubmit}
      onClose={onClose}
      submitLabel="Sign me up"
      successTitle="Thank you"
      successMessage="We’ve added you to our volunteer list and will reach out when there’s a need that matches what you can offer."
    />
  )
}
