import { hospitalInfo } from '@/data/hospitalInfo'
import Collapsible from '@/components/Collapsible'

type Props = {
  hospitalId: string
  hospitalName: string
  onBack: () => void
}

export default function AboutYourHospital({ hospitalId, hospitalName, onBack }: Props) {
  const info = hospitalInfo[hospitalId]

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

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
