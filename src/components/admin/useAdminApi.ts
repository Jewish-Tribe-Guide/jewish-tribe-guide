'use client'

import { useMemo } from 'react'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminApi, type AdminApi } from '@/lib/adminApi'

/** The admin api for the community this screen is in: every request carries
 *  the admin’s token and the community. See `src/lib/adminApi.ts`. */
export function useAdminApi(token: string): AdminApi {
  const community = useCommunitySlug()
  return useMemo(() => adminApi(token, community), [token, community])
}

/** The same for the site-wide routes the superadmin console calls
 *  (communities, pages), which no one community owns. */
export function useSiteAdminApi(token: string): AdminApi {
  return useMemo(() => adminApi(token, null), [token])
}
