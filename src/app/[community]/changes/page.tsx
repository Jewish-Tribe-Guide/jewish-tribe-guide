import type { Metadata } from 'next'
import ChangesScreen from './ChangesScreen'
import { ChangesProvider } from '@/lib/changesContext'
import { listChangeLog } from '@/lib/changesStore'
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
  const { community } = await props.params
  const rows = await listChangeLog(community).catch((err) => {
    console.error('[changes] the log failed to load:', err)
    return null
  })
  return (
    <ChangesProvider rows={rows}>
      <ChangesScreen failed={rows === null} />
    </ChangesProvider>
  )
}
