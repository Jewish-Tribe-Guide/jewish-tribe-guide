'use client'

import { useSetScreenHeader } from '@/lib/headerVisibility'
import { useSiteNavigation } from '@/lib/useSiteNavigation'

/** Puts "‹ {title}" in the phone header for a server-rendered page — About and
 *  Privacy — the same drill-down header a category screen gets. Those pages
 *  are server components and can't call the hook themselves, so this is the
 *  client piece they mount; it renders nothing. Back goes to this community's
 *  home, which is where their links live on a phone (the foot of the home
 *  screen's category list). Desktop ignores it: SiteHeader only swaps the
 *  title in at mobile widths. */
export default function PageScreenHeader({ title }: { title: string }) {
  const { goHome } = useSiteNavigation()
  useSetScreenHeader(true, title, goHome)
  return null
}
