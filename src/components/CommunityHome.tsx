import type { AppMode } from '@/types'
import UpButton from '@/components/UpButton'

type Props = {
  onNavigate: (mode: AppMode) => void
  onUp: () => void
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
export default function CommunityHome({ onNavigate, onUp }: Props) {
  return (
    <>
      <UpButton label="Start over" onClick={onUp} className="mb-6" />
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-slate-800 mb-1">Welcome to the community</h2>
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
    </>
  )
}
