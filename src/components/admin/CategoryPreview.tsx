'use client'

import { useEffect, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import GenericDirectory from '@/components/resources/GenericDirectory'
import ListingForm from '@/components/resources/ListingForm'
import ReportListing from '@/components/resources/ReportListing'

// A preview of the real directory page for a category — the exact same
// GenericDirectory/ListingForm/ReportListing components a visitor sees, driven
// by the admin's in-progress (unsaved) draft. Shows the category's real,
// already-approved listings; Add/Edit build a listing locally and drop it
// straight into the preview list instead of posting to /api/submissions, so
// the admin can see a new listing "appear" without persisting anything.
// Report similarly shows its confirmation screen without actually filing one.

type Action =
  | { mode: 'create' }
  | { mode: 'edit'; listing: DirectoryResource }
  | { mode: 'report'; listing: DirectoryResource }

export default function CategoryPreview({
  category,
  onClose,
}: {
  /** The draft, packaged as a full CategoryConfig — never saved. */
  category: CategoryConfig
  onClose: () => void
}) {
  const [realListings, setRealListings] = useState<DirectoryResource[] | null>(null)
  // Listings added/edited during this preview session — client-only, never
  // sent to the server. An edited real listing is "shadowed" here by id (see
  // `items` below), the same way a brand-new one is simply appended.
  const [localListings, setLocalListings] = useState<DirectoryResource[]>([])
  const [action, setAction] = useState<Action | null>(null)

  useEffect(() => {
    let cancelled = false
    // A brand-new, unsaved category's id has no matching rows — this just
    // resolves to an empty list, same as any other empty category.
    fetch(`/api/resources?category=${encodeURIComponent(category.id)}`)
      .then(async (res) => {
        const body = await res.json()
        if (!cancelled) setRealListings(res.ok && body.ok ? (body.resources as DirectoryResource[]) : [])
      })
      .catch(() => {
        if (!cancelled) setRealListings([])
      })
    return () => {
      cancelled = true
    }
  }, [category.id])

  function goToDirectory() {
    setAction(null)
  }

  function addOrReplaceLocal(resource: DirectoryResource) {
    setLocalListings((prev) => [...prev.filter((l) => l.id !== resource.id), resource])
    goToDirectory()
  }

  if (action?.mode === 'create') {
    return (
      <ListingForm
        category={category}
        mode="create"
        onUp={goToDirectory}
        onSubmitted={goToDirectory}
        onPreviewSubmit={addOrReplaceLocal}
      />
    )
  }
  if (action?.mode === 'edit') {
    return (
      <ListingForm
        category={category}
        mode="edit"
        existing={action.listing}
        onUp={goToDirectory}
        onSubmitted={goToDirectory}
        onPreviewSubmit={addOrReplaceLocal}
      />
    )
  }
  if (action?.mode === 'report') {
    return (
      <ReportListing
        listing={action.listing}
        upLabel={category.pluralLabel}
        onUp={goToDirectory}
        onSubmitted={goToDirectory}
        preview
      />
    )
  }

  if (realListings === null) {
    return <p className="text-sm text-muted">Loading…</p>
  }

  // A locally added/edited listing shadows any real listing with the same id.
  const localIds = new Set(localListings.map((l) => l.id))
  const items = [...realListings.filter((r) => !localIds.has(r.id)), ...localListings]

  return (
    <GenericDirectory
      category={category}
      items={items}
      onUp={onClose}
      onAdd={() => setAction({ mode: 'create' })}
      onEdit={(listing) => setAction({ mode: 'edit', listing })}
      onReport={(listing) => setAction({ mode: 'report', listing })}
    />
  )
}
