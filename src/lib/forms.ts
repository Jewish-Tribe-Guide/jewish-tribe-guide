// ─────────────────────────────────────────────────────────────────────────────
// Form types.
//
// The guided intake wizards (Request Support, Volunteer) are data-driven, same
// pattern as categories.ts/categoryStore.ts: definitions live in the `form`
// table so an admin can add/reorder/retitle questions from /admin without a
// deploy. This file holds the shared types plus the branching condition DSL —
// a serializable stand-in for the hand-written `when: (answers) => boolean`
// predicates the wizards used before. Server code reads forms via
// formStore.ts; client code fetches them from `GET /api/forms`.
// ─────────────────────────────────────────────────────────────────────────────

export type StepKind = 'single' | 'multi' | 'text' | 'tel' | 'number' | 'date' | 'textarea' | 'contact'

/** The step kinds offered in the admin editor's Type picker. `contact` is
 *  omitted — it's the one bespoke phone+email screen, not something to
 *  hand-add a second of. */
export const STEP_KINDS: { value: StepKind; label: string }[] = [
  { value: 'single', label: 'Single choice' },
  { value: 'multi', label: 'Multiple choice' },
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'tel', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
]

export const STEP_KIND_HAS_OPTIONS = (kind: StepKind): boolean => kind === 'single' || kind === 'multi'

export type StepOption = { value: string; label: string; icon?: string }

/** One branching condition, evaluated against the answers collected so far.
 *  A step's conditions are ALL required (AND) — see stepIsVisible. */
export type StepCondition = {
  /** The id (answer key) of an earlier step. */
  field: string
  op: 'includes' | 'notIncludes' | 'notEmpty' | 'empty'
  /** Required for includes/notIncludes; unused for notEmpty/empty. */
  value?: string
}

export type FormStep = {
  /** The answer key this step writes to. Two steps MAY share an id when
   *  they're mutually exclusive branches of the same underlying question shown
   *  in different contexts (e.g. "which hospital and room" asked once under
   *  Meals and once under Visit) — only one is ever visible at a time, so they
   *  never collide. Frozen once created: past submissions and the admin sheet
   *  are keyed by it. */
  id: string
  kind: StepKind
  question: string
  hint?: string
  /** Small eyebrow above the question naming the section, e.g. "🍽️ Meals". */
  section?: string
  placeholder?: string
  /** Optional steps can be skipped; required ones block until answered. */
  optional?: boolean
  /** Shown only when every condition holds. Omitted/empty = always shown. */
  when?: StepCondition[]
  /** For kind 'single' | 'multi'. */
  options?: StepOption[]
  /** For kind 'single' | 'multi' whose options are generated at render time
   *  from live app data instead of being stored — currently only 'hospitals'
   *  (the volunteer form's "Where can you help?"). Takes precedence over
   *  `options` when present. */
  optionsSource?: 'hospitals'
}

/** The editable copy — title, wizard chrome text, and steps — shared by both
 *  the published record and an in-progress draft. */
export type FormContent = {
  title: string
  submitLabel: string
  successTitle: string
  successMessage: string
  steps: FormStep[]
  /** One emoji shown on the form's home-screen card. */
  icon?: string
  /** A photo for the card's background instead of the flat tint. */
  cardImageUrl?: string | null
  /** Text color over `cardImageUrl` (a hex string). Ignored without an image. */
  cardTextColor?: string | null
}

export type FormConfig = FormContent & {
  /** 'support' | 'volunteer'. */
  id: string
  /** Unpublished admin edits (a full copy, so the preview can run the real
   *  Wizard against it), or null/undefined if there are none. */
  draft?: FormContent | null
}

// The same "name / how can we reach you / preferred contact" block every
// existing form (support, volunteer) starts with — see CONTACT_STEPS in
// src/data/forms.js. A brand-new custom form (admin's FormEditor, before it's
// ever published) is pre-filled with a copy so buildContact()
// (src/components/wizard/contactSteps.ts) always has something to read,
// without requiring the admin to hand-assemble it (the step-type picker in
// the admin editor deliberately doesn't offer 'contact' as a pickable type —
// see STEP_KINDS above). Shared by the client (FormEditor's new-form default)
// and the server (formStore.createForm's fallback if steps end up empty).
const CONTACT_SECTION = '👋 Your details'
export const DEFAULT_CONTACT_STEPS: FormStep[] = [
  { id: 'name', kind: 'text', section: CONTACT_SECTION, question: 'What’s your name?', placeholder: 'Your full name' },
  { id: 'contact', kind: 'contact', section: CONTACT_SECTION, question: 'How can we reach you?' },
  {
    id: 'preferredContact',
    kind: 'single',
    section: CONTACT_SECTION,
    when: [{ field: 'phone', op: 'notEmpty' }, { field: 'email', op: 'empty' }],
    question: 'How should we reach you?',
    options: [
      { value: 'phone', label: 'Call me' },
      { value: 'text', label: 'Text me' },
    ],
  },
  {
    id: 'preferredContact',
    kind: 'single',
    section: CONTACT_SECTION,
    when: [{ field: 'phone', op: 'notEmpty' }, { field: 'email', op: 'notEmpty' }],
    question: 'How should we reach you?',
    options: [
      { value: 'phone', label: 'Call me' },
      { value: 'text', label: 'Text me' },
      { value: 'email', label: 'Email me' },
    ],
  },
]

/** Turns a human question into a safe step id, e.g. "How many guests?" →
 *  "how_many_guests". Used by the admin step editor to auto-fill new step ids. */
export function slugifyStepId(question: string): string {
  return question
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Evaluates a single condition against the answers collected so far. `value`
// may be a string (text/single) or string[] (multi); array fields are matched
// with includes/notIncludes, scalar fields with notEmpty/empty.
export function evaluateCondition(condition: StepCondition, answers: Record<string, unknown>): boolean {
  const v = answers[condition.field]
  switch (condition.op) {
    case 'includes':
      return Array.isArray(v) ? v.includes(condition.value) : v === condition.value
    case 'notIncludes':
      return Array.isArray(v) ? !v.includes(condition.value) : v !== condition.value
    case 'notEmpty':
      return Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : !!v
    case 'empty':
      return Array.isArray(v) ? v.length === 0 : typeof v === 'string' ? v.trim() === '' : !v
  }
}

/** Whether a step should be shown given the answers collected so far — every
 *  one of its conditions must hold (AND). No conditions = always shown. */
export function stepIsVisible(step: FormStep, answers: Record<string, unknown>): boolean {
  if (!step.when || step.when.length === 0) return true
  return step.when.every((c) => evaluateCondition(c, answers))
}
