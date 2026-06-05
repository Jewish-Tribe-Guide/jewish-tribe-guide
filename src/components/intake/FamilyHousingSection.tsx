import type { FamilyHousingData } from '@/types'
import { Field, TextInput, Textarea, SelectInput, CheckboxGroup, RadioGroup, ServiceSection } from './FormControls'

type Props = {
  data: FamilyHousingData
  onChange: (data: FamilyHousingData) => void
}

export default function FamilyHousingSection({ data, onChange }: Props) {
  const set = <K extends keyof FamilyHousingData>(key: K, value: FamilyHousingData[K]) =>
    onChange({ ...data, [key]: value })

  return (
    <ServiceSection title="Family Housing" icon="🏠">
      <Field label="Housing needed for">
        <TextInput
          value={data.housingFor}
          onChange={(e) => set('housingFor', e.target.value)}
          placeholder='e.g. "2 adults Thursday night, 5 adults for Shabbos"'
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Number of adults">
          <TextInput
            type="number"
            min="0"
            value={data.numberOfAdults}
            onChange={(e) => set('numberOfAdults', e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Number of children">
          <TextInput
            type="number"
            min="0"
            value={data.numberOfChildren}
            onChange={(e) => set('numberOfChildren', e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Arrival date">
          <TextInput
            type="date"
            value={data.arrivalDate}
            onChange={(e) => set('arrivalDate', e.target.value)}
          />
        </Field>
        <Field label="Departure date">
          <TextInput
            type="date"
            value={data.departureDate}
            onChange={(e) => set('departureDate', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Maximum distance from hospital">
        <SelectInput
          value={data.maxDistance}
          onChange={(e) => set('maxDistance', e.target.value)}
          options={[
            { value: 'walking', label: 'Walking distance (< 0.5 mi)' },
            { value: '1mile', label: 'Within 1 mile' },
            { value: '2miles', label: 'Within 2 miles' },
            { value: '5miles', label: 'Within 5 miles' },
            { value: 'any', label: 'No preference' },
          ]}
        />
      </Field>

      <Field label="Transportation available">
        <RadioGroup
          name="transportationAvailable"
          columns={2}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          value={data.transportationAvailable}
          onChange={(v) => set('transportationAvailable', v)}
        />
      </Field>

      <Field label="Accommodation requirements">
        <CheckboxGroup
          options={[
            { value: 'family', label: 'Family accommodations' },
            { value: 'accessible', label: 'Accessible accommodations' },
            { value: 'maleOnly', label: 'Male only' },
            { value: 'femaleOnly', label: 'Female only' },
            { value: 'other', label: 'Other' },
          ]}
          selected={data.accommodationRequirements}
          onChange={(v) => set('accommodationRequirements', v)}
        />
      </Field>

      <Field label="Additional housing notes">
        <Textarea
          value={data.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Any other details or special requests…"
        />
      </Field>
    </ServiceSection>
  )
}
