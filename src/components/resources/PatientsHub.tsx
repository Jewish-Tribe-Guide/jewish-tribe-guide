import { CardGrid, type CardDef } from '@/components/home/sections'
import UpButton from '@/components/UpButton'

type Props = {
  /** Open the Jewish Medical Resources (hospitals) directory. */
  onOpenMedical: () => void
  /** Open the guided Request Support form. */
  onRequestSupport: () => void
  /** Open the guided Volunteer form (cross-link for people who want to give). */
  onVolunteer: () => void
  /** Back to the home grid. */
  onUp: () => void
}

// A small hub for people dealing with a hospital stay — the two things a patient
// or family member reaches for, grouped so "Request Support" isn't sitting on the
// general grid for every resident. Volunteering is the give side, so it's only a
// cross-link here, not one of the cards.
export default function PatientsHub({ onOpenMedical, onRequestSupport, onVolunteer, onUp }: Props) {
  const cards: CardDef[] = [
    { title: 'Jewish Medical Resources', go: onOpenMedical },
    { title: 'Request Support', go: onRequestSupport },
  ]

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />
      <h2 className="text-xl font-semibold text-slate-800 mb-1">Patients &amp; Families</h2>
      <p className="mb-6 text-sm text-muted">
        For anyone with a loved one in the hospital — find Jewish life inside the
        hospital, or ask the community for meals, rides, and a place to stay.
      </p>

      <CardGrid cards={cards} />

      <p className="mt-6 text-sm text-muted">
        Want to help instead?{' '}
        <button
          onClick={onVolunteer}
          className="font-medium text-primary hover:underline cursor-pointer"
        >
          Volunteer to support patients &amp; families →
        </button>
      </p>
    </div>
  )
}
