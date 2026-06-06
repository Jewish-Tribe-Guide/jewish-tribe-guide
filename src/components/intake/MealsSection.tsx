import type { MealsData } from '@/types'
import { Field, TextInput, Textarea, SelectInput, CheckboxGroup } from './FormControls'

type Props = {
  data: MealsData
  onChange: (data: MealsData) => void
}

export default function MealsSection({ data, onChange }: Props) {
  const set = <K extends keyof MealsData>(key: K, value: MealsData[K]) =>
    onChange({ ...data, [key]: value })

  return (
    <div className="space-y-4">
      <Field label="Meals needed for">
        <SelectInput
          value={data.mealsFor}
          onChange={(e) => set('mealsFor', e.target.value)}
          options={[
            { value: 'patient', label: 'Patient' },
            { value: 'family', label: 'Family' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </Field>

      <Field label="Number of people">
        <TextInput
          type="number"
          min="1"
          value={data.numberOfPeople}
          onChange={(e) => set('numberOfPeople', e.target.value)}
          placeholder="e.g. 4"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <TextInput
            type="date"
            value={data.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </Field>
        <Field label="End date (optional)">
          <TextInput
            type="date"
            value={data.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Which meals?">
        <CheckboxGroup
          columns={2}
          options={[
            { value: 'breakfast', label: 'Breakfast' },
            { value: 'lunch', label: 'Lunch' },
            { value: 'dinner', label: 'Dinner' },
            { value: 'shabbatYomTov', label: 'Shabbat / Yom Tov Meals' },
          ]}
          selected={data.mealTypes}
          onChange={(v) => set('mealTypes', v)}
        />
      </Field>

      <Field label="Dietary requirements">
        <CheckboxGroup
          columns={2}
          options={[
            { value: 'standardKosher', label: 'Standard Kosher' },
            { value: 'glattKosher', label: 'Glatt Kosher' },
            { value: 'vegetarian', label: 'Vegetarian' },
            { value: 'vegan', label: 'Vegan' },
            { value: 'other', label: 'Other' },
          ]}
          selected={data.dietaryRequirements}
          onChange={(v) => set('dietaryRequirements', v)}
        />
        {data.dietaryRequirements.includes('other') && (
          <TextInput
            className="mt-2"
            value={data.dietaryOther}
            onChange={(e) => set('dietaryOther', e.target.value)}
            placeholder="Please describe your dietary requirements…"
          />
        )}
      </Field>

      <Field label="Hechsher preferences (optional)">
        <TextInput
          value={data.hechsher}
          onChange={(e) => set('hechsher', e.target.value)}
          placeholder="e.g. OU, Chabad, Kehilla…"
        />
      </Field>

      <Field label="Additional notes">
        <Textarea
          value={data.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Any allergies, special requests, or other details…"
        />
      </Field>
    </div>
  )
}
