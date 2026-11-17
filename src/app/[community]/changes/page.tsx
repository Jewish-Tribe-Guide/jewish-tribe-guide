import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ChangesScreen from './ChangesScreen'
import { ChangesProvider } from '@/lib/changesContext'
import { listChangeLog } from '@/lib/changesStore'
import { listNights } from '@/lib/nightsStore'
import { nightRow } from '@/lib/validatedNights'
import { features } from '@/lib/features'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { changesLinked } from '@/lib/siteSettings'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'

// What changed in the guide (step 7a): places added, edited or taken out, by
// day (see whatChanged.ts).
export async function generateMetadata(props: PageProps<'/[community]/changes'>): Promise<Metadata> {
  const { community } = await props.params
  return {
    title: 'What changed',
    alternates: { canonical: `${siteUrl()}${routes.changes(community)}` },
  }
}

export default async function ChangesPage(props: PageProps<'/[community]/changes'>) {
  // Held back from the site for now (see features.ts), unless the admin has
  // put it on a tab or a header link to see it (the user, Nov 15).
  const { community } = await props.params
  if (!features.whatChanged && !changesLinked(await getSiteSettings(community))) notFound()
  const [rows, nights] = await Promise.all([
    listChangeLog(community).catch((err) => {
      console.error('[changes] the log failed to load:', err)
      return null
    }),
    // Without them, the changes still show.
    listNights(community).catch((err) => {
      console.error('[changes] the nights failed to load:', err)
      return []
    }),
  ])
  return (
    <ChangesProvider rows={rows}>
      <ChangesScreen failed={rows === null} nights={nights.map(nightRow).filter((n) => n !== null)} />
    </ChangesProvider>
  )
}
