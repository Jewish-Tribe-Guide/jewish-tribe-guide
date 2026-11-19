'use client'

import { useMemo } from 'react'
import { useCommunitySlug } from '@/lib/communityContext'
import { useLatestRef } from '@/lib/useLatestRef'
import { adminApi, type AdminApi } from '@/lib/adminApi'

// One api per screen and community, kept when the token changes: Supabase
// hands the admin a new token about once an hour (and on coming back to an
// old tab), and a load keyed on an api remade then ran again and put the
// saved values back over what was being typed (Nov 18 review; Home page and
// Feedback had it, 431a5f89). Each request reads the latest token.

/** The admin api for the community this screen is in: every request
 *  carries the admin’s token and the community. See `src/lib/adminApi.ts`. */
export function useAdminApi(token: string): AdminApi {
  return useAdminApiFor(token, useCommunitySlug())
}

/** The same for a screen handed its community rather than reading it. */
export function useAdminApiFor(token: string, community: string): AdminApi {
  const latest = useLatestRef(token)
  return useMemo(() => adminApi(() => latest.current, community), [latest, community])
}

/** The same for the site-wide routes the superadmin console calls
 *  (communities, pages), which no one community owns. */
export function useSiteAdminApi(token: string): AdminApi {
  const latest = useLatestRef(token)
  return useMemo(() => adminApi(() => latest.current, null), [latest])
}
