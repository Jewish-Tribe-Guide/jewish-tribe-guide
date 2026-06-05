import type { TransportationData, Ride } from '@/types'
import { Field, TextInput, Textarea, CheckboxGroup } from './FormControls'

type Props = {
  data: TransportationData
  onChange: (data: TransportationData) => void
}

const TRANSPORT_TYPES = [
  { value: 'toHospital', label: 'To Hospital' },
  { value: 'fromHospital', label: 'From Hospital' },
  { value: 'recurring', label: 'Recurring Ride' },
  { value: 'airport', label: 'Airport Transportation' },
  { value: 'other', label: 'Other' },
]

function emptyRide(): Ride {
  return {
    pickup: '',
    destination: '',
    date: '',
    time: '',
    transportationType: [],
    endDate: '',
    numberOfPassengers: '',
    notes: '',
  }
}

export default function TransportationSection({ data, onChange }: Props) {
  const updateRide = (index: number, field: keyof Ride, value: Ride[keyof Ride]) => {
    const rides = data.rides.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    )
    onChange({ ...data, rides })
  }

  const addRide = () => onChange({ ...data, rides: [...data.rides, emptyRide()] })

  const removeRide = (index: number) =>
    onChange({ ...data, rides: data.rides.filter((_, i) => i !== index) })

  return (
    <div className="space-y-4">
      {data.rides.map((ride, i) => (
        <div
          key={i}
          className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4"
        >
          {/* Ride header */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              Ride {i + 1}
            </span>
            {data.rides.length > 1 && (
              <button
                type="button"
                onClick={() => removeRide(i)}
                className="text-xs text-red-500 hover:text-red-700 cursor-pointer transition-colors"
              >
                Remove
              </button>
            )}
          </div>

          {/* Pickup / Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Pickup location">
              <TextInput
                value={ride.pickup}
                onChange={(e) => updateRide(i, 'pickup', e.target.value)}
                placeholder="Address or location"
              />
            </Field>
            <Field label="Destination">
              <TextInput
                value={ride.destination}
                onChange={(e) => updateRide(i, 'destination', e.target.value)}
                placeholder="Address or location"
              />
            </Field>
          </div>

          {/* Date / Time */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <TextInput
                type="date"
                value={ride.date}
                onChange={(e) => updateRide(i, 'date', e.target.value)}
              />
            </Field>
            <Field label="Time">
              <TextInput
                type="time"
                value={ride.time}
                onChange={(e) => updateRide(i, 'time', e.target.value)}
              />
            </Field>
          </div>

          {/* Transportation type */}
          <Field label="Transportation type">
            <CheckboxGroup
              columns={2}
              options={TRANSPORT_TYPES}
              selected={ride.transportationType}
              onChange={(v) => updateRide(i, 'transportationType', v)}
            />
          </Field>

          {/* End date — revealed when Recurring is selected */}
          {ride.transportationType.includes('recurring') && (
            <Field label="End date">
              <TextInput
                type="date"
                value={ride.endDate}
                onChange={(e) => updateRide(i, 'endDate', e.target.value)}
              />
            </Field>
          )}

          {/* Number of passengers */}
          <Field label="Number of passengers">
            <TextInput
              type="number"
              min="1"
              value={ride.numberOfPassengers}
              onChange={(e) => updateRide(i, 'numberOfPassengers', e.target.value)}
              placeholder="e.g. 2"
            />
          </Field>

          {/* Additional notes */}
          <Field label="Additional notes">
            <Textarea
              value={ride.notes}
              onChange={(e) => updateRide(i, 'notes', e.target.value)}
              placeholder="Any other details for this ride…"
            />
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={addRide}
        className="text-sm font-medium text-primary hover:text-primary-dark border border-primary rounded-md px-4 py-2 transition-colors cursor-pointer"
      >
        + Add Another Ride
      </button>
    </div>
  )
}
