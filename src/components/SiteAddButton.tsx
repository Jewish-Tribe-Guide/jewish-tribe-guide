'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { AddButton } from '@/components/AddButton'
import { OPEN_ADD } from '@/lib/addHere'
import { useCategories } from '@/lib/useCategories'
import { useOptionalCommunitySlug, useContributions } from '@/lib/communityContext'

// A phone's "+" on every screen but the Map (decided Oct 5, reversing the
// earlier "no general Add"). Opens Add or update (Nov 27, boards R3b, V1b).
// A category page has its own "+", opening the same; a listing has Edit
// listing. On a computer the "+" is the header's (HeaderAddButton, board
// D1b), on every screen with the header, the Map included: it opens this
// box wherever the screen has no Add of its own (src/lib/addHere.ts).

// Loaded on the first tap: nobody browsing pays for the box.
const TellUsSheet = dynamic(() => import('@/components/TellUsSheet'), { loading: () => null })

/** Screens without this "+": the Map, a category page or a listing (their
 *  own), the Eruv page (its own +, opening this same box beside its list), and the site's own
 *  pages (Feedback, About, Privacy). */
export function showsSiteAdd(pathname: string, community: string, categoryIds: readonly string[]): boolean {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== community) return false
  const screen = parts[1]
  if (!screen) return true
  if (['map', 'eruv', 'feedback', 'about', 'privacy'].includes(screen)) return false
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
  // (searchLands.ts), as tapping "+" would, and so does the computer's
  // header button where the screen has no Add of its own.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    document.addEventListener(OPEN_ADD, onOpen)
    return () => document.removeEventListener(OPEN_ADD, onOpen)
  }, [])
  const contributions = useContributions()
  if (!community || !contributions.add) return null
  const shows = showsSiteAdd(pathname, community, (categories ?? []).map((c) => c.id))
  return (
    <>
      {shows && <AddButton phoneOnly onClick={() => setOpen(true)} />}
      {mounted && <TellUsSheet isOpen={open} onClose={() => setOpen(false)} findFirst />}
    </>
  )
}
