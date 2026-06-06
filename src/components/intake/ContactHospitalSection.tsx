import { hospitals } from '@/data/hospitals'
import type { ContactHospitalData } from '@/types'
import { Field, TextInput, SelectInput, RadioGroup, SectionDivider } from './FormControls'

type Props = {
  data: ContactHospitalData
  onChange: (data: ContactHospitalData) => void
}

export default function ContactHospitalSection({ data, onChange }: Props) {
  const set = <K extends keyof ContactHospitalData>(key: K, value: ContactHospitalData[K]) =>
    onChange({ ...data, [key]: value })

  return (
    <>
      <SectionDivider title="Contact Information" icon="👤" />

      <Field label="Name" required>
        <TextInput
          value={data.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          placeholder="Your full name"
          autoComplete="name"
        />
      </Field>

      <Field label="Phone" required>
        <TextInput
          type="tel"
          value={data.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="(215) 555-0100"
          autoComplete="tel"
        />
      </Field>

      <Field label="Email (optional)">
        <TextInput
          type="email"
          value={data.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </Field>

      <Field label="Preferred contact method">
        <RadioGroup
          name="preferredContact"
          columns={2}
          options={[
            { value: 'phone', label: 'Phone call' },
            { value: 'text', label: 'Text message' },
            { value: 'email', label: 'Email' },
          ]}
          value={data.preferredContact}
          onChange={(v) => set('preferredContact', v)}
        />
      </Field>

      <SectionDivider title="Hospital" icon="🏥" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Hospital">
          <SelectInput
            value={data.hospitalId}
            onChange={(e) => set('hospitalId', e.target.value)}
            options={hospitals.map((h) => ({ value: h.id, label: h.name }))}
            placeholder="Select hospital"
          />
        </Field>
        <Field label="Unit / Room (optional)">
          <TextInput
            value={data.unitFloorRoom}
            onChange={(e) => set('unitFloorRoom', e.target.value)}
            placeholder="e.g. Room 412"
          />
        </Field>
      </div>
    </>
  )
}
