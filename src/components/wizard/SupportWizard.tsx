'use client'

import Wizard, { type Answers, type Step } from './Wizard'
import { contactSteps, buildContact } from './contactSteps'
import { submitRequest } from '@/lib/submitRequest'

// One branching form for every kind of direct support. The visitor taps what
// they need; only the matching detail questions appear after that.

const has = (need: string) => (a: Answers) =>
  Array.isArray(a.needs) && a.needs.includes(need)

const MEALS = '🍽️ Meals'
const RIDE = '🚗 Ride'
const STAY = '🏠 Place to stay'
const VISIT = '🤝 Visit'

const hospitalRoomStep = (when: (a: Answers) => boolean, section: string): Step => ({
  id: 'hospital_room',
  kind: 'text',
  section,
  when,
  question: 'Which hospital and room?',
  placeholder: 'e.g. Jefferson, room 412',
})

const steps: Step[] = [
  // ── Always asked (start) ────────────────────────────────────────────────────
  {
    id: 'needs',
    kind: 'multi',
    question: 'What do you need?',
    hint: 'Tap all that apply.',
    options: [
      { value: 'meals', label: 'Meals', icon: '🍽️' },
      { value: 'transportation', label: 'A ride', icon: '🚗' },
      { value: 'familyHousing', label: 'A place to stay', icon: '🏠' },
      { value: 'visitors', label: 'Someone to visit', icon: '🤝' },
      { value: 'other', label: 'Something else', icon: '✨' },
    ],
  },

  // ── Name + contact + preference (shared with the volunteer form) ────────────
  ...contactSteps,

  // ── Meals ─────────────────────────────────────────────────────────────────
  hospitalRoomStep(has('meals'), MEALS),
  {
    id: 'meals_which',
    kind: 'multi',
    section: MEALS,
    when: has('meals'),
    question: 'Which meals?',
    options: [
      { value: 'breakfast', label: 'Breakfast' },
      { value: 'lunch', label: 'Lunch' },
      { value: 'dinner', label: 'Dinner' },
      { value: 'shabbatYomTov', label: 'Shabbat / Yom Tov' },
    ],
  },
  {
    id: 'meals_dietary',
    kind: 'multi',
    section: MEALS,
    when: has('meals'),
    optional: true,
    question: 'Any dietary needs?',
    options: [
      { value: 'standardKosher', label: 'Standard Kosher' },
      { value: 'glattKosher', label: 'Glatt Kosher' },
      { value: 'cholovYisroel', label: 'Cholov Yisroel' },
      { value: 'vegetarian', label: 'Vegetarian' },
      { value: 'vegan', label: 'Vegan' },
      { value: 'allergies', label: 'Allergies (note below)' },
    ],
  },
  {
    id: 'meals_count',
    kind: 'number',
    section: MEALS,
    when: has('meals'),
    question: 'How many people are we feeding?',
    placeholder: 'e.g. 4',
  },
  {
    id: 'meals_notes',
    kind: 'textarea',
    section: MEALS,
    when: has('meals'),
    optional: true,
    question: 'Anything else about the meals?',
    placeholder: 'Allergies, hechsher preferences, special requests…',
  },

  // ── Ride ────────────────────────────────────────────────────────────────────
  {
    id: 'ride_pickup',
    kind: 'text',
    section: RIDE,
    when: has('transportation'),
    question: 'Where is the pickup location?',
    placeholder: 'Pickup address',
  },
  {
    id: 'ride_dropoff',
    kind: 'text',
    section: RIDE,
    when: has('transportation'),
    question: 'Where’s the dropoff location?',
    placeholder: 'Destination',
  },
  {
    id: 'ride_when',
    kind: 'text',
    section: RIDE,
    when: has('transportation'),
    question: 'When do you need the ride?',
    placeholder: 'Day and time — e.g. Tuesday at 9am',
  },
  {
    id: 'ride_passengers',
    kind: 'number',
    section: RIDE,
    when: has('transportation'),
    optional: true,
    question: 'How many passengers?',
    placeholder: 'e.g. 2',
  },
  {
    id: 'ride_notes',
    kind: 'textarea',
    section: RIDE,
    when: has('transportation'),
    optional: true,
    question: 'Anything else about the ride?',
    placeholder: 'Optional',
  },

  // ── Place to stay ───────────────────────────────────────────────────────────
  {
    id: 'stay_dates',
    kind: 'text',
    section: STAY,
    when: has('familyHousing'),
    question: 'When would you arrive and leave?',
    placeholder: 'e.g. Thursday night through Sunday',
  },
  {
    id: 'stay_distance',
    kind: 'text',
    section: STAY,
    when: has('familyHousing'),
    optional: true,
    question: 'How close to the hospital do you need to be?',
    placeholder: 'e.g. walking distance, or within 10 minutes',
  },
  {
    id: 'stay_accessibility',
    kind: 'text',
    section: STAY,
    when: has('familyHousing'),
    optional: true,
    question: 'Any accessibility needs?',
    placeholder: 'e.g. no stairs, wheelchair accessible',
  },
  {
    id: 'stay_location_pref',
    kind: 'text',
    section: STAY,
    when: has('familyHousing'),
    optional: true,
    question: 'Any preference on where you stay?',
    placeholder: 'e.g. a family home, women’s only, near a shul',
  },
  {
    id: 'stay_notes',
    kind: 'textarea',
    section: STAY,
    when: has('familyHousing'),
    optional: true,
    question: 'Anything else about the place to stay?',
    placeholder: 'Optional',
  },

  // ── Visit ─────────────────────────────────────────────────────────────────
  // Hospital + room, but only if the meals branch didn't already ask it.
  hospitalRoomStep((a) => has('visitors')(a) && !has('meals')(a), VISIT),
  {
    id: 'visit_type',
    kind: 'multi',
    section: VISIT,
    when: has('visitors'),
    question: 'What kind of visit?',
    options: [
      { value: 'friendlyVisit', label: 'A friendly visit' },
      { value: 'spiritualSupport', label: 'Spiritual support' },
      { value: 'chaplainVisit', label: 'Jewish chaplain' },
      { value: 'learningPartner', label: 'Learning partner' },
      { value: 'minyanAssistance', label: 'Minyan help' },
    ],
  },
  {
    id: 'visit_time',
    kind: 'multi',
    section: VISIT,
    when: has('visitors'),
    optional: true,
    question: 'What time of day?',
    options: [
      { value: 'morning', label: 'Morning' },
      { value: 'afternoon', label: 'Afternoon' },
      { value: 'evening', label: 'Evening' },
    ],
  },
  {
    id: 'visit_frequency',
    kind: 'single',
    section: VISIT,
    when: has('visitors'),
    optional: true,
    question: 'How often?',
    options: [
      { value: 'oneTime', label: 'One time' },
      { value: 'daily', label: 'Daily' },
      { value: 'severalPerWeek', label: 'A few times a week' },
      { value: 'flexible', label: 'Flexible' },
    ],
  },

  // ── Something else (last branch, just before the always-asked end) ──────────
  {
    id: 'otherNeed',
    kind: 'textarea',
    section: '✨ Something else',
    when: has('other'),
    question: 'What else can we help with?',
    placeholder: 'Tell us what you need…',
  },

  // ── Always asked (end) ──────────────────────────────────────────────────────
  {
    id: 'additionalInfo',
    kind: 'textarea',
    optional: true,
    question: 'Anything else we should know?',
    placeholder: 'Optional',
  },
]

type Props = {
  preselect?: string[]
  onClose: () => void
}

export default function SupportWizard({ preselect, onClose }: Props) {
  const initial: Answers = preselect && preselect.length ? { needs: preselect } : {}

  const handleSubmit = async (a: Answers) => {
    const str = (id: string) => (typeof a[id] === 'string' ? (a[id] as string) : '')
    const arr = (id: string) => (Array.isArray(a[id]) ? (a[id] as string[]) : [])

    const hospitalRoom = str('hospital_room')
    const contact = {
      ...buildContact(a),
      // No structured hospital id anymore — store the free-typed "hospital + room"
      // here so it still shows in the admin sheet's Hospital column.
      hospitalId: hospitalRoom,
      unitFloorRoom: '',
    }

    const needs = arr('needs')
    const include = (need: string, blob: Record<string, unknown>) =>
      needs.includes(need) ? blob : undefined

    const formData = {
      needs,
      hospitalRoom,
      otherNeed: str('otherNeed'),
      additionalInfo: str('additionalInfo'),
      meals: include('meals', {
        mealTypes: arr('meals_which'),
        dietaryRequirements: arr('meals_dietary'),
        numberOfPeople: str('meals_count'),
        notes: str('meals_notes'),
      }),
      transportation: include('transportation', {
        pickup: str('ride_pickup'),
        dropoff: str('ride_dropoff'),
        when: str('ride_when'),
        numberOfPassengers: str('ride_passengers'),
        notes: str('ride_notes'),
      }),
      familyHousing: include('familyHousing', {
        dates: str('stay_dates'),
        distance: str('stay_distance'),
        accessibility: str('stay_accessibility'),
        locationPreference: str('stay_location_pref'),
        notes: str('stay_notes'),
      }),
      visitors: include('visitors', {
        type: arr('visit_type'),
        timeOfDay: arr('visit_time'),
        frequency: str('visit_frequency'),
      }),
    }

    await submitRequest(
      'Direct Support',
      contact,
      formData,
      typeof a.company === 'string' ? a.company : '',
      typeof a.turnstileToken === 'string' ? a.turnstileToken : '',
    )
  }

  return (
    <Wizard
      steps={steps}
      initial={initial}
      onSubmit={handleSubmit}
      onClose={onClose}
      submitLabel="Send request"
      successTitle="Request sent"
      successMessage="A community representative will reach out to you shortly to coordinate."
    />
  )
}
