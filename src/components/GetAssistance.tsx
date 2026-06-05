'use client'

import { useState } from 'react'
import IntakeModal from '@/components/IntakeModal'

const SERVICES = [
  {
    title: 'Meals',
    description: 'Coordinate kosher meal delivery for patients and families',
    icon: '🍽️',
  },
  {
    title: 'Request Visitors',
    description: 'Arrange for community members to visit you or your loved one',
    icon: '🤝',
  },
  {
    title: 'Family Housing',
    description: 'Find affordable accommodations for out-of-town family members',
    icon: '🏠',
  },
  {
    title: 'Transportation',
    description: 'Get help arranging rides to and from the hospital',
    icon: '🚗',
  },
]

type Props = {
  hospitalName: string
  onBack: () => void
}

export default function GetAssistance({ hospitalName, onBack }: Props) {
  const [activeModal, setActiveModal] = useState<string | null>(null)

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
        <h2 className="text-xl font-semibold text-slate-800">Get Assistance</h2>
        <p className="text-sm text-muted mt-0.5">{hospitalName}</p>
      </div>

      {/* Primary CTA */}
      <div className="bg-primary rounded-xl p-5 mb-6 text-white">
        <p className="font-semibold text-lg mb-1">Need multiple services or not sure where to start?</p>
        <p className="text-blue-100 text-sm mb-4">A community representative will reach out to help with whatever you need.</p>
        <button
          onClick={() => setActiveModal('Request Direct Support')}
          className="bg-white text-primary font-semibold px-5 py-2.5 rounded-md shadow hover:bg-blue-50 transition-colors cursor-pointer"
        >
          Request Direct Support
        </button>
      </div>

      {/* Specific service cards */}
      <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-3 px-1">
        Or request a specific service
      </p>
      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map((service) => (
          <button
            key={service.title}
            onClick={() => setActiveModal(service.title)}
            className="flex flex-col items-start gap-2 p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-primary hover:shadow-md transition-all text-left cursor-pointer group"
          >
            <span className="text-2xl" aria-hidden="true">{service.icon}</span>
            <span className="font-semibold text-slate-900 text-sm group-hover:text-primary transition-colors">
              {service.title}
            </span>
            <span className="text-xs text-muted leading-snug">{service.description}</span>
          </button>
        ))}
      </div>

      {activeModal && (
        <IntakeModal title={activeModal} onClose={() => setActiveModal(null)} />
      )}
    </div>
  )
}
