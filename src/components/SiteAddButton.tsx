'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { PlusIcon } from '@/components/icons'
import { useCategories } from '@/lib/useCategories'
import { useOptionalCommunitySlug } from '@/lib/communityContext'
import { ui } from '@/lib/uiConfig'

// "+ Add" on every screen but the Map (decided Oct 5, reversing the earlier
// "no general Add": the box needs no category, so nobody is asked to pick
// one first). Opens "Saw something? Tell us". A category page has its own
// "+", with "Add a place" inside; a listing has Suggest an edit.

// Loaded on the first tap: nobody browsing pays for the box.
const TellUsSheet = dynamic(() => import('@/components/TellUsSheet'))

/** Screens without this "+": the Map, a category page or a listing (their
 *  own), and the site's own pages (Feedback, About, Privacy). */
export function showsSiteAdd(pathname: string, community: string, categoryIds: readonly string[]): boolean {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== community) return false
  const screen = parts[1]
  if (!screen) return true
  if (['map', 'feedback', 'about', 'privacy'].includes(screen)) return false
  if (categoryIds.includes(screen)) return false
  return true
}

export default function SiteAddButton() {
  const pathname = usePathname() ?? ''
  const community = useOptionalCommunitySlug()
  const categories = useCategories()
  const [open, setOpen] = useState(false)
  if (!community || !ui.contributions.add || !showsSiteAdd(pathname, community, (categories ?? []).map((c) => c.id))) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add"
        className="fixed right-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+1rem)] desktop:bottom-6 z-40 flex h-14 w-14 desktop:w-auto items-center justify-center gap-2 rounded-full bg-primary px-0 desktop:px-5 text-white shadow-lg cursor-pointer active:scale-95 transition-transform"
      >
        <PlusIcon className="h-6 w-6 shrink-0" />
        <span className="hidden desktop:inline font-medium whitespace-nowrap">Add</span>
      </button>
      {open && <TellUsSheet isOpen onClose={() => setOpen(false)} />}
    </>
  )
}
