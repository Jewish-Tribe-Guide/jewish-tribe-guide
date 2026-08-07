import type { CategoryConfig } from './categories'

// Shown when the category read fails (a database hiccup, or local dev without
// Supabase credentials) so the resource cards never vanish entirely. The ids
// match the seeded database categories, so links and deep links keep working
// once the real list is reachable again.
//
// Lives here rather than in useCategories.ts so the server loader can import it
// without pulling a `'use client'` module into a server component.
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

// Per-category icon overrides — e.g. the ✡️ emoji renders as a garish purple
// box on most platforms, so synagogues use the synagogue-building emoji instead.
const ICON_OVERRIDES: Record<string, string> = {
  synagogue: '🕍',
}

/** Applies the per-category icon overrides. */
export function withIconOverrides(categories: CategoryConfig[]): CategoryConfig[] {
  return categories.map((c) => ({ ...c, icon: ICON_OVERRIDES[c.id] ?? c.icon }))
}
