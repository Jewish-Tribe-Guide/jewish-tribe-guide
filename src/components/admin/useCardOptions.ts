import { useMemo } from 'react'
import { useCategories } from '@/lib/useCategories'
import { useForms } from '@/lib/useForms'
import { community } from '@/community.config'

export type CardOption = { id: string; label: string }

/** Every card that could be placed in a section — mirrors the entry + resource
 *  cards Landing.tsx builds, reduced to just id/label for the picker. Kept in
 *  sync with Landing.tsx's own card list; if a new fixed card type is added
 *  there, add it here too so it can be assigned to a section.
 *
 *  Also drives the featured-trio picker in SiteSettingsEditor, which chooses
 *  from this same set — so both pickers offer exactly what the home screen
 *  can actually render. */
export function useCardOptions(): CardOption[] {
  const categories = useCategories()
  const forms = useForms()

  return useMemo(() => {
    if (!categories) return []
    const zmanim = categories.find((c) => c.kind === 'zmanim')
    const eruv = categories.find((c) => c.kind === 'eruv')
    const customForms = (forms ?? []).filter((f) => f.id !== 'support' && f.id !== 'volunteer')
    const supportForm = forms?.find((f) => f.id === 'support')
    const volunteerForm = forms?.find((f) => f.id === 'volunteer')

    // Note: the Map pseudo-category isn't listed here — "View Map" is now a
    // fixed button next to the search box (see HeroHeading), not a card that
    // can be placed in a section.
    return [
      ...(community.features.patientSupport && supportForm ? [{ id: 'support', label: 'Patient & Family Support' }] : []),
      ...(community.features.volunteer && volunteerForm ? [{ id: 'volunteer', label: 'Volunteer for Patients' }] : []),
      ...customForms.map((f) => ({ id: f.id, label: f.title })),
      ...categories.filter((c) => c.kind === 'listing').map((c) => ({ id: c.id, label: c.pluralLabel })),
      ...(zmanim ? [{ id: 'zmanim', label: zmanim.pluralLabel }] : []),
      ...(eruv ? [{ id: 'eruv', label: eruv.pluralLabel }] : []),
    ]
  }, [categories, forms])
}
