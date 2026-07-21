// ─────────────────────────────────────────────────────────────────────────────
// Category templates.
//
// A template is a pre-filled bundle of detail fields (+ capabilities) an admin
// can start a brand-new category from, instead of building one field at a time.
// Shipped in code (not a deployment's database) so every community running
// this app gets the same starter set — part of the template-replicability
// effort: a new community wanting a mikvah directory shouldn't have to
// reinvent the Women's/Men's/Keilim structure from scratch.
//
// Templates only apply to a category that doesn't exist yet — retrofitting one
// onto a category with real listing data would collide with whatever field
// keys those listings already use. See CategoryManager.tsx's "New category"
// screen.
// ─────────────────────────────────────────────────────────────────────────────

import type { CategoryCapabilities, CategoryField } from './categories'

export type CategoryTemplate = {
  id: string
  /** Shown in the template picker. */
  label: string
  /** One-line summary of what makes this template's shape distinctive. */
  description: string
  pluralLabel: string
  /** Pre-fills the new category's icon — still fully editable afterward. */
  icon?: string
  /** Pre-fills the new category's own (visitor-facing) description — shown on
   *  its directory page, not to be confused with this template's own
   *  `description` above (which only labels the template itself). */
  categoryDescription?: string
  /** Pre-fills the home-screen card's photo background + text color — see
   *  `cardImageUrl`/`cardTextColor` on CategoryConfig. */
  cardImageUrl?: string
  cardTextColor?: string
  hasAddress?: boolean
  hasPhone?: boolean
  upvotesEnabled?: boolean
  capabilities?: Partial<CategoryCapabilities>
  fields: CategoryField[]
}

export const CATEGORY_TEMPLATES: CategoryTemplate[] = [
  {
    id: 'synagogue',
    label: 'Synagogue',
    description:
      'Denomination (multi-select), Davening Times (Minyanim), and a Website link — the shape this deployment’s own Synagogues category uses.',
    pluralLabel: 'Synagogues',
    icon: '✡️',
    categoryDescription: 'Nearby shuls with davening times, contacts, and WhatsApp groups',
    cardImageUrl:
      'https://images.unsplash.com/photo-1612388839403-4d732790455b?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    cardTextColor: '#ffffff',
    fields: [
      {
        key: 'denomination',
        type: 'select',
        label: 'Denomination',
        options: [
          { label: 'Conservative', value: 'Conservative' },
          { label: 'Orthodox', value: 'Orthodox' },
          { label: 'Orthodox (Sephardic)', value: 'Orthodox (Sephardic)' },
          { label: 'Reform', value: 'Reform' },
          { label: 'Reconstructionist', value: 'Reconstructionist' },
          { label: 'Other', value: 'Other' },
        ],
        renderAs: 'badge',
        filterable: true,
        filterLabel: 'Denomination',
        multiSelect: true,
      },
      { key: 'minyanim', type: 'minyanim', label: 'Davening Times (Minyanim)', renderAs: 'row', filterable: false },
      { key: 'website', type: 'url', label: 'Website', linkLabel: 'Website', renderAs: 'row', filterable: false },
    ],
  },
  {
    id: 'mikvah',
    label: 'Mikvah',
    description:
      "Separate Hours/Phone per audience (Women's/Men's/Keilim), plus Women's Email and appointment notes — each audience's fields only show once its checkbox is on.",
    pluralLabel: 'Mikvah',
    icon: '💧',
    categoryDescription: 'Mikvah locations, hours, and contact information',
    cardImageUrl:
      'https://media.istockphoto.com/id/509170748/photo/purity-mikveh.webp?a=1&b=1&s=612x612&w=0&k=20&c=2fb7aMGs-sLLaBnA-d6eEAzUK75Me66jIr1dEeuTTao=',
    cardTextColor: '#ffffff',
    fields: [
      { key: 'e', type: 'text', label: 'General Email', renderAs: 'row', filterable: false },
      { key: 'hours', type: 'hours', label: 'Hours', renderAs: 'row', filterable: true },
      { key: 'womenTevillah', type: 'boolean', label: "Women's Tevillah", renderAs: 'badge', filterable: true, filterLabel: "Women's" },
      { key: 'menTevillah', type: 'boolean', label: "Men's Tevillah", renderAs: 'badge', filterable: true, filterLabel: "Men's" },
      { key: 'keilim', type: 'boolean', label: 'Keilim', renderAs: 'badge', filterable: true, filterLabel: 'Keilim' },
      { key: 'womenAppt', type: 'boolean', label: 'Appointment Required (Women)', shortLabel: 'Appointment Required', renderAs: 'badge', filterable: true, audienceKey: 'womenTevillah' },
      { key: 'womenApptNotes', type: 'textarea', label: 'Appointment Notes (Women)', shortLabel: 'Notes', renderAs: 'row', filterable: false, audienceKey: 'womenTevillah', placeholder: 'e.g. Call ahead to schedule; by appointment only on weekdays' },
      { key: 'womenHours', type: 'hours', label: "Women's Hours", shortLabel: 'Hours', renderAs: 'row', filterable: true, audienceKey: 'womenTevillah' },
      { key: 'womenPhone', type: 'tel', label: "Women's Phone", shortLabel: 'Phone', renderAs: 'row', filterable: false, audienceKey: 'womenTevillah' },
      { key: 'womenEmail', type: 'text', label: "Women's Email", shortLabel: 'Email', renderAs: 'row', filterable: false, audienceKey: 'womenTevillah' },
      { key: 'menHours', type: 'hours', label: "Men's Hours", shortLabel: 'Hours', renderAs: 'row', filterable: true, audienceKey: 'menTevillah' },
      { key: 'menPhone', type: 'tel', label: "Men's Phone", shortLabel: 'Phone', renderAs: 'row', filterable: false, audienceKey: 'menTevillah' },
      { key: 'keilimHours', type: 'hours', label: 'Keilim Hours', shortLabel: 'Hours', renderAs: 'row', filterable: true, audienceKey: 'keilim' },
      { key: 'keilimPhone', type: 'tel', label: 'Keilim Phone', shortLabel: 'Phone', renderAs: 'row', filterable: false, audienceKey: 'keilim' },
      { key: 'w', type: 'url', label: 'Website', renderAs: 'row', filterable: false },
    ],
  },
  {
    id: 'grocery',
    label: 'Grocery Store',
    description:
      'Hours plus a Kosher yes/no toggle — checking it reveals a tag list for which kosher items are available.',
    pluralLabel: 'Grocery Stores',
    icon: '🛒',
    categoryDescription: 'Kosher and local grocery stores near the hospital',
    cardImageUrl:
      'https://plus.unsplash.com/premium_photo-1683121938935-118d0a16a469?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    cardTextColor: '#ffffff',
    upvotesEnabled: true,
    fields: [
      { key: 'hours', type: 'hours', label: 'Hours', renderAs: 'row', filterable: true },
      { key: 'isKosher', type: 'boolean', label: 'Kosher', renderAs: 'badge', filterable: true, filterLabel: 'Kosher' },
      {
        key: 'kosherItems',
        help: 'Which kosher products can people find here?',
        type: 'tags',
        label: 'Kosher items available',
        showIf: { field: 'isKosher', equals: true },
        renderAs: 'badge',
        tagGroup: 'kosher_product',
      },
    ],
  },
  {
    id: 'restaurant',
    label: 'Food Establishment',
    description:
      'Type (Restaurant/Bakery/Ice Cream), Hours, a Kosher Certification multi-select, dietary tags, and a Menu link.',
    pluralLabel: 'Food Establishments',
    icon: '🍽️',
    categoryDescription: 'Kosher and nearby dining options',
    cardImageUrl:
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1770&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    cardTextColor: '#ffffff',
    upvotesEnabled: true,
    fields: [
      {
        key: 'foodType',
        type: 'select',
        label: 'Type',
        options: [
          { label: 'Restaurant', value: 'Restaurant' },
          { label: 'Bakery & Cafe', value: 'Bakery & Cafe' },
          { label: 'Ice Cream', value: 'Ice Cream' },
        ],
        renderAs: 'badge',
        filterable: true,
        filterLabel: 'Type',
        multiSelect: true,
      },
      { key: 'hours', type: 'hours', label: 'Hours', renderAs: 'row', filterable: true },
      {
        key: 'kosherCert',
        type: 'select',
        label: 'Kosher Certification',
        options: [
          { label: 'OU', value: 'OU' },
          { label: 'Star-K', value: 'Star-K' },
          { label: 'OK Kosher', value: 'OK Kosher' },
          { label: 'cRc', value: 'cRc' },
          { label: 'Kof-K', value: 'Kof-K' },
          { label: 'Other Kosher', value: 'Other Kosher' },
        ],
        renderAs: 'badge',
        filterable: true,
        filterLabel: 'Kosher Cert',
        multiSelect: true,
      },
      {
        key: 'dietary',
        help: 'E.g. Vegan, Vegetarian, Gluten-free',
        type: 'tags',
        label: 'Dietary options',
        renderAs: 'badge',
        tagGroup: 'dietary_option',
        filterable: false,
      },
      { key: 'menu', type: 'url', label: 'Menu', renderAs: 'row', linkLabel: 'View menu', filterable: false, placeholder: 'https://…' },
    ],
  },
  {
    id: 'hotel',
    label: 'Hotel',
    description: 'Shabbat-friendly and Shuttle-available yes/no toggles, Notes, and a Website link.',
    pluralLabel: 'Hotels',
    icon: '🏨',
    categoryDescription: 'Lodging with shuttle and Shabbat-friendly options',
    cardImageUrl:
      'https://images.unsplash.com/photo-1618773928121-c32242e63f39?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    cardTextColor: '#ffffff',
    upvotesEnabled: true,
    fields: [
      { key: 'shabbatFriendly', type: 'boolean', label: 'Shabbat friendly', renderAs: 'badge', filterable: true, filterLabel: 'Shabbat friendly' },
      { key: 'shuttleAvailable', type: 'boolean', label: 'Shuttle available', renderAs: 'badge', filterable: true, filterLabel: 'Shuttle available' },
      { key: 'notes', type: 'textarea', label: 'Notes', renderAs: 'row', filterable: false, placeholder: 'Anything else worth knowing' },
      { key: 'website', type: 'url', label: 'Website', renderAs: 'row', filterable: false },
    ],
  },
]
