'use client'

import type { CategoryConfig } from '@/lib/categories'

// Per-category icon overrides — e.g. the ✡️ emoji renders as a garish purple
// box on most platforms, so synagogues use the synagogue-building emoji instead.
const ICON_OVERRIDES: Record<string, string> = {
  synagogue: '🕍',
}

// Shown when /api/categories is unreachable (e.g. local dev without Supabase
// credentials) so the resource cards never vanish. Ids match the seeded DB
// categories, so deep links keep working once the API is back.
export const FALLBACK_CATEGORIES: CategoryConfig[] = [
  { id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', icon: '🕍', description: 'Shuls and minyanim near the hospital, with davening times', detailFields: [], kind: 'listing' },
  { id: 'restaurant', label: 'Food Establishment', pluralLabel: 'Food Establishments', icon: '🍽️', description: 'Restaurants, bakeries, cafes, and ice cream near the hospital', detailFields: [], kind: 'listing' },
  { id: 'grocery', label: 'Grocery Store', pluralLabel: 'Grocery Stores', icon: '🛒', description: 'Kosher and local grocery stores near the hospital', detailFields: [], kind: 'listing' },
  { id: 'hotel', label: 'Hotel', pluralLabel: 'Hotels', icon: '🏨', description: 'Lodging with shuttle and Shabbat-friendly options', detailFields: [], kind: 'listing' },
  { id: 'mikvah', label: 'Mikvah', pluralLabel: 'Mikvah', icon: '💧', description: 'Mikvah locations, hours, and contact information', detailFields: [], kind: 'listing' },
  { id: 'whatsapp', label: 'WhatsApp Group', pluralLabel: 'WhatsApp Groups', icon: '💬', description: 'Community WhatsApp groups to join', kind: 'listing', detailFields: [
    { key: 'description', label: 'Description', type: 'textarea', renderAs: 'row', hideLabel: true },
    { key: 'link', label: 'Join group', type: 'url', linkLabel: 'Join group', renderAs: 'row', showInHeader: true },
  ] },
]

// Module-level cache — the landing page, audience pages, search bar, and the
import { useCommunityData } from './useCommunityData'

/** The live category list for the active community, or null while loading.
 *  Falls back to the seeded category set if the API fails or returns nothing.
 *  Cached per community — see useCommunityData. */
export function useCategories(): CategoryConfig[] | null {
  const { data } = useCommunityData<CategoryConfig[] | null>(
    '/api/categories',
    (url) =>
      fetch(url)
        .then((res) => res.json())
        .then((body) =>
          body.ok && (body.categories as CategoryConfig[]).length > 0
            ? (body.categories as CategoryConfig[]).map((c) => ({
                ...c,
                icon: ICON_OVERRIDES[c.id] ?? c.icon,
              }))
            : FALLBACK_CATEGORIES,
        )
        .catch(() => FALLBACK_CATEGORIES),
    null,
  )
  return data
}
