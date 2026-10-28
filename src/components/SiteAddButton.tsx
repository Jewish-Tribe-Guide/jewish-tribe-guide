'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { AddButton } from '@/components/AddButton'
import { useCategories } from '@/lib/useCategories'
import { useOptionalCommunitySlug } from '@/lib/communityContext'
import { ui } from '@/lib/uiConfig'

// "+ Add" on every screen but the Map (decided Oct 5, reversing the earlier
// "no general Add": the box needs no category, so nobody is asked to pick
// one first). Opens "Saw something? Tell us". A category page has its own
// "+", with "Add a place" inside; a listing has Edit listing.

// Loaded on the first tap: nobody browsing pays for the box.
const TellUsSheet = dynamic(() => import('@/components/TellUsSheet'), { loading: () => null })

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
  // Kept on the page once opened, so it slides and fades away when closed,
  // as a listing does, instead of vanishing in one frame (the user, Oct 27).
  const [mounted, setMounted] = useState(false)
  if (open && !mounted) setMounted(true)
  // "How do I add a listing?" in the home search opens this same box
  // (searchLands.ts), as tapping "+ Add" would.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    document.addEventListener('jpc:open-add', onOpen)
    return () => document.removeEventListener('jpc:open-add', onOpen)
  }, [])
  if (!community || !ui.contributions.add || !showsSiteAdd(pathname, community, (categories ?? []).map((c) => c.id))) return null
  return (
    <>
      <AddButton onClick={() => setOpen(true)} />
      {mounted && <TellUsSheet isOpen={open} onClose={() => setOpen(false)} />}
    </>
  )
}
