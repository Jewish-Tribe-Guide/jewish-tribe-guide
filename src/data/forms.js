// Intake forms, expressed as data so they're editable via the /admin "Forms"
// tab without a code change. Seeded into the `form` table by
// scripts/seed-forms.mjs, and used as the client-side fallback (see
// src/lib/useForms.ts) if /api/forms is unreachable. Mirrors
// src/data/categories.js.
//
// `steps[].when`: an array of conditions, ALL of which must hold for the step
// to show (AND). Each condition is { field, op, value }:
//   includes     — field (a multi/array answer) contains value
//   notIncludes  — field does NOT contain value
//   notEmpty     — field has a non-empty answer
//   empty        — field has no answer
//
// Two steps may share the same `id` (and so the same answer key) when they're
// mutually exclusive branches asking the same underlying question in different
// contexts — e.g. "hospital_room" below is asked once under Meals and once
// under Visit, each gated so only one is ever visible at a time.

const CONTACT_SECTION = '👋 Your details'

const CONTACT_STEPS = [
  { id: 'name', kind: 'text', section: CONTACT_SECTION, question: 'What’s your name?', placeholder: 'Your full name' },
  { id: 'contact', kind: 'contact', section: CONTACT_SECTION, question: 'How can we reach you?' },
  {
    id: 'preferredContact',
    kind: 'single',
    section: CONTACT_SECTION,
    when: [{ field: 'phone', op: 'notEmpty' }, { field: 'email', op: 'empty' }],
    question: 'How should we reach you?',
    options: [
      { value: 'phone', label: 'Call me' },
      { value: 'text', label: 'Text me' },
    ],
  },
  {
    id: 'preferredContact',
    kind: 'single',
    section: CONTACT_SECTION,
    when: [{ field: 'phone', op: 'notEmpty' }, { field: 'email', op: 'notEmpty' }],
    question: 'How should we reach you?',
    options: [
      { value: 'phone', label: 'Call me' },
      { value: 'text', label: 'Text me' },
      { value: 'email', label: 'Email me' },
    ],
  },
]

const MEALS = '🍽️ Meals'
const RIDE = '🚗 Ride'
const STAY = '🏠 Place to stay'
const VISIT = '🤝 Visit'

export const forms = [
  {
    id: 'support',
    title: 'Request Support',
    submit_label: 'Send request',
    success_title: 'Request sent',
    success_message: 'A community representative will reach out to you shortly to coordinate.',
    steps: [
      // ── Always asked (start) ──────────────────────────────────────────────
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

      ...CONTACT_STEPS,

      // ── Meals ────────────────────────────────────────────────────────────
      {
        id: 'hospital_room',
        kind: 'text',
        section: MEALS,
        when: [{ field: 'needs', op: 'includes', value: 'meals' }],
        question: 'Which hospital and room?',
        placeholder: 'e.g. Jefferson, room 412',
      },
      {
        id: 'meals_which',
        kind: 'multi',
        section: MEALS,
        when: [{ field: 'needs', op: 'includes', value: 'meals' }],
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
        when: [{ field: 'needs', op: 'includes', value: 'meals' }],
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
        when: [{ field: 'needs', op: 'includes', value: 'meals' }],
        question: 'How many people are we feeding?',
        placeholder: 'e.g. 4',
      },
      {
        id: 'meals_notes',
        kind: 'textarea',
        section: MEALS,
        when: [{ field: 'needs', op: 'includes', value: 'meals' }],
        optional: true,
        question: 'Anything else about the meals?',
        placeholder: 'Allergies, hechsher preferences, special requests…',
      },

      // ── Ride ─────────────────────────────────────────────────────────────
      {
        id: 'ride_pickup',
        kind: 'text',
        section: RIDE,
        when: [{ field: 'needs', op: 'includes', value: 'transportation' }],
        question: 'Where is the pickup location?',
        placeholder: 'Pickup address',
      },
      {
        id: 'ride_dropoff',
        kind: 'text',
        section: RIDE,
        when: [{ field: 'needs', op: 'includes', value: 'transportation' }],
        question: 'Where’s the dropoff location?',
        placeholder: 'Destination',
      },
      {
        id: 'ride_when',
        kind: 'text',
        section: RIDE,
        when: [{ field: 'needs', op: 'includes', value: 'transportation' }],
        question: 'When do you need the ride?',
        placeholder: 'Day and time — e.g. Tuesday at 9am',
      },
      {
        id: 'ride_passengers',
        kind: 'number',
        section: RIDE,
        when: [{ field: 'needs', op: 'includes', value: 'transportation' }],
        optional: true,
        question: 'How many passengers?',
        placeholder: 'e.g. 2',
      },
      {
        id: 'ride_notes',
        kind: 'textarea',
        section: RIDE,
        when: [{ field: 'needs', op: 'includes', value: 'transportation' }],
        optional: true,
        question: 'Anything else about the ride?',
        placeholder: 'Optional',
      },

      // ── Place to stay ────────────────────────────────────────────────────
      {
        id: 'stay_dates',
        kind: 'text',
        section: STAY,
        when: [{ field: 'needs', op: 'includes', value: 'familyHousing' }],
        question: 'When would you arrive and leave?',
        placeholder: 'e.g. Thursday night through Sunday',
      },
      {
        id: 'stay_distance',
        kind: 'text',
        section: STAY,
        when: [{ field: 'needs', op: 'includes', value: 'familyHousing' }],
        optional: true,
        question: 'How close to the hospital do you need to be?',
        placeholder: 'e.g. walking distance, or within 10 minutes',
      },
      {
        id: 'stay_accessibility',
        kind: 'text',
        section: STAY,
        when: [{ field: 'needs', op: 'includes', value: 'familyHousing' }],
        optional: true,
        question: 'Any accessibility needs?',
        placeholder: 'e.g. no stairs, wheelchair accessible',
      },
      {
        id: 'stay_location_pref',
        kind: 'text',
        section: STAY,
        when: [{ field: 'needs', op: 'includes', value: 'familyHousing' }],
        optional: true,
        question: 'Any preference on where you stay?',
        placeholder: 'e.g. a family home, women’s only, near a shul',
      },
      {
        id: 'stay_notes',
        kind: 'textarea',
        section: STAY,
        when: [{ field: 'needs', op: 'includes', value: 'familyHousing' }],
        optional: true,
        question: 'Anything else about the place to stay?',
        placeholder: 'Optional',
      },

      // ── Visit ────────────────────────────────────────────────────────────
      // Hospital + room, but only if the meals branch didn't already ask it.
      {
        id: 'hospital_room',
        kind: 'text',
        section: VISIT,
        when: [
          { field: 'needs', op: 'includes', value: 'visitors' },
          { field: 'needs', op: 'notIncludes', value: 'meals' },
        ],
        question: 'Which hospital and room?',
        placeholder: 'e.g. Jefferson, room 412',
      },
      {
        id: 'visit_type',
        kind: 'multi',
        section: VISIT,
        when: [{ field: 'needs', op: 'includes', value: 'visitors' }],
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
        when: [{ field: 'needs', op: 'includes', value: 'visitors' }],
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
        when: [{ field: 'needs', op: 'includes', value: 'visitors' }],
        optional: true,
        question: 'How often?',
        options: [
          { value: 'oneTime', label: 'One time' },
          { value: 'daily', label: 'Daily' },
          { value: 'severalPerWeek', label: 'A few times a week' },
          { value: 'flexible', label: 'Flexible' },
        ],
      },

      // ── Something else ───────────────────────────────────────────────────
      {
        id: 'otherNeed',
        kind: 'textarea',
        section: '✨ Something else',
        when: [{ field: 'needs', op: 'includes', value: 'other' }],
        question: 'What else can we help with?',
        placeholder: 'Tell us what you need…',
      },

      // ── Always asked (end) ───────────────────────────────────────────────
      {
        id: 'additionalInfo',
        kind: 'textarea',
        optional: true,
        question: 'Anything else we should know?',
        placeholder: 'Optional',
      },
    ],
  },
  {
    id: 'volunteer',
    title: 'Volunteer',
    submit_label: 'Sign me up',
    success_title: 'Thank you',
    success_message:
      'We’ve added you to our volunteer list and will reach out when there’s a need that matches what you can offer.',
    steps: [
      // ── Always asked (start) ──────────────────────────────────────────────
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

      ...CONTACT_STEPS,

      // ── Meals ────────────────────────────────────────────────────────────
      {
        id: 'meals_kosher',
        kind: 'text',
        section: '🍲 Cooking meals',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'meals' }],
        question: 'What kosher standard do you keep?',
        placeholder: 'e.g. Glatt, Chalav Yisrael, OU…',
      },

      // ── Visiting ─────────────────────────────────────────────────────────
      {
        id: 'visit_days',
        kind: 'multi',
        section: '🫂 Visiting patients',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'visiting' }],
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
        section: '🫂 Visiting patients',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'visiting' }],
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
        section: '🫂 Visiting patients',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'visiting' }],
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
        section: '🫂 Visiting patients',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'visiting' }],
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

      // ── Rides ────────────────────────────────────────────────────────────
      {
        id: 'ride_passengers',
        kind: 'number',
        section: '🚙 Giving rides',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'transportation' }],
        question: 'How many passengers can you take?',
        placeholder: 'e.g. 3',
      },

      // ── Hosting ──────────────────────────────────────────────────────────
      {
        id: 'host_rooms',
        kind: 'number',
        section: '🛏️ Hosting a family',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'housing' }],
        question: 'How many rooms do you have for guests?',
        placeholder: 'e.g. 2',
      },
      {
        id: 'host_beds',
        kind: 'number',
        section: '🛏️ Hosting a family',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'housing' }],
        question: 'How many total beds do you have?',
        placeholder: 'e.g. 3',
      },
      {
        id: 'host_address',
        kind: 'text',
        section: '🛏️ Hosting a family',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'housing' }],
        question: 'What’s your address?',
        placeholder: 'Street, city, zip',
      },

      // ── Something else ───────────────────────────────────────────────────
      {
        id: 'waysToHelpOther',
        kind: 'textarea',
        section: '❤️ Something else',
        when: [{ field: 'waysToHelp', op: 'includes', value: 'other' }],
        question: 'How else would you like to help?',
        placeholder: 'Tell us…',
      },

      // ── Always asked (end) ───────────────────────────────────────────────
      // `optionsSource: 'hospitals'` — options are generated at render time from
      // the live hospital list plus an "Anywhere in the area" catch-all (see
      // VolunteerWizard.tsx); there's nothing static to store or edit here.
      {
        id: 'areas',
        kind: 'multi',
        question: 'Where can you help?',
        hint: 'Tap all that apply.',
        optionsSource: 'hospitals',
      },
      {
        id: 'notes',
        kind: 'textarea',
        optional: true,
        question: 'Anything else you’d like us to know?',
        hint: 'Languages you speak, experience, anything else.',
        placeholder: 'Optional',
      },
    ],
  },
]

export const formIds = new Set(forms.map((f) => f.id))
