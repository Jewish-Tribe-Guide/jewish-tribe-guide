'use client'

import { useEffect, useState } from 'react'
import AboutYourHospital from '@/components/tabs/AboutYourHospital'
import { eruvInfo } from '@/data/resources'
import HospitalsDirectory from '@/components/resources/HospitalsDirectory'
import ResourceLoader from '@/components/resources/ResourceLoader'
import ListingForm from '@/components/resources/ListingForm'
import ReportListing from '@/components/resources/ReportListing'
import CategoryForm from '@/components/resources/CategoryForm'
import EruvInfo from '@/components/resources/EruvInfo'
import ZmanimCard from '@/components/ZmanimCard'
import UpButton from '@/components/UpButton'
import type { DirectoryResource, DirectoryAnchor } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { hospitals } from '@/data/hospitals'

const ADD_CATEGORY = '__add_category__'

// The history shape page.tsx stamps on every pushState/replaceState call, plus
// the two extra fields this view adds when opening a listing form.
type FindNavState = {
  mode?: string
  findView?: string
  findAction?: string
  /** Which hospital's About page to show (set when tapping one in the list). */
  findHospitalId?: string
}

// A pending add/edit/report action on a listing within the current category.
type ListingAction =
  | { mode: 'create' }
  | { mode: 'edit'; listing: DirectoryResource }
  | { mode: 'report'; listing: DirectoryResource }

type Props = {
  anchor: DirectoryAnchor
  /** Up from any resource view → back to the home grid (the directory itself). */
  onUp: () => void
}

// A single resource detail view, opened by tapping a card on the home grid:
// a category's listings (with add/edit/report), or a curated page (About Your
// Hospital, Eruv, Zmanim), or the "suggest a category" form. The home grid IS
// the index now, so every Up here goes straight home.
export default function FindResources({ anchor, onUp }: Props) {
  // Eruv, Zmanim, and Synagogues are city-wide resources keyed to a hospital in
  // the data; in address mode we fall back to the first hospital as a
  // Philadelphia-area representative.
  const fallbackHospital = hospitals[0]
  const hospitalId = anchor.kind === 'hospital' ? anchor.hospitalId : fallbackHospital.id
  const locationLabel = anchor.kind === 'hospital' ? anchor.hospitalName : anchor.label

  // Initialize from history so browser forward/back re-opens the right sub-view.
  const [view, setView] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const s = window.history.state as FindNavState | null
    return s?.findView ?? null
  })
  const [action, setAction] = useState<ListingAction | null>(null)
  const categories = useCategories()
  // The listing id most recently opened for edit/report — restored as expanded
  // when the user presses Back from the form to the category list.
  const [reopenItemId, setReopenItemId] = useState<string | null>(null)
  // Which hospital's About page is showing (chosen from the Hospitals list).
  const [hospitalDetailId, setHospitalDetailId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return (window.history.state as FindNavState | null)?.findHospitalId ?? null
  })

  // Keep internal view/action in sync with browser back/forward. page.tsx has its
  // own popstate listener for mode; this one only acts while mode is still 'find'.
  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const s = e.state as FindNavState | null
      if (s?.mode !== 'find') return
      setView(s.findView ?? null)
      setHospitalDetailId(s.findHospitalId ?? null)
      setAction(null) // edit/report listings can't be serialized into history
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Open one hospital's About page (from the Hospitals list).
  function openHospital(id: string) {
    setHospitalDetailId(id)
    setView('about-hospital')
    history.pushState({ mode: 'find', findView: 'about-hospital', findHospitalId: id }, '')
  }

  // Up from a hospital's About page → back to the Hospitals list.
  const goToHospitals = () => {
    setView('hospitals')
    history.pushState({ mode: 'find', findView: 'hospitals' }, '')
  }

  // Open a listing action (create/edit/report form). Pushes its own history entry
  // so browser-back from the form lands on the category list, not all the way home.
  function openAction(act: ListingAction) {
    setAction(act)
    if (act.mode === 'edit' || act.mode === 'report') setReopenItemId(act.listing.id)
    history.pushState({ mode: 'find', findView: view, findAction: 'open' }, '')
  }

  // Up from a listing form / report form → the category list it was opened from
  // (view is still the category id; reopenItemId re-expands the relevant card).
  const goToCategoryList = () => {
    setAction(null)
    history.pushState({ mode: 'find', findView: view }, '')
  }

  // ── Special (non-category) detail views ─────────────────────────────────────
  if (view === 'hospitals') {
    return <HospitalsDirectory anchor={anchor} onSelect={openHospital} onUp={onUp} />
  }
  if (view === 'about-hospital') {
    // The hospital chosen from the list; its name (not the address) is the subtitle.
    const id = hospitalDetailId ?? hospitalId
    const name = hospitals.find((h) => h.id === id)?.name ?? ''
    return <AboutYourHospital hospitalId={id} hospitalName={name} onUp={goToHospitals} />
  }
  if (view === 'eruv') {
    const eruv = eruvInfo[hospitalId as keyof typeof eruvInfo]
    if (!eruv)
      return (
        <div>
          <UpButton label="Home" onClick={onUp} />
          <p className="text-muted text-sm">No eruv information available.</p>
        </div>
      )
    return <EruvInfo eruv={eruv} onUp={onUp} />
  }
  if (view === 'zmanim') {
    // Address mode: pass raw coords so the API skips the hospital lookup entirely.
    if (anchor.kind === 'address') {
      return (
        <ZmanimCard key={anchor.label} coords={anchor.coords} locationLabel={locationLabel} onUp={onUp} />
      )
    }
    return <ZmanimCard key={hospitalId} hospitalId={hospitalId} locationLabel={locationLabel} onUp={onUp} />
  }
  if (view === ADD_CATEGORY) {
    return <CategoryForm onUp={onUp} onSubmitted={onUp} />
  }

  // ── Database-backed categories (with add / edit / report) ───────────────────
  const category = view ? categories?.find((c) => c.id === view) : undefined
  if (category) {
    if (action?.mode === 'create') {
      return <ListingForm category={category} mode="create" onUp={goToCategoryList} onSubmitted={goToCategoryList} />
    }
    if (action?.mode === 'edit') {
      return <ListingForm category={category} mode="edit" existing={action.listing} onUp={goToCategoryList} onSubmitted={goToCategoryList} />
    }
    if (action?.mode === 'report') {
      return <ReportListing listing={action.listing} upLabel={category.pluralLabel} onUp={goToCategoryList} onSubmitted={goToCategoryList} />
    }
    return (
      <ResourceLoader
        category={category}
        anchor={anchor}
        reopenItemId={reopenItemId}
        onUp={onUp}
        onAdd={() => openAction({ mode: 'create' })}
        onEdit={(listing) => openAction({ mode: 'edit', listing })}
        onReport={(listing) => openAction({ mode: 'report', listing })}
      />
    )
  }

  // A category-id view whose data hasn't loaded yet.
  if (view && categories === null) {
    return (
      <div>
        <UpButton label="Home" onClick={onUp} />
        <p className="text-muted text-sm">Loading…</p>
      </div>
    )
  }

  // Unknown / empty view — nothing to show; offer a way back to the grid.
  return (
    <div>
      <UpButton label="Home" onClick={onUp} />
      <p className="text-muted text-sm">This resource isn’t available. Head back to browse everything.</p>
    </div>
  )
}
