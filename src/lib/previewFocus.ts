import type { CategoryConfig, CategoryField } from './categories'

// The category editor's preview, on the field an admin is looking at: the
// page's copy with that field in it and showing, and the key Adding opens
// on (ListingEditor's startOpen). The user, Nov 7 and again Nov 9: "when
// you click on the adding screen the field isn't there." Three ways it
// wasn't, each fixed here:
//
// - A field being made, not named yet, had no key and no label: a blank
//   "+" line, and nothing to open. It goes by 'new', called "New field".
// - A field shown only after another answer (Delivery Details, once Store
//   Type is Scheduled Deliveries) stayed hidden behind it: here it shows.
// - A field not on the page yet (Add a field) is put on it.

export const NEW_FIELD_KEY = 'new'

export function focusOn(category: CategoryConfig, field: CategoryField | 'address' | 'phone' | undefined): { category: CategoryConfig; focus?: string } {
  if (!field) return { category }
  if (field === 'address' || field === 'phone') return { category, focus: field }
  const key = field.key || NEW_FIELD_KEY
  const shown = (f: CategoryField): CategoryField => ({ ...f, key, label: f.label.trim() || 'New field', showIf: undefined })
  const at = category.detailFields.findIndex((f) => f.key === field.key)
  const detailFields = at >= 0 ? category.detailFields.map((f, i) => (i === at ? shown(f) : f)) : [...category.detailFields, shown(field)]
  return { category: { ...category, detailFields }, focus: key }
}
