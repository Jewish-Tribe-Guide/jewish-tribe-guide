'use client'

import type { ReactNode } from 'react'
import { CategoryBandFrame, HeroTitle } from '@/components/resources/CategoryBandFrame'
import { useSiteSettings } from '@/lib/contentContext'

/** Slate under the photo while it loads, and the whole band when the admin
 *  has set no home photo. */
const PHOTO_HEADER_COLOR = '#334155'

/** The category pages' photo header for a page that isn't a category
 *  (board W11, the user, Nov 15): What changed, You, About and Privacy. The
 *  photo is the community's home photo; on it, a small count and the
 *  page's title. A computer only: on a phone this renders `children` alone,
 *  and the page keeps its own title. */
export default function PhotoHeader({ eyebrow, title, children }: { eyebrow?: string | null; title: string; children: ReactNode }) {
  const settings = useSiteSettings()
  return (
    <CategoryBandFrame color={PHOTO_HEADER_COLOR} imageUrl={settings.desktopHeroImage?.url ?? null} hero={<HeroTitle eyebrow={eyebrow} title={title} />}>
      {/* As far under the photo as a category's list sits under its own. */}
      <div aria-hidden="true" className="hidden h-8 desktop:block" />
      {children}
    </CategoryBandFrame>
  )
}
