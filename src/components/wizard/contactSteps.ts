import type { Answers, Step } from './Wizard'

// Name + contact + (dynamic) preferred-contact, shared by both wizards so the
// "how can we reach you" experience is identical. These sit right after the
// opening "what do you need / how can you help" question.
//
//  - phone only        → ask call vs text
//  - phone AND email   → ask call vs text vs email
//  - email only        → no preference question (it's obviously email)
const SECTION = '👋 Your details'

export const contactSteps: Step[] = [
  {
    id: 'name',
    kind: 'text',
    section: SECTION,
    question: 'What’s your name?',
    placeholder: 'Your full name',
  },
  {
    id: 'contact',
    kind: 'contact',
    section: SECTION,
    question: 'How can we reach you?',
  },
  {
    id: 'preferredContact',
    kind: 'single',
    section: SECTION,
    when: (a) => !!(a.phone as string)?.trim() && !(a.email as string)?.trim(),
    question: 'How should we reach you?',
    options: [
      { value: 'phone', label: 'Call me' },
      { value: 'text', label: 'Text me' },
    ],
  },
  {
    id: 'preferredContact',
    kind: 'single',
    section: SECTION,
    when: (a) => !!(a.phone as string)?.trim() && !!(a.email as string)?.trim(),
    question: 'How should we reach you?',
    options: [
      { value: 'phone', label: 'Call me' },
      { value: 'text', label: 'Text me' },
      { value: 'email', label: 'Email me' },
    ],
  },
]

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
