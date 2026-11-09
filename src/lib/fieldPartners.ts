import type { CategoryField, FieldType } from './categories'

// A field that comes with another (the user, Nov 9): Kosher Certification
// URL with Kosher Certification, Delivery WhatsApp Group with Delivery
// Details. The partner is a field of its own on the page, as it always was
// (the watches write Keystone-K's and Mekor's certificate links to `k`), but
// it's offered with its field, not on its own, and a switch on that field's
// screen adds it or takes it off.

export type Partner = {
  /** The partner field's name and kind, as pages have it. */
  label: string
  type: FieldType
  /** Its switch, and its line under "Comes with". */
  name: string
  hint: string
  /** The partner, for a page that didn't have it, next to `parent`. */
  make: (parent: CategoryField) => CategoryField
}

const norm = (s: string) => s.trim().toLowerCase()
const idOf = (f: Pick<CategoryField, 'label' | 'type'>) => `${f.type === 'textarea' ? 'text' : f.type}:${norm(f.label)}`

const PARTNERS: Record<string, Partner> = {
  'select:kosher certification': {
    label: 'Kosher Certification URL',
    type: 'url',
    name: 'Link to the certificate',
    hint: 'Asks for a link to the hechsher’s certificate',
    make: (parent) => ({
      key: 'k',
      label: 'Kosher Certification URL',
      type: 'url',
      renderAs: 'row',
      linkLabel: 'Certification',
      filterable: false,
      ...(parent.formSection && { formSection: parent.formSection }),
    }),
  },
  'text:delivery details': {
    label: 'Delivery WhatsApp Group',
    type: 'url',
    name: 'WhatsApp group',
    hint: 'Asks for a group to join for deliveries',
    make: (parent) => ({
      key: 'delivery_whatsapp_group',
      label: 'Delivery WhatsApp Group',
      type: 'url',
      renderAs: 'row',
      linkLabel: 'Join WhatsApp Group',
      filterable: false,
      leadBox: { text: parent.key, title: 'Delivery' },
      ...(parent.showIf && { showIf: { ...parent.showIf } }),
      ...(parent.formSection && { formSection: parent.formSection }),
    }),
  },
}

/** What comes with this field, if anything. */
export const partnerRule = (f: Pick<CategoryField, 'label' | 'type'>): Partner | undefined => PARTNERS[idOf(f)]

/** The field this one comes with, by name and kind, when there's a rule. */
function parentId(f: Pick<CategoryField, 'label' | 'type'>): string | null {
  const id = idOf(f)
  return Object.entries(PARTNERS).find(([, p]) => idOf(p) === id)?.[0] ?? null
}

/** This field comes with another that's on the same page. */
export function comesWithParent(f: Pick<CategoryField, 'label' | 'type'>, fields: readonly Pick<CategoryField, 'label' | 'type'>[]): boolean {
  const parent = parentId(f)
  return !!parent && fields.some((g) => idOf(g) === parent)
}

/** The page's partner of `parent`, if it has one. */
export function partnerOf<F extends Pick<CategoryField, 'label' | 'type'>>(fields: readonly F[], parent: Pick<CategoryField, 'label' | 'type'>): F | undefined {
  const rule = partnerRule(parent)
  return rule ? fields.find((g) => idOf(g) === idOf(rule)) : undefined
}
