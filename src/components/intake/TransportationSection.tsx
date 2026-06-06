'use client'

import type { TransportationData, Ride } from '@/types'
import { Field, TextInput, Textarea } from './FormControls'
import AddressInput from './AddressInput'

type Props = {
  data: TransportationData
  onChange: (data: TransportationData) => void
}

function emptyRide(): Ride {
  return {
    pickup: '',
    destination: '',
    date: '',
    time: '',
    recurring: false,
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
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Ride {i + 1}</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Pickup location">
              <AddressInput
                value={ride.pickup}
                onChange={(v) => updateRide(i, 'pickup', v)}
                placeholder="Address or location"
              />
            </Field>
            <Field label="Destination">
              <AddressInput
                value={ride.destination}
                onChange={(v) => updateRide(i, 'destination', v)}
                placeholder="Address or location"
              />
            </Field>
          </div>

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

          <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={ride.recurring}
              onChange={(e) => updateRide(i, 'recurring', e.target.checked)}
              className="rounded border-slate-300 text-primary focus:ring-primary"
            />
            Recurring ride
          </label>

          {ride.recurring && (
            <Field label="End date (optional)">
              <TextInput
                type="date"
                value={ride.endDate}
                onChange={(e) => updateRide(i, 'endDate', e.target.value)}
              />
            </Field>
          )}

          <Field label="Number of passengers">
            <TextInput
              type="number"
              min="1"
              value={ride.numberOfPassengers}
              onChange={(e) => updateRide(i, 'numberOfPassengers', e.target.value)}
              placeholder="e.g. 2"
            />
          </Field>

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
