import type { VisitorsData } from '@/types'
import { Field, TextInput, Textarea, SelectInput, CheckboxGroup, RadioGroup } from './FormControls'

type Props = {
  data: VisitorsData
  onChange: (data: VisitorsData) => void
}

export default function VisitorsSection({ data, onChange }: Props) {
  const set = <K extends keyof VisitorsData>(key: K, value: VisitorsData[K]) =>
    onChange({ ...data, [key]: value })

  return (
    <div className="space-y-4">
      <Field label="Patient name">
        <TextInput
          value={data.patientName}
          onChange={(e) => set('patientName', e.target.value)}
          placeholder="Patient's full name"
        />
      </Field>

      <Field label="Patient age group">
        <SelectInput
          value={data.patientAgeGroup}
          onChange={(e) => set('patientAgeGroup', e.target.value)}
          options={[
            { value: 'child', label: 'Child' },
            { value: 'teen', label: 'Teen' },
            { value: 'adult', label: 'Adult' },
            { value: 'senior', label: 'Senior' },
          ]}
        />
      </Field>

      <Field label="Visitor request type">
        <CheckboxGroup
          options={[
            { value: 'friendlyVisit', label: 'Friendly Visit' },
            { value: 'spiritualSupport', label: 'Spiritual Support' },
            { value: 'chaplainVisit', label: 'Jewish Chaplain Visit' },
            { value: 'learningPartner', label: 'Learning Partner' },
            { value: 'minyanAssistance', label: 'Minyan Assistance' },
            { value: 'other', label: 'Other' },
          ]}
          selected={data.visitorType}
          onChange={(v) => set('visitorType', v)}
        />
        {data.visitorType.includes('other') && (
          <TextInput
            className="mt-2"
            value={data.visitorTypeOther}
            onChange={(e) => set('visitorTypeOther', e.target.value)}
            placeholder="Please describe…"
          />
        )}
      </Field>

      <Field label="Visit frequency">
        <RadioGroup
          name="visitFrequency"
          options={[
            { value: 'oneTime', label: 'One-time visit' },
            { value: 'daily', label: 'Daily' },
            { value: 'severalPerWeek', label: 'Several times per week' },
            { value: 'flexible', label: 'Flexible' },
          ]}
          value={data.visitFrequency}
          onChange={(v) => set('visitFrequency', v)}
        />
      </Field>

      <Field label="Best times for visits">
        <CheckboxGroup
          options={[
            { value: 'morning', label: 'Morning' },
            { value: 'afternoon', label: 'Afternoon' },
            { value: 'evening', label: 'Evening' },
          ]}
          selected={data.bestTimes}
          onChange={(v) => set('bestTimes', v)}
        />
        <TextInput
          className="mt-2"
          value={data.bestTimesOther}
          onChange={(e) => set('bestTimesOther', e.target.value)}
          placeholder="Or describe preferred times…"
        />
      </Field>

      <Field label="Visitor gender preference">
        <RadioGroup
          name="genderPreference"
          options={[
            { value: 'noPreference', label: 'No Preference' },
            { value: 'malePreferred', label: 'Male Visitor Preferred' },
            { value: 'maleRequired', label: 'Male Visitor Required' },
            { value: 'femalePreferred', label: 'Female Visitor Preferred' },
            { value: 'femaleRequired', label: 'Female Visitor Required' },
          ]}
          value={data.genderPreference}
          onChange={(v) => set('genderPreference', v)}
        />
      </Field>

      <Field label="Start date">
        <TextInput
          type="date"
          value={data.startDate}
          onChange={(e) => set('startDate', e.target.value)}
        />
      </Field>

      <Field label="Additional information">
        <Textarea
          value={data.additionalInfo}
          onChange={(e) => set('additionalInfo', e.target.value)}
          placeholder="Any other preferences or details for visitors…"
        />
      </Field>
    </div>
  )
}
