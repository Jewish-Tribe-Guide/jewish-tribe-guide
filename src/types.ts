export type Hospital = {
  id: string
  name: string
  latitude: number
  longitude: number
  timezone: string
}

// ── Zmanim & Shabbos ──────────────────────────────────────────────────────────

/** A single labeled time, e.g. { label: 'Sunrise', time: '5:32 AM' }. */
export type ZmanEntry = {
  label: string
  time: string
}

/**
 * Normalized zmanim payload for the Zmanim & Shabbos card.
 *
 * Structured so future sections can be added without changing the existing
 * shape — `parsha`, `holidays`, and `fastDay` are optional slots that the UI
 * can render once `lib/zmanim.ts` starts populating them.
 */
export type ZmanimData = {
  /** Today's Hebrew date, e.g. "21 Sivan 5786". */
  hebrewDate: string
  /** Day of week in the hospital's timezone (0 = Sunday … 6 = Saturday). */
  dayOfWeek: number
  isFriday: boolean
  isShabbos: boolean
  /** Sunrise, Latest Shema, Latest Shacharis, Sunset, Nightfall (extendable). */
  dailyZmanim: ZmanEntry[]
  shabbos: {
    /** label = weekday (e.g. "Friday"), time = candle lighting time. */
    candleLighting: ZmanEntry | null
    /** label = weekday (e.g. "Saturday"), time = havdalah time. */
    havdalah: ZmanEntry | null
  }
  // ── Future-friendly slots (not yet populated) ──
  parsha?: string
  holidays?: string[]
  fastDay?: { label: string; start: string; end: string } | null
}

export type SynagogueContact = {
  name: string
  role: string
  phone: string
}

export type SynagogueWhatsApp = {
  name: string
  link: string
}

export type SynagogueRepresentative = {
  name: string
  phone: string
}

export type DaveningTime = {
  label: string
  time: string
}

export type Synagogue = {
  id: string
  name: string
  denomination: string
  hospitalId: string
  distance: number
  address: string
  davening: DaveningTime[]
  location: string
  contacts: SynagogueContact[]
  whatsappGroups: SynagogueWhatsApp[]
  representative: SynagogueRepresentative
}

export type Resource = {
  name: string
  hospitalId: string
  distance: number
  notes?: string
}

export type KosherPlace = {
  id: string
  name: string
  hospitalId: string
  distance: number
  address: string
  phone?: string
  isKosher: boolean
}

export type Hotel = {
  id: string
  name: string
  hospitalId: string
  distance: number
  address: string
  phone: string
  shuttleAvailable: boolean
  shabbatFriendly: boolean
  notes?: string
}

export type MikvahEntry = {
  id: string
  name: string
  hospitalId: string
  distance: number
  address: string
  phone: string
  hours: string
}

export type EruvRecord = {
  hospitalId: string
  statusLink: string
  mapLink: string
  contact: {
    name: string
    phone: string
  }
  notes: string
}

export type CommunityWhatsAppGroup = {
  id: string
  name: string
  description: string
  link: string
}

export type JewishMedicalProfessional = {
  name: string
  specialty: string
}

export type BikurCholimContact = {
  name: string
  phone: string
}

export type JewishChaplain = {
  name: string
  phone: string
}

export type HospitalInfo = {
  jewishMedicalProfessionals: JewishMedicalProfessional[]
  bikurCholim: {
    room: string
    contact: BikurCholimContact
  }
  prayerSpace: string
  jewishChaplain: JewishChaplain
  shabbatAccommodations: string
}

export type AppMode = 'home' | 'find' | 'assist'

// ── Intake form types ─────────────────────────────────────────────────────────

export type Ride = {
  pickup: string
  destination: string
  date: string
  time: string
  recurring: boolean
  endDate: string
  numberOfPassengers: string
  notes: string
}

export type ContactHospitalData = {
  fullName: string
  phone: string
  email: string
  preferredContact: string
  hospitalId: string
  unitFloorRoom: string
}

export type MealsData = {
  mealsFor: string
  numberOfPeople: string
  startDate: string
  endDate: string
  mealTypes: string[]
  dietaryRequirements: string[]
  dietaryOther: string
  hechsher: string
  notes: string
}

export type TransportationData = {
  rides: Ride[]
}

export type FamilyHousingData = {
  housingFor: string
  numberOfAdults: string
  numberOfChildren: string
  arrivalDate: string
  departureDate: string
  maxDistance: string
  transportationAvailable: string
  accommodationRequirements: string[]
  accessibilityRequirements: string[]
  accessibilityOther: string
  notes: string
}

export type VisitorsData = {
  patientName: string
  patientAgeGroup: string
  visitorType: string[]
  visitorTypeOther: string
  visitFrequency: string
  bestTimes: string[]
  bestTimesOther: string
  genderPreference: string
  startDate: string
  additionalInfo: string
}

export type IntakeFormData = {
  // Shared contact + hospital
  contact: ContactHospitalData
  // Patient
  patientName: string
  relationship: string
  // Situation
  situation: string
  // Assistance
  assistanceNeeded: string[]
  // Timing
  timing: string
  specificDate: string
  // Additional
  additionalInfo: string
  // Service sections
  meals: MealsData
  transportation: TransportationData
  familyHousing: FamilyHousingData
  visitors: VisitorsData
}
