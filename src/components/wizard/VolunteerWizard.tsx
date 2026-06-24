'use client'

import Wizard, { type Answers, type Step } from './Wizard'
import { contactSteps, buildContact } from './contactSteps'
import { submitRequest } from '@/lib/submitRequest'
import { hospitals } from '@/data/hospitals'

const ANYWHERE = 'anywhere'

const MEALS = '🍲 Cooking meals'
const VISITING = '🫂 Visiting patients'
const RIDES = '🚙 Giving rides'
const HOSTING = '🛏️ Hosting a family'

const helps = (way: string) => (a: Answers) =>
  Array.isArray(a.waysToHelp) && a.waysToHelp.includes(way)

const steps: Step[] = [
  // ── Always asked (start) ────────────────────────────────────────────────────
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

  // ── Name + contact + preference (shared with the support form) ──────────────
  ...contactSteps,

  // ── Meals ─────────────────────────────────────────────────────────────────
  {
    id: 'meals_kosher',
    kind: 'text',
    section: MEALS,
    when: helps('meals'),
    question: 'What kosher standard do you keep?',
    placeholder: 'e.g. Glatt, Chalav Yisrael, OU…',
  },

  // ── Visiting ────────────────────────────────────────────────────────────────
  {
    id: 'visit_days',
    kind: 'multi',
    section: VISITING,
    when: helps('visiting'),
    question: 'Which days can you visit?',
    options: [
      { value: 'sunday', label: 'Sunday' },
      { value: 'monday', label: 'Monday' },
      { value: 'tuesday', label: 'Tuesday' },
      { value: 'wednesday', label: 'Wednesday' },
      { value: 'thursday', label: 'Thursday' },
      { value: 'friday', label: 'Friday' },
      { value: 'saturday', label: 'Saturday (Shabbat)' },
    ],
  },
  {
    id: 'visit_time',
    kind: 'multi',
    section: VISITING,
    when: helps('visiting'),
    question: 'What time of day?',
    options: [
      { value: 'morning', label: 'Morning' },
      { value: 'afternoon', label: 'Afternoon' },
      { value: 'evening', label: 'Evening' },
    ],
  },
  {
    id: 'visit_gender',
    kind: 'single',
    section: VISITING,
    when: helps('visiting'),
    question: 'What’s your gender?',
    hint: 'We ask so we can pair you with patients appropriately.',
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'preferNotToSay', label: 'Prefer not to say' },
    ],
  },
  {
    id: 'visit_age',
    kind: 'single',
    section: VISITING,
    when: helps('visiting'),
    question: 'What’s your age group?',
    hint: 'Also helps us pair you appropriately.',
    options: [
      { value: 'under18', label: 'Under 18' },
      { value: '18to30', label: '18–30' },
      { value: '31to50', label: '31–50' },
      { value: '51to65', label: '51–65' },
      { value: '65plus', label: '65+' },
    ],
  },

  // ── Rides ─────────────────────────────────────────────────────────────────
  {
    id: 'ride_passengers',
    kind: 'number',
    section: RIDES,
    when: helps('transportation'),
    question: 'How many passengers can you take?',
    placeholder: 'e.g. 3',
  },

  // ── Hosting ───────────────────────────────────────────────────────────────
  {
    id: 'host_rooms',
    kind: 'number',
    section: HOSTING,
    when: helps('housing'),
    question: 'How many rooms do you have for guests?',
    placeholder: 'e.g. 2',
  },
  {
    id: 'host_beds',
    kind: 'number',
    section: HOSTING,
    when: helps('housing'),
    question: 'How many total beds do you have?',
    placeholder: 'e.g. 3',
  },
  {
    id: 'host_address',
    kind: 'text',
    section: HOSTING,
    when: helps('housing'),
    question: 'What’s your address?',
    placeholder: 'Street, city, zip',
  },

  // ── Something else (last branch, just before the always-asked end) ──────────
  {
    id: 'waysToHelpOther',
    kind: 'textarea',
    section: '❤️ Something else',
    when: helps('other'),
    question: 'How else would you like to help?',
    placeholder: 'Tell us…',
  },

  // ── Always asked (end) ──────────────────────────────────────────────────────
  {
    id: 'areas',
    kind: 'multi',
    question: 'Where can you help?',
    hint: 'Tap all that apply.',
    options: [
      ...hospitals.map((h) => ({ value: h.id, label: h.name })),
      { value: ANYWHERE, label: 'Anywhere in the Philadelphia area' },
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

    const contact = { ...buildContact(a), hospitalId: '', unitFloorRoom: '' }

    // Volunteer signups land in the "Volunteers" sheet tab, which reads these
    // top-level fields (the rest is kept verbatim in the trailing JSON column).
    const volunteer = {
      waysToHelp: arr('waysToHelp'),
      waysToHelpOther: str('waysToHelpOther'),
      hospitals: arr('areas'),
      availability: [],
      hasCar: '',
      notes: str('notes'),
      meals: { kosherStandard: str('meals_kosher') },
      visiting: {
        days: arr('visit_days'),
        timeOfDay: arr('visit_time'),
        gender: str('visit_gender'),
        ageGroup: str('visit_age'),
      },
      transportation: { maxPassengers: str('ride_passengers') },
      housing: {
        numberOfRooms: str('host_rooms'),
        numberOfBeds: str('host_beds'),
        address: str('host_address'),
      },
    }

    await submitRequest('Volunteer', contact, volunteer, str('company'), str('turnstileToken'))
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
