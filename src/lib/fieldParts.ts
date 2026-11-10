import type { CategoryField } from './categories'

// ── A field with parts (the user, Nov 10, boards E1b-E3b) ──────────────────
// Some fields always go together, so they are one field: a hechsher, with
// its "Everything here is kosher?" and what isn't (its caveat), and its
// certificate's link; Delivery details, with the WhatsApp group to join
// (a link whose leadBox names them). The parts are switches on the field's
// own screen, never rows of their own in a box, and they go wherever the
// field goes: the admin's list, the listing, the editor.

/** The field's parts, in the order the editor asks them: a hechsher's
 *  certificate right under it (the user, Oct 11), then its questions. */
export function partsOf(f: CategoryField, fields: readonly CategoryField[]): CategoryField[] {
  const byKey = (k: string) => fields.find((o) => o.key === k)
  if (f.caveat) {
    return [...fields.filter(isCertificateLink), byKey(f.caveat.flagField), byKey(f.caveat.noteField)].filter((o): o is CategoryField => !!o && o !== f)
  }
  return fields.filter((o) => o.type === 'url' && o.leadBox?.text === f.key)
}

/** Every field that is another's part. A certificate's link is a hechsher's
 *  only when the page has one; on its own it's a link like any other. */
export function partKeys(fields: readonly CategoryField[]): Set<string> {
  return new Set(fields.flatMap((f) => partsOf(f, fields).map((p) => p.key)))
}

/** The field a part belongs to. */
export function ownerOfPart(key: string, fields: readonly CategoryField[]): CategoryField | undefined {
  return fields.find((f) => partsOf(f, fields).some((p) => p.key === key))
}

/** Whether a field has parts. */
export const hasParts = (f: CategoryField, fields: readonly CategoryField[]) => partsOf(f, fields).length > 0

/** A link to a hechsher's certificate, by its name: not a website. */
export function isCertificateLink(field: CategoryField): boolean {
  const words = `${field.key} ${field.linkLabel ?? field.label}`.toLowerCase()
  return field.type === 'url' && !/website/.test(words) && /certif|hechsher|kosher/.test(words)
}
