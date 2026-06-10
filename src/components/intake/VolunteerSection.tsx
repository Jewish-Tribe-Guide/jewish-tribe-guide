import { hospitals } from '@/data/hospitals'
import type {
  VolunteerData,
  VolunteerVisitingDetails,
  VolunteerMealsDetails,
  VolunteerTransportationDetails,
  VolunteerHousingDetails,
} from '@/types'
import AddressInput from './AddressInput'
import { Field, TextInput, Textarea, CheckboxGroup, RadioGroup, SelectInput, ServiceSection } from './FormControls'

const ANYWHERE = 'anywhere'

type Props = {
  data: VolunteerData
  onChange: (data: VolunteerData) => void
}

export default function VolunteerSection({ data, onChange }: Props) {
  const set = <K extends keyof VolunteerData>(key: K, value: VolunteerData[K]) =>
    onChange({ ...data, [key]: value })

  const helps = (service: string) => data.waysToHelp.includes(service)

  return (
    <div className="space-y-4">
      <Field label="How can you help?">
        <CheckboxGroup
          columns={2}
          options={[
            { value: 'meals', label: 'Preparing or delivering meals' },
            { value: 'visiting', label: 'Visiting patients (Bikur Cholim)' },
            { value: 'transportation', label: 'Transportation / rides' },
            { value: 'housing', label: 'Hosting family in your home' },
            { value: 'other', label: 'Other' },
          ]}
          selected={data.waysToHelp}
          onChange={(v) => set('waysToHelp', v)}
        />
        {data.waysToHelp.includes('other') && (
          <TextInput
            className="mt-2"
            value={data.waysToHelpOther}
            onChange={(e) => set('waysToHelpOther', e.target.value)}
            placeholder="Please describe how you'd like to help…"
          />
        )}
      </Field>

      {helps('visiting') && (
        <ServiceSection title="Visiting Patients" icon="🤝">
          <VisitingDetails data={data.visiting} onChange={(d) => set('visiting', d)} />
        </ServiceSection>
      )}
      {helps('meals') && (
        <ServiceSection title="Meals" icon="🍽️">
          <MealsDetails data={data.meals} onChange={(d) => set('meals', d)} />
        </ServiceSection>
      )}
      {helps('transportation') && (
        <ServiceSection title="Transportation" icon="🚗">
          <TransportationDetails data={data.transportation} onChange={(d) => set('transportation', d)} />
        </ServiceSection>
      )}
      {helps('housing') && (
        <ServiceSection title="Hosting Family" icon="🏠">
          <HousingDetails data={data.housing} onChange={(d) => set('housing', d)} />
        </ServiceSection>
      )}

      <Field label="Which hospitals or areas can you help with?">
        <CheckboxGroup
          columns={2}
          options={[
            ...hospitals.map((h) => ({ value: h.id, label: h.name })),
            { value: ANYWHERE, label: 'Anywhere in the Philadelphia area' },
          ]}
          selected={data.hospitals}
          onChange={(v) => set('hospitals', v)}
        />
      </Field>

      <Field label="When are you generally available?">
        <CheckboxGroup
          columns={2}
          options={[
            { value: 'weekdayMornings', label: 'Weekday mornings' },
            { value: 'weekdayAfternoons', label: 'Weekday afternoons' },
            { value: 'weekdayEvenings', label: 'Weekday evenings' },
            { value: 'weekends', label: 'Weekends' },
            { value: 'flexible', label: 'Flexible / varies' },
          ]}
          selected={data.availability}
          onChange={(v) => set('availability', v)}
        />
      </Field>

      <Field label="Do you have a car you could use to help?">
        <RadioGroup
          name="hasCar"
          columns={2}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'sometimes', label: 'Sometimes' },
            { value: 'no', label: 'No' },
          ]}
          value={data.hasCar}
          onChange={(v) => set('hasCar', v)}
        />
      </Field>

      <Field label="Anything else you'd like us to know?">
        <Textarea
          value={data.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Languages you speak, prior volunteering experience, anything else…"
        />
      </Field>
    </div>
  )
}

// ── Visiting ──────────────────────────────────────────────────────────────────

function VisitingDetails({
  data,
  onChange,
}: {
  data: VolunteerVisitingDetails
  onChange: (data: VolunteerVisitingDetails) => void
}) {
  const set = <K extends keyof VolunteerVisitingDetails>(key: K, value: VolunteerVisitingDetails[K]) =>
    onChange({ ...data, [key]: value })

  return (
    <>
      <p className="text-xs text-muted -mt-1">
        These are optional — they just help us match you with patients and families who have a gender or
        age preference for visitors.
      </p>
      <Field label="Gender (optional)">
        <SelectInput
          value={data.gender}
          onChange={(e) => set('gender', e.target.value)}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'preferNotToSay', label: 'Prefer not to say' },
          ]}
        />
      </Field>
      <Field label="Age group (optional)">
        <SelectInput
          value={data.ageGroup}
          onChange={(e) => set('ageGroup', e.target.value)}
          options={[
            { value: 'under18', label: 'Under 18' },
            { value: '18to30', label: '18–30' },
            { value: '31to50', label: '31–50' },
            { value: '51to65', label: '51–65' },
            { value: '65plus', label: '65+' },
          ]}
        />
      </Field>
    </>
  )
}

// ── Meals ─────────────────────────────────────────────────────────────────────

function MealsDetails({
  data,
  onChange,
}: {
  data: VolunteerMealsDetails
  onChange: (data: VolunteerMealsDetails) => void
}) {
  return (
    <Field label="What kosher standard do you keep when preparing meals?">
      <TextInput
        value={data.kosherStandard}
        onChange={(e) => onChange({ ...data, kosherStandard: e.target.value })}
        placeholder="e.g. Glatt Kosher, Chalav Yisrael, OU-certified ingredients…"
      />
    </Field>
  )
}

// ── Transportation ────────────────────────────────────────────────────────────

function TransportationDetails({
  data,
  onChange,
}: {
  data: VolunteerTransportationDetails
  onChange: (data: VolunteerTransportationDetails) => void
}) {
  return (
    <Field label="How many passengers can you take at once?">
      <TextInput
        type="number"
        min="1"
        value={data.maxPassengers}
        onChange={(e) => onChange({ ...data, maxPassengers: e.target.value })}
        placeholder="e.g. 3"
      />
    </Field>
  )
}

// ── Housing ───────────────────────────────────────────────────────────────────

function HousingDetails({
  data,
  onChange,
}: {
  data: VolunteerHousingDetails
  onChange: (data: VolunteerHousingDetails) => void
}) {
  const set = <K extends keyof VolunteerHousingDetails>(key: K, value: VolunteerHousingDetails[K]) =>
    onChange({ ...data, [key]: value })

  return (
    <>
      <Field label="What best describes your space?">
        <SelectInput
          value={data.apartmentType}
          onChange={(e) => set('apartmentType', e.target.value)}
          options={[
            { value: 'fullyMale', label: 'Fully male' },
            { value: 'fullyFemale', label: 'Fully female' },
            { value: 'mixedGender', label: 'Mixed gender' },
            { value: 'family', label: 'Family' },
          ]}
        />
        <p className="text-xs text-muted mt-1.5">
          This helps us match you with families who have a preference for the kind of household they stay in.
        </p>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Rooms available for guests">
          <TextInput
            type="number"
            min="1"
            value={data.numberOfRooms}
            onChange={(e) => set('numberOfRooms', e.target.value)}
            placeholder="e.g. 2"
          />
        </Field>
        <Field label="Beds available for guests">
          <TextInput
            type="number"
            min="1"
            value={data.numberOfBeds}
            onChange={(e) => set('numberOfBeds', e.target.value)}
            placeholder="e.g. 3"
          />
        </Field>
        <Field label="Maximum number of days you could host">
          <TextInput
            type="number"
            min="1"
            value={data.maxDays}
            onChange={(e) => set('maxDays', e.target.value)}
            placeholder="e.g. 7"
          />
        </Field>
      </div>
      <Field label="Address">
        <AddressInput
          value={data.address}
          onChange={(v) => set('address', v)}
          placeholder="Street address, city, zip"
        />
      </Field>
      <Field label="Accessibility">
        <CheckboxGroup
          columns={2}
          options={[
            { value: 'wheelchairAccessible', label: 'Wheelchair accessible' },
            { value: 'elevatorInBuilding', label: 'Elevator in building' },
          ]}
          selected={[
            ...(data.wheelchairAccessible ? ['wheelchairAccessible'] : []),
            ...(data.elevatorInBuilding ? ['elevatorInBuilding'] : []),
          ]}
          onChange={(v) => onChange({
            ...data,
            wheelchairAccessible: v.includes('wheelchairAccessible'),
            elevatorInBuilding: v.includes('elevatorInBuilding'),
          })}
        />
      </Field>
    </>
  )
}
