import type { AppMode } from '@/types'

type Props = {
  hospitalName: string
  onNavigate: (mode: AppMode) => void
}

const PATHS = [
  {
    mode: 'find' as AppMode,
    icon: '📍',
    title: 'Find Resources',
    description: 'Browse synagogues, hospitals, kosher food, hotels, mikvah, eruv, and community groups near you.',
  },
  {
    mode: 'assist' as AppMode,
    icon: '🤝',
    title: 'Get Assistance',
    description: 'Request meals, visitors, housing, transportation, or direct support from the community.',
  },
]

export default function Home({ hospitalName, onNavigate }: Props) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-slate-800 mb-1">How can we help?</h2>
        <p className="text-muted text-sm">{hospitalName}</p>
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
