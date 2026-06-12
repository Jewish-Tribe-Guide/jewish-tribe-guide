import { hospitalInfo } from '@/data/hospitalInfo'
import Collapsible from '@/components/Collapsible'
import UpButton from '@/components/UpButton'

type Props = {
  hospitalId: string
  hospitalName: string
  onUp: () => void
  /** Label on the Up button — the screen this page was opened from. */
  upLabel?: string
}

export default function AboutYourHospital({ hospitalId, hospitalName, onUp, upLabel = 'Hospitals' }: Props) {
  const info = hospitalInfo[hospitalId]

  return (
    <div>
      <UpButton label={upLabel} onClick={onUp} />

      {/* Option-3 heading */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">About Your Hospital</h2>
        <p className="text-sm text-muted mt-0.5">{hospitalName}</p>
      </div>

      {!info ? (
        <p className="text-muted">No information available for this hospital yet.</p>
      ) : (
        <div className="space-y-2">
          <Collapsible title="Jewish Medical Professionals">
            <ul className="space-y-1">
              {info.jewishMedicalProfessionals.map((p, i) => (
                <li key={i} className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm">
                  <span className="font-medium text-slate-900">{p.name}</span>
                  <span className="hidden sm:inline text-slate-300">·</span>
                  <span className="text-muted">{p.specialty}</span>
                </li>
              ))}
            </ul>
          </Collapsible>

          <Collapsible title="Bikkur Cholim Services">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted font-medium mb-0.5">Bikkur Cholim Room</p>
                <p className="text-sm text-slate-800">{info.bikurCholim.room}</p>
              </div>
              <div>
                <p className="text-xs text-muted font-medium mb-0.5">Bikkur Cholim Contact</p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm">
                  <span className="font-medium text-slate-900">{info.bikurCholim.contact.name}</span>
                  <span className="hidden sm:inline text-slate-300">·</span>
                  <a href={`tel:${info.bikurCholim.contact.phone.replace(/\D/g, '')}`} className="text-primary hover:underline">
                    {info.bikurCholim.contact.phone}
                  </a>
                </div>
              </div>
            </div>
          </Collapsible>

          <Collapsible title="Prayer Space">
            <p className="text-sm text-slate-800">{info.prayerSpace}</p>
          </Collapsible>

          <Collapsible title="Jewish Chaplain">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm">
              <span className="font-medium text-slate-900">{info.jewishChaplain.name}</span>
              <span className="hidden sm:inline text-slate-300">·</span>
              <a href={`tel:${info.jewishChaplain.phone.replace(/\D/g, '')}`} className="text-primary hover:underline">
                {info.jewishChaplain.phone}
              </a>
            </div>
          </Collapsible>

          <Collapsible title="Shabbat Accommodations">
            <p className="text-sm text-slate-800">{info.shabbatAccommodations}</p>
          </Collapsible>
        </div>
      )}
    </div>
  )
}
