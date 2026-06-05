import type { VisitorsData } from '@/types'
import { Field, TextInput, Textarea, SelectInput, CheckboxGroup, ServiceSection } from './FormControls'

type Props = {
  data: VisitorsData
  onChange: (data: VisitorsData) => void
}

export default function VisitorsSection({ data, onChange }: Props) {
  const set = <K extends keyof VisitorsData>(key: K, value: VisitorsData[K]) =>
    onChange({ ...data, [key]: value })

  return (
    <ServiceSection title="Visitors" icon="🤝">
      <Field label="Visitor request type">
        <CheckboxGroup
          options={[
            { value: 'friendlyVisit', label: 'Friendly Visit' },
            { value: 'spiritualSupport', label: 'Spiritual Support' },
            { value: 'chaplainVisit', label: 'Jewish Chaplain Visit' },
            { value: 'minyanAssistance', label: 'Minyan Assistance' },
            { value: 'other', label: 'Other' },
          ]}
          selected={data.visitorType}
          onChange={(v) => set('visitorType', v)}
        />
      </Field>

      <Field label="Patient age group">
        <SelectInput
          value={data.patientAgeGroup}
          onChange={(e) => set('patientAgeGroup', e.target.value)}
          options={[
            { value: 'child', label: 'Child (0–12)' },
            { value: 'teen', label: 'Teen (13–17)' },
            { value: 'youngAdult', label: 'Young Adult (18–30)' },
            { value: 'adult', label: 'Adult (31–64)' },
            { value: 'senior', label: 'Senior (65+)' },
          ]}
        />
      </Field>

      <Field label="Best times for visits">
        <TextInput
          value={data.bestTimes}
          onChange={(e) => set('bestTimes', e.target.value)}
          placeholder="e.g. Weekday afternoons, Shabbat morning…"
        />
      </Field>

      <Field label="Additional visitor notes">
        <Textarea
          value={data.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Any preferences or details for visitors…"
        />
      </Field>
    </ServiceSection>
  )
}
