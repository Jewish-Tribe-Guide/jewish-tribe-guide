'use client'

import { useEffect, useState } from 'react'
import IntakeModal from '@/components/IntakeModal'
import IntakeForm from '@/components/intake/IntakeForm'
import MealsForm from '@/components/intake/MealsForm'
import TransportationForm from '@/components/intake/TransportationForm'
import VisitorsForm from '@/components/intake/VisitorsForm'
import FamilyHousingForm from '@/components/intake/FamilyHousingForm'
import UpButton from '@/components/UpButton'

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

// The four service overlays that have a real form (anything else falls back to a
// "coming soon" modal).
const MODAL_TITLES = ['Meals', 'Transportation', 'Request Visitors', 'Family Housing']

// History state page.tsx stamps, plus the sub-view this component adds.
type AssistNavState = { mode?: string; assistView?: string }

type Props = {
  hospitalId: string
  hospitalName: string
  /** Hierarchical Up from the service-selection screen → the audience home. */
  onUp: () => void
}

export default function GetAssistance({ hospitalId, hospitalName, onUp }: Props) {
  // A single history-backed sub-view:
  //   null      → the service-selection screen
  //   'intake'  → Request Direct Support (full-page IntakeForm)
  //   <service> → that service's overlay modal (Meals, Transportation, …)
  const [view, setView] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return (window.history.state as AssistNavState | null)?.assistView ?? null
  })

  // Sync the sub-view when the browser back/forward buttons are used. page.tsx
  // keeps GetAssistance mounted as long as mode stays 'assist'; this listener
  // only adjusts which sub-view is showing, so the two never conflict.
  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const s = e.state as AssistNavState | null
      if (s?.mode !== 'assist') return
      setView(s?.assistView ?? null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Open a sub-view (the intake form or a service overlay). Pushes a history
  // entry so browser-back returns to the selection screen.
  function openView(next: string) {
    setView(next)
    history.pushState({ ...window.history.state, assistView: next }, '')
  }

  // Hierarchical Up from the full-page intake form → the service-selection
  // screen (pushes the parent, decoupled from browser Back).
  function goToSelection() {
    setView(null)
    history.pushState({ ...(window.history.state ?? {}), assistView: null }, '')
  }

  // Service overlays are modals — closing one is a symmetric dismiss, so it pops
  // the history entry that opened it rather than pushing a new screen.
  const closeModal = () => history.back()

  // ── Request Direct Support (full-page form) ─────────────────────────────────
  if (view === 'intake') {
    return (
      <IntakeForm
        hospitalId={hospitalId}
        hospitalName={hospitalName}
        onUp={goToSelection}
      />
    )
  }

  return (
    <div>
      <UpButton label="Home" onClick={onUp} />

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Get Assistance</h2>
      </div>

      {/* Primary CTA → full-page IntakeForm */}
      <div className="bg-primary rounded-xl p-5 mb-6 text-white">
        <p className="font-semibold text-lg mb-1">Need multiple services or not sure where to start?</p>
        <p className="text-blue-100 text-sm mb-4">
          A community representative will reach out to help with whatever you need.
        </p>
        <button
          onClick={() => openView('intake')}
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
            onClick={() => openView(service.title)}
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

      {view === 'Meals' && (
        <IntakeModal title="Request Meals" onClose={closeModal}>
          <MealsForm hospitalId={hospitalId} onClose={closeModal} />
        </IntakeModal>
      )}
      {view === 'Transportation' && (
        <IntakeModal title="Request Transportation" onClose={closeModal}>
          <TransportationForm hospitalId={hospitalId} onClose={closeModal} />
        </IntakeModal>
      )}
      {view === 'Request Visitors' && (
        <IntakeModal title="Request Visitors" onClose={closeModal}>
          <VisitorsForm hospitalId={hospitalId} onClose={closeModal} />
        </IntakeModal>
      )}
      {view === 'Family Housing' && (
        <IntakeModal title="Family Housing" onClose={closeModal}>
          <FamilyHousingForm hospitalId={hospitalId} onClose={closeModal} />
        </IntakeModal>
      )}
      {view !== null && view !== 'intake' && !MODAL_TITLES.includes(view) && (
        <IntakeModal title={view} onClose={closeModal} />
      )}
    </div>
  )
}
