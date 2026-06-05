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

      <Field label="Who will be staying?">
        <Textarea
          value={data.housingFor}
          onChange={(e) => set('housingFor', e.target.value)}
          placeholder='e.g. "2 adults Thursday night, 5 adults for Shabbos"'
          rows={2}
        />
      </Field>

      <Field label="Housing preference (select all that apply)">
        <CheckboxGroup
          options={[
            { value: 'familyHome', label: 'Family home' },
            { value: 'womenOnly', label: "Women's accommodations only" },
            { value: 'menOnly', label: "Men's accommodations only" },
            { value: 'mixedOkay', label: 'Mixed accommodations are okay' },
            { value: 'noPreference', label: 'No preference' },
          ]}
          selected={data.accommodationRequirements}
          onChange={(v) => set('accommodationRequirements', v)}
        />
      </Field>

      <Field label="Distance preference">
        <RadioGroup
          name="maxDistance"
          options={[
            { value: 'walking', label: 'Walking distance preferred' },
            { value: '5min', label: 'Within 5 minutes' },
            { value: '10min', label: 'Within 10 minutes' },
            { value: '15min', label: 'Within 15 minutes' },
            { value: 'flexible', label: 'Flexible' },
          ]}
          value={data.maxDistance}
          onChange={(v) => set('maxDistance', v)}
        />
      </Field>

      <Field label="Transportation availability">
        <RadioGroup
          name="transportationAvailable"
          options={[
            { value: 'nearTransit', label: 'Must be near public transportation' },
            { value: 'noPreference', label: 'No transit preference' },
          ]}
          value={data.transportationAvailable}
          onChange={(v) => set('transportationAvailable', v)}
        />
      </Field>

      <Field label="Accessibility requirements">
        <CheckboxGroup
          options={[
            { value: 'none', label: 'No accessibility requirements' },
            { value: 'wheelchair', label: 'Wheelchair accessible' },
            { value: 'elevator', label: 'Elevator required' },
            { value: 'other', label: 'Other' },
          ]}
          selected={data.accessibilityRequirements}
          onChange={(v) => set('accessibilityRequirements', v)}
        />
      </Field>

      <Field label="Additional housing details">
        <Textarea
          value={data.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Any other details or special requests…"
        />
      </Field>
    </ServiceSection>
  )
}
