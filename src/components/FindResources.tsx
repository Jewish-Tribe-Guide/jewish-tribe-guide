'use client'

import { useState } from 'react'
import Synagogues from '@/components/tabs/Synagogues'
import AboutYourHospital from '@/components/tabs/AboutYourHospital'
import CommunityResources from '@/components/tabs/CommunityResources'

type FindView = 'synagogues' | 'about-hospital' | 'community-resources' | null

const ITEMS: { id: FindView; label: string; icon: string; description: string }[] = [
  {
    id: 'about-hospital',
    label: 'About Your Hospital',
    icon: '🏥',
    description: 'Chaplain, kosher meals, Jewish medical staff, prayer space, and Shabbat accommodations',
  },
  {
    id: 'synagogues',
    label: 'Synagogues',
    icon: '✡️',
    description: 'Nearby shuls with davening times, contacts, and WhatsApp groups',
  },
  {
    id: 'community-resources',
    label: 'Community Resources',
    icon: '🗂️',
    description: 'Grocery stores, restaurants, hotels, mikvah, eruv, and community groups',
  },
]

type Props = {
  hospitalId: string
  hospitalName: string
  onBack: () => void
}

export default function FindResources({ hospitalId, hospitalName, onBack }: Props) {
  const [view, setView] = useState<FindView>(null)

  if (view === 'synagogues') {
    return <Synagogues hospitalId={hospitalId} hospitalName={hospitalName} onBack={() => setView(null)} />
  }
  if (view === 'about-hospital') {
    return <AboutYourHospital hospitalId={hospitalId} hospitalName={hospitalName} onBack={() => setView(null)} />
  }
  if (view === 'community-resources') {
    return <CommunityResources hospitalId={hospitalId} hospitalName={hospitalName} onBack={() => setView(null)} />
  }

  return (
    <div>
      {/* Back to Home */}
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
        <h2 className="text-xl font-semibold text-slate-800">Find Resources</h2>
        <p className="text-sm text-muted mt-0.5">{hospitalName}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className="flex flex-col items-start gap-3 p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-primary hover:shadow-md transition-all text-left cursor-pointer group"
          >
            <span className="text-4xl" aria-hidden="true">{item.icon}</span>
            <div>
              <p className="text-base font-semibold text-slate-900 group-hover:text-primary transition-colors mb-1">
                {item.label}
              </p>
              <p className="text-sm text-muted leading-snug">{item.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
