import type { Audience } from '@/types'

type Props = {
  onChoose: (audience: Audience) => void
}

const CHOICES: {
  audience: Audience
  icon: string
  title: string
  description: string
}[] = [
  {
    audience: 'patient',
    icon: '🤝',
    title: 'I\'m a patient or family member',
    description: 'Find resources near your hospital, or request meals, housing, rides, and visitors from the community.',
  },
  {
    audience: 'community',
    icon: '✡️',
    title: 'I\'m a Philadelphia community member',
    description: 'Browse Jewish community resources near you, or offer your time to help a family in need.',
  },
]

// The "who are you?" fork. Header matches SiteHeader; main body matches Home.tsx.
export default function Landing({ onChoose }: Props) {
  return (
    <>
      <header className="bg-primary text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-3">Philadelphia Jewish Community</h1>
          <p className="text-blue-100/75 text-sm">
            Connecting patients, families, and neighbors with Philadelphia&apos;s Jewish community
          </p>
        </div>
      </header>

      {/* Invisible spacer — matches SiteHeader's toggle bar so "Who are you?" aligns
          with "How can we help?" on the next screen. visibility:hidden preserves height. */}
      <div className="bg-white border-b border-slate-200 invisible" aria-hidden="true">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-center">
          <div className="inline-flex rounded-full bg-slate-100 p-1">
            <div className="px-5 py-1.5 text-sm font-medium rounded-full">Patients</div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Invisible spacer — matches UpButton + mb-6 on Home/CommunityHome. */}
        <div className="flex items-center gap-1 text-sm mb-6 invisible" aria-hidden="true">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Start over
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-slate-800 mb-1">Who are you?</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CHOICES.map((choice) => (
            <button
              key={choice.audience}
              onClick={() => onChoose(choice.audience)}
              className="flex flex-col items-start gap-3 p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-primary hover:shadow-md transition-all text-left cursor-pointer group"
            >
              <span className="text-4xl" aria-hidden="true">{choice.icon}</span>
              <div>
                <p className="text-lg font-semibold text-slate-900 group-hover:text-primary transition-colors mb-1">
                  {choice.title}
                </p>
                <p className="text-sm text-muted leading-snug">{choice.description}</p>
              </div>
            </button>
          ))}
        </div>
      </main>
    </>
  )
}
