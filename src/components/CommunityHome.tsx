import type { AppMode } from '@/types'

type Props = {
  /** The visitor's chosen address, shown as context (empty until they pick one). */
  addressLabel: string
  onNavigate: (mode: AppMode) => void
  onBack: () => void
}

const PATHS: {
  mode: AppMode
  icon: string
  title: string
  description: string
}[] = [
  {
    mode: 'find',
    icon: '📍',
    title: 'Find Resources',
    description:
      'Browse kosher food, mikvahs, shuls, hotels, WhatsApp groups, and more — sorted by distance from your address.',
  },
  {
    mode: 'give',
    icon: '❤️',
    title: 'Help a family in need',
    description:
      'Volunteer your time, offer a meal or a spare room, or give a ride to a patient and their family. The community runs on neighbors like you.',
  },
]

// The community-side hub. Its verbs are all "give" — the patient assistance/intake
// form is never surfaced here, so neighbors are guided to help rather than ask.
export default function CommunityHome({ addressLabel, onNavigate, onBack }: Props) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-6 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-slate-800 mb-1">Welcome to the community</h2>
        <p className="text-muted text-sm">
          {addressLabel ? addressLabel : 'Enter your address above to sort resources by distance'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PATHS.map((path) => (
          <button
            key={path.mode}
            onClick={() => onNavigate(path.mode)}
            className="flex flex-col items-start gap-3 p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-primary hover:shadow-md transition-all text-left cursor-pointer group"
          >
            <span className="text-4xl" aria-hidden="true">{path.icon}</span>
            <div>
              <p className="text-lg font-semibold text-slate-900 group-hover:text-primary transition-colors mb-1">
                {path.title}
              </p>
              <p className="text-sm text-muted leading-snug">{path.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
