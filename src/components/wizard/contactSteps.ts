import type { Answers } from './Wizard'

// The "name + contact + preference" question block itself now lives in the
// data-driven form config (see src/data/forms.js's CONTACT_STEPS, seeded into
// both the support and volunteer forms) so it's editable from /admin. This
// file just keeps the one bit of submit-time logic both wizards share: pulling
// the collected contact answers into the shape submitRequest expects.

/** Pulls the shared contact fields out of the collected answers. Email-only
 *  contacts skip the preference question, so default it to email. */
export function buildContact(a: Answers) {
  const str = (id: string) => (typeof a[id] === 'string' ? (a[id] as string) : '')
  const phone = str('phone')
  const email = str('email')
  return {
    fullName: str('name'),
    phone,
    email,
    preferredContact: str('preferredContact') || (email && !phone ? 'email' : ''),
  }
}
