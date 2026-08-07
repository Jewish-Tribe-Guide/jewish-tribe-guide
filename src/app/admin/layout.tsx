import { getDefaultCommunity, listCommunities } from '@/lib/communityStore'
import { CommunityProvider } from '@/lib/communityContext'

// ─────────────────────────────────────────────────────────────────────────────
// The admin lives outside /[community] — it's one console, not a public screen
// under a community — but its editors render the same content hooks the public
// site does (useCategories, useSiteSettings, useForms, and the device preview
// that renders the real home screen). Those resolve their community from
// context, so the console needs one too.
//
// It provides the default community, which is exactly what the admin edited
// before any of this: there is no per-community admin yet. When there is, this
// is the one place that has to learn to switch, and every editor below it
// follows automatically.
// ─────────────────────────────────────────────────────────────────────────────
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [community, communities] = await Promise.all([getDefaultCommunity(), listCommunities()])

  return (
    <CommunityProvider community={community} communities={communities}>
      {children}
    </CommunityProvider>
  )
}
