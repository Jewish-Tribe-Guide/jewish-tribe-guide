'use client'

import { useSiteSettings } from '@/lib/contentContext'

/** What the phone's tab bar calls a built-in tab ('you', 'changes',
 *  'browse'), as the admin named it, so the header over its page says the
 *  same word as the tab lit under it. `fallback` when it isn't on the bar. */
export function useTabLabel(target: string, fallback: string): string {
  const settings = useSiteSettings()
  return settings.mobileTabs?.find((t) => t.target === target)?.label?.trim() || fallback
}
