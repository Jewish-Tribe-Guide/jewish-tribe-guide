/** A named geographic point with a timezone. Hospitals are one kind of landmark
 *  (the patient module keeps a list of them); the type itself is generic. */
export type Landmark = {
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
  /** Raw Hebcal instant backing `time`, when available — lets callers do
   *  offset math (davening times anchored to sunset/candle-lighting/havdalah)
   *  instead of re-deriving it from the already-formatted display string. */
  iso?: string
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
  id: string
  /** Name of the eruv, e.g. "University City Eruv". */
  name: string
  /** Short coverage description, e.g. "Penn, Drexel & West Philadelphia". */
  area: string
  /** The eruv's site, where current status and the boundary map are both posted. */
  statusLink: string
  notes: string
}

export type CommunityWhatsAppGroup = {
  id: string
  name: string
  description: string
  link: string
}

// ── Supabase resource directory (submission + moderation pipeline) ─────────────

export type ResourceStatus = 'pending' | 'approved' | 'rejected' | 'archived'

/** A row from the `resource` table, exactly as Supabase returns it (snake_case). */
export type ResourceRow = {
  id: string
  category: string
  name: string
  /** Generic grouping key (defaults to 'community'); the directory anchors on the
   *  visitor's address, so this is no longer a real distance anchor. */
  anchor_id: string
  distance: number | null
  address: string | null
  phone: string | null
  details: Record<string, unknown>
  status: ResourceStatus
  submitted_by: { name?: string; email?: string } | null
  created_at: string
  reviewed_at: string | null
}

/**
 * A resource normalized for the display components: shared fields at the top
 * level and the category-specific `details` flattened onto it, so existing
 * cards (KosherPlace/Hotel/MikvahEntry shapes) keep working unchanged.
 */
export type DirectoryResource = {
  id: string
  category: string
  name: string
  /** Generic grouping key (defaults to 'community'). */
  anchorId: string
  distance: number
  /** Dormant drive/walk-minute display fields — no longer populated now that the
   *  directory anchors on the visitor's address (kept so the synagogue/davening
   *  card renderers, which reference them, keep compiling and simply show
   *  nothing). Straight-line miles (below) is the live proximity signal. */
  driveMinutes?: number
  walkMinutes?: number
  address: string
  phone?: string
  /** Upvote count (for upvote-enabled categories). */
  upvotes?: number
  /** Straight-line miles from the visitor's typed address (address-anchor mode).
   *  Computed client-side from `details.geo` — see ResourceLoader. */
  milesFromAddress?: number
  /** Coordinates carried over from `details.geo` (spread onto the row). */
  geo?: { lat: number; lng: number } | null
  // ── Google Places sync (carried over from `details`, set by the sync job) ──
  /** Stable Google place id; its presence marks a listing as auto-syncing. */
  placeId?: string
  /** ISO timestamp of the last successful Google Places sync. */
  googleSyncedAt?: string
  /** ISO timestamp of the last time a user confirmed the community-curated info is still accurate. */
  confirmedAt?: string
  /** 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' from Google. */
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'
  /** Short editorial description from Google Places (fetched on first sync). */
  googleDescription?: string
  [detailKey: string]: unknown
}

/** The listing fields a create/edit submission proposes (stored in payload). */
export type ResourceSubmission = {
  category: string
  name: string
  anchorId: string
  distance: number | null
  address: string
  phone: string
  details: Record<string, unknown>
  submittedBy?: { name?: string; email?: string }
  /** Coordinates captured client-side from the address autocomplete, if any.
   *  When present, the server skips geocoding and uses these directly. */
  geo?: { lat: number; lng: number } | null
}

// ── Moderation queue (the `submission` table) ──────────────────────────────────

export type SubmissionOperation = 'create' | 'update' | 'delete'
export type SubmissionTargetType = 'listing' | 'tag' | 'category'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

/** A row from the `submission` table — one proposed change awaiting review. */
export type SubmissionRow = {
  id: string
  operation: SubmissionOperation
  target_type: SubmissionTargetType
  target_id: string | null
  payload: Record<string, unknown>
  note: string | null
  status: SubmissionStatus
  submitted_by: { name?: string; email?: string } | null
  created_at: string
  reviewed_at: string | null
}

/** A submission plus the current target row (for update/delete diffs in /admin)
 *  and a resolved category label for display. */
export type EnrichedSubmission = SubmissionRow & {
  current?: ResourceRow | null
  categoryLabel?: string
}

/** Payload for a `category` create submission: the proposed category + its first
 *  listing (people usually request a category because they have one place in mind). */
export type CategorySubmissionPayload = {
  label: string
  icon?: string
  description?: string
  upvotesEnabled?: boolean
  firstListing: {
    name: string
    anchorId: string
    distance: number | null
    address: string
    phone: string
    geo?: { lat: number; lng: number } | null
  }
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

/** A hospital as stored in the DB (the `hospital` table) — a landmark plus its
 *  optional per-hospital "Jewish life" details. */
export type Hospital = Landmark & { info?: HospitalInfo | null }

// ── Audience + directory anchor ────────────────────────────────────────────────

/** Which side of the site a visitor is on. Chosen at the Landing fork. */
export type Audience = 'patient' | 'community'

/**
 * What the resource directory measures distance against: the visitor's typed
 *  address. Distance is straight-line miles from each listing's `details.geo`.
 *  (`coords` is null until the visitor sets a location.)
 */
export type DirectoryAnchor = {
  coords: { lat: number; lng: number } | null
  label: string
}

/** Directory filters carried onto the map — applied to pins as predicates and
 *  shown as removable chips. Serializable so it survives in history state. */
export type MapFilters = {
  /** Show only listings open right now (by their filterable hours field). */
  openNow?: boolean
  /** Boolean field keys that must be true on the listing (e.g. `isKosher`). */
  bool?: string[]
  /** Select field key → allowed values; a listing matches if its value is one. */
  select?: Record<string, string[]>
}

export type AppMode = 'home' | 'find' | 'map' | 'assist' | 'volunteer' | 'community-home' | 'give' | 'feedback'

/** page.tsx's central navigation function, passed down to every screen that
 *  deep-links. `extra` is merged into the history state so the target screen
 *  can restore a sub-view on mount (findView / findQuery / volunteerPreselect).
 *  The first arg is the legacy audience key — retired now that there's a single
 *  path, but kept (nullable) so search-index destinations keep compiling. */
export type NavigateFn = (
  audience: Audience | null,
  mode: AppMode,
  extra?: Record<string, unknown>,
) => void

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

// Extra questions shown when the matching "How can you help?" box is checked —
// not about the volunteer's general info, but what they can offer for that
// specific service (so we can match them to a patient/family's preferences).
export type VolunteerVisitingDetails = {
  gender: string
  ageGroup: string
}

export type VolunteerMealsDetails = {
  kosherStandard: string
}

export type VolunteerTransportationDetails = {
  maxPassengers: string
}

export type VolunteerHousingDetails = {
  apartmentType: string
  numberOfRooms: string
  numberOfBeds: string
  address: string
  wheelchairAccessible: boolean
  elevatorInBuilding: boolean
  maxDays: string
}

export type VolunteerData = {
  waysToHelp: string[]
  waysToHelpOther: string
  hospitals: string[]
  availability: string[]
  hasCar: string
  notes: string
  visiting: VolunteerVisitingDetails
  meals: VolunteerMealsDetails
  transportation: VolunteerTransportationDetails
  housing: VolunteerHousingDetails
}

export type VolunteerRemovalData = {
  reason: string
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
