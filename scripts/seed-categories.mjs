// Seeds the four built-in categories into the `category` table (run once after
// supabase/categories.sql). Idempotent: upserts by id.
//
//   node --env-file=.env.local scripts/seed-categories.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

// `fields` mirror src/lib/categories.ts, now with presentation hints:
//   renderAs:  'badge' (a chip near the name) | 'row' (a labeled line) | 'hidden'
//   filterable: shows a toggle/dropdown filter for this field
const categories = [
  {
    id: 'grocery',
    label: 'Grocery Store',
    plural_label: 'Grocery Stores',
    icon: '🛒',
    description: 'Kosher and local grocery stores near the hospital',
    sort_order: 10,
    fields: [
      { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row', filterable: true },
      { key: 'isKosher', label: 'Kosher', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Kosher' },
      {
        key: 'kosherItems',
        label: 'Kosher items available',
        type: 'tags',
        tagGroup: 'kosher_product',
        renderAs: 'badge',
        help: 'Which kosher products can people find here?',
        showIf: { field: 'isKosher', equals: true },
      },
    ],
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    plural_label: 'Restaurants',
    icon: '🍽️',
    description: 'Kosher and nearby dining options',
    sort_order: 20,
    fields: [
      { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row', filterable: true },
      { key: 'isKosher', label: 'Kosher', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Kosher' },
      {
        key: 'certification',
        label: 'Kosher certification (Hechsher)',
        type: 'text',
        renderAs: 'row',
        placeholder: 'e.g. OU, Star-K, local Vaad',
        showIf: { field: 'isKosher', equals: true },
      },
      { key: 'menu', label: 'Menu', type: 'url', linkLabel: 'View menu', renderAs: 'row', placeholder: 'https://…' },
    ],
  },
  {
    id: 'hotel',
    label: 'Hotel',
    plural_label: 'Hotels',
    icon: '🏨',
    description: 'Lodging with shuttle and Shabbat-friendly options',
    sort_order: 30,
    fields: [
      { key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Shabbat friendly' },
      { key: 'shuttleAvailable', label: 'Shuttle available', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Shuttle available' },
      { key: 'notes', label: 'Notes', type: 'textarea', renderAs: 'row', placeholder: 'Anything else worth knowing' },
    ],
  },
  {
    id: 'mikvah',
    label: 'Mikvah',
    plural_label: 'Mikvah',
    icon: '💧',
    description: 'Mikvah locations, hours, and contact information',
    sort_order: 40,
    fields: [
      // `hours` was formerly type:'text'; changing to type:'hours' enables the
      // Open Now filter. Existing rows with text values will still display via
      // the legacy-string fallback in GenericDirectory until edited.
      { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row', filterable: true },
      { key: 'womenTevillah', label: "Women's Tevillah", type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: "Women's" },
      { key: 'menTevillah', label: "Men's Tevillah", type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: "Men's" },
      { key: 'keilim', label: 'Keilim', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Keilim' },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Group',
    plural_label: 'WhatsApp Groups',
    icon: '💬',
    description: 'Community WhatsApp groups to join',
    sort_order: 50,
    fields: [
      { key: 'description', label: 'Description', type: 'textarea', renderAs: 'row', hideLabel: true, placeholder: 'What is this group about?' },
      { key: 'link', label: 'Join group', type: 'url', linkLabel: 'Join group', renderAs: 'row', showInHeader: true },
    ],
  },
]

const { error } = await supabase.from('category').upsert(categories, { onConflict: 'id' })
if (error) {
  console.error('❌ Seed failed:', error.message)
  process.exit(1)
}
console.log(`✅ Seeded ${categories.length} categories:`, categories.map((c) => c.id).join(', '))
