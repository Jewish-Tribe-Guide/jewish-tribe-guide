import type { HospitalInfo } from '@/types'
import UpButton from '@/components/UpButton'

type Props = {
  hospitalName: string
  /** Per-hospital "Jewish life" details, from the DB (hospital.info). */
  info?: HospitalInfo | null
  onUp: () => void
  /** Label on the Up button — the screen this page was opened from. */
  upLabel?: string
}

const tel = (phone: string) => `tel:${phone.replace(/\D/g, '')}`

// Surface an "open" signal from the prayer-space blurb as a badge rather than
// leaving it buried in the paragraph. Derived from the text — never assumed.
function alwaysOpen(text: string): boolean {
  return /24\s*\/?\s*7|around the clock|all hours|any hour/i.test(text)
}

// A page built around what a visitor needs in the moment: reach a person first
// (chaplain, bikkur cholim), then find where to pray and how to arrange kosher
// & Shabbos support — with the staff directory last.
export default function AboutYourHospital({ hospitalName, info, onUp, upLabel = 'Jewish Medical Resources' }: Props) {
  if (!info) {
    return (
      <div>
        <UpButton label={upLabel} onClick={onUp} />
        <h2 className="text-xl font-semibold text-slate-800">{hospitalName}</h2>
        <p className="text-muted mt-2">No information available for this hospital yet.</p>
      </div>
    )
  }

  return (
    <div>
      <UpButton label={upLabel} onClick={onUp} />

      {/* Hero — the hospital leads, since the visitor already chose it. */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark px-5 py-6 sm:px-7 sm:py-7 text-white shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15">
            <BuildingIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Jewish resources at</p>
            <h2 className="text-xl sm:text-2xl font-bold leading-tight mt-0.5">{hospitalName}</h2>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* Who to call — the top job: reach a real person. */}
        <SectionCard icon={<PhoneIcon className="h-5 w-5" />} iconClass="bg-primary/10 text-primary" title="Who to call">
          <div className="divide-y divide-slate-100">
            <ContactRow
              name={info.jewishChaplain.name}
              role="Jewish Chaplain"
              phone={info.jewishChaplain.phone}
            />
            <ContactRow
              name={info.bikurCholim.contact.name}
              role="Bikkur Cholim"
              phone={info.bikurCholim.contact.phone}
              sub={info.bikurCholim.room}
            />
          </div>
        </SectionCard>

        {/* Where to pray. */}
        <SectionCard
          icon={<PinIcon className="h-5 w-5" />}
          iconClass="bg-primary/10 text-primary"
          title="Prayer space"
          badge={alwaysOpen(info.prayerSpace) ? <Badge>Open 24/7</Badge> : null}
        >
          <p className="text-sm text-slate-700 leading-relaxed">{info.prayerSpace}</p>
        </SectionCard>

        {/* Kosher & Shabbos — amber because these usually need planning ahead. */}
        <SectionCard
          icon={<CandleIcon className="h-5 w-5" />}
          iconClass="bg-accent/10 text-accent"
          title="Kosher & Shabbos"
        >
          <p className="text-sm text-slate-700 leading-relaxed">{info.shabbatAccommodations}</p>
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent-dark">
            <ClockIcon className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Kosher meals and Shabbos arrangements usually need advance notice — call ahead to set them up.</span>
          </p>
        </SectionCard>

        {/* Jewish staff — useful, but the least time-sensitive, so it goes last. */}
        <SectionCard
          icon={<StethoscopeIcon className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
          title="Jewish medical staff"
          badge={<Badge>{info.jewishMedicalProfessionals.length} on staff</Badge>}
        >
          <ul className="divide-y divide-slate-100">
            {info.jewishMedicalProfessionals.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-medium text-slate-900 text-sm">{p.name}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{p.specialty}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  iconClass,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode
  iconClass: string
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-5 pt-5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconClass}`}>{icon}</span>
        <h3 className="flex-1 text-[13px] font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
        {badge}
      </div>
      <div className="px-5 pb-4 pt-3">{children}</div>
    </section>
  )
}

function ContactRow({ name, role, phone, sub }: { name: string; role: string; phone: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 text-sm">{name}</p>
        <p className="text-xs text-muted">{role}</p>
        {sub && <p className="mt-1 text-xs text-slate-500 leading-snug">{sub}</p>}
      </div>
      <a
        href={tel(phone)}
        aria-label={`Call ${name} at ${phone}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
      >
        <PhoneIcon className="h-4 w-4" />
        Call
      </a>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{children}</span>
  )
}

// ── Icons (inline to avoid a dependency) ──────────────────────────────────────

type IconProps = { className?: string }
const svg = (path: React.ReactNode) => {
  const Icon = ({ className }: IconProps) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      {path}
    </svg>
  )
  Icon.displayName = 'Icon'
  return Icon
}

const BuildingIcon = svg(
  <>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V5a1 1 0 011-1h12a1 1 0 011 1v16" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 8h1m-1 4h1m4-4h1m-1 4h1M10 21v-3a1 1 0 011-1h2a1 1 0 011 1v3" />
  </>,
)
const PhoneIcon = svg(
  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />,
)
const PinIcon = svg(
  <>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
  </>,
)
const CandleIcon = svg(
  <>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c1 1.2 1.5 2.1 1.5 3a1.5 1.5 0 11-3 0c0-.9.5-1.8 1.5-3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5h6V20a1 1 0 01-1 1h-4a1 1 0 01-1-1v-9.5z" />
  </>,
)
const ClockIcon = svg(
  <>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
    <circle cx="12" cy="12" r="9" />
  </>,
)
const StethoscopeIcon = svg(
  <>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v5a4 4 0 008 0V3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14a4 4 0 008 0v-1" />
    <circle cx="18" cy="11" r="2" />
  </>,
)
