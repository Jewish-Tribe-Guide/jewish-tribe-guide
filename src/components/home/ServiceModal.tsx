'use client'

import IntakeModal from '@/components/IntakeModal'
import MealsForm from '@/components/intake/MealsForm'
import TransportationForm from '@/components/intake/TransportationForm'
import VisitorsForm from '@/components/intake/VisitorsForm'
import FamilyHousingForm from '@/components/intake/FamilyHousingForm'

type Props = {
  /** Which service form to show: 'Meals' | 'Transportation' | 'Request Visitors'
   *  | 'Family Housing'. Anything else gets the generic "coming soon" modal. */
  service: string
  hospitalId: string
  onClose: () => void
}

// A service request form as an overlay on whatever page the visitor is on —
// rendered globally by page.tsx (driven by the `serviceModal` history-state
// key), so opening one never navigates away from the current screen.
export default function ServiceModal({ service, hospitalId, onClose }: Props) {
  if (service === 'Meals') {
    return (
      <IntakeModal title="Request Meals" onClose={onClose}>
        <MealsForm hospitalId={hospitalId} onClose={onClose} />
      </IntakeModal>
    )
  }
  if (service === 'Transportation') {
    return (
      <IntakeModal title="Request Transportation" onClose={onClose}>
        <TransportationForm hospitalId={hospitalId} onClose={onClose} />
      </IntakeModal>
    )
  }
  if (service === 'Request Visitors') {
    return (
      <IntakeModal title="Request Visitors" onClose={onClose}>
        <VisitorsForm hospitalId={hospitalId} onClose={onClose} />
      </IntakeModal>
    )
  }
  if (service === 'Family Housing') {
    return (
      <IntakeModal title="Family Housing" onClose={onClose}>
        <FamilyHousingForm hospitalId={hospitalId} onClose={onClose} />
      </IntakeModal>
    )
  }
  return <IntakeModal title={service} onClose={onClose} />
}
