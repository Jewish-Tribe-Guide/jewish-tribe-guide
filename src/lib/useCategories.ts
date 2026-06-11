'use client'

import { useEffect, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'

// Shown when /api/categories is unreachable (e.g. local dev without Supabase
// credentials) so the resource cards never vanish. Ids match the seeded DB
// categories, so deep links keep working once the API is back.
export const FALLBACK_CATEGORIES: CategoryConfig[] = [
  { id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', icon: '✡️', description: 'Shuls and minyanim near the hospital, with davening times', detailFields: [] },
  { id: 'restaurant', label: 'Restaurant', pluralLabel: 'Restaurants', icon: '🍽️', description: 'Kosher and nearby dining options', detailFields: [] },
  { id: 'grocery', label: 'Grocery Store', pluralLabel: 'Grocery Stores', icon: '🛒', description: 'Kosher and local grocery stores near the hospital', detailFields: [] },
  { id: 'hotel', label: 'Hotel', pluralLabel: 'Hotels', icon: '🏨', description: 'Lodging with shuttle and Shabbat-friendly options', detailFields: [] },
  { id: 'mikvah', label: 'Mikvah', pluralLabel: 'Mikvah', icon: '💧', description: 'Mikvah locations, hours, and contact information', detailFields: [] },
  { id: 'whatsapp', label: 'WhatsApp Group', pluralLabel: 'WhatsApp Groups', icon: '💬', description: 'Community WhatsApp groups to join', detailFields: [] },
]

// Module-level cache — the landing page, audience pages, search bar, and the
// resource directory all want the category list, so fetch it once per page
// load and share it.
let cache: CategoryConfig[] | null = null
let inflight: Promise<CategoryConfig[]> | null = null

/** The live category list, or null while loading. Falls back to the seeded
 *  category set if the API fails or returns nothing. */
export function useCategories(): CategoryConfig[] | null {
  const [categories, setCategories] = useState<CategoryConfig[] | null>(cache)

  useEffect(() => {
    if (cache) return
    inflight ??= fetch('/api/categories')
      .then((res) => res.json())
      .then((body) =>
        body.ok && (body.categories as CategoryConfig[]).length > 0
          ? (body.categories as CategoryConfig[])
          : FALLBACK_CATEGORIES,
      )
      .catch(() => FALLBACK_CATEGORIES)
    let active = true
    inflight.then((cats) => {
      cache = cats
      if (active) setCategories(cats)
    })
    return () => {
      active = false
    }
  }, [])

  return categories
}
