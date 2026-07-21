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
]
