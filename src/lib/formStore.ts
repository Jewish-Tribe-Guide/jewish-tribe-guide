import { getAdminClient } from './supabase/admin'
import type { FormConfig, FormContent, FormStep } from './forms'

// The same "name / how can we reach you / preferred contact" block every
// existing form (support, volunteer) starts with — see CONTACT_STEPS in
// src/data/forms.js. A fresh custom form is seeded with a copy so
// buildContact() (src/components/wizard/contactSteps.ts) always has
// something to read, without requiring the admin to hand-assemble it (the
// step-type picker in the admin editor deliberately doesn't offer 'contact'
// as a pickable type — see STEP_KINDS in forms.ts).
const CONTACT_SECTION = '👋 Your details'
const DEFAULT_CONTACT_STEPS: FormStep[] = [
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

// Turns a human label into a URL-safe slug, e.g. "Event RSVP" → "event-rsvp".
// Mirrors categoryStore.slugify — small enough not to be worth sharing.
function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type FormRow = {
  id: string
  title: string
  submit_label: string
  success_title: string
  success_message: string
  steps: FormStep[]
  draft: FormContent | null
  icon: string | null
  card_image_url: string | null
  card_text_color: string | null
}

function toConfig(row: FormRow): FormConfig {
  return {
    id: row.id,
    title: row.title,
    submitLabel: row.submit_label,
    successTitle: row.success_title,
    successMessage: row.success_message,
    steps: row.steps ?? [],
    draft: row.draft ?? null,
    icon: row.icon ?? '',
    cardImageUrl: row.card_image_url,
    cardTextColor: row.card_text_color,
  }
}

// Every form, published content only — no drafts. Used by the public
// GET /api/forms that the live wizards read.
export async function listPublishedForms(): Promise<Omit<FormConfig, 'draft'>[]> {
  const { data, error } = await getAdminClient().from('form').select('*').order('id')
  if (error) throw new Error(`Failed to load forms: ${error.message}`)
  return (data as FormRow[]).map(toConfig)
}

// Every form including drafts, for the admin Forms manager.
export async function listFormsForAdmin(): Promise<FormConfig[]> {
  const { data, error } = await getAdminClient().from('form').select('*').order('id')
  if (error) throw new Error(`Failed to load forms: ${error.message}`)
  return (data as FormRow[]).map(toConfig)
}

export async function getFormById(id: string): Promise<FormConfig | null> {
  const { data, error } = await getAdminClient().from('form').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load form: ${error.message}`)
  return data ? toConfig(data as FormRow) : null
}

// Saves a full draft copy (title/chrome text/steps) for a form, leaving the
// published content untouched until publishDraft is called.
export async function saveDraft(id: string, draft: FormContent): Promise<FormConfig | null> {
  const { data, error } = await getAdminClient()
    .from('form')
    .update({ draft, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to save draft: ${error.message}`)
  return data ? toConfig(data as FormRow) : null
}

// Promotes a form's draft to published content, then clears the draft. No-op
// (returns the form as-is) if there's no draft to publish.
export async function publishDraft(id: string): Promise<FormConfig | null> {
  const form = await getFormById(id)
  if (!form) return null
  if (!form.draft) return form

  const { data, error } = await getAdminClient()
    .from('form')
    .update({
      title: form.draft.title,
      submit_label: form.draft.submitLabel,
      success_title: form.draft.successTitle,
      success_message: form.draft.successMessage,
      steps: form.draft.steps,
      icon: form.draft.icon?.trim() || null,
      card_image_url: form.draft.cardImageUrl?.trim() || null,
      card_text_color: form.draft.cardImageUrl?.trim() ? form.draft.cardTextColor : null,
      draft: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to publish form: ${error.message}`)
  return data ? toConfig(data as FormRow) : null
}

// Discards a form's draft, leaving published content untouched.
export async function discardDraft(id: string): Promise<FormConfig | null> {
  const { data, error } = await getAdminClient()
    .from('form')
    .update({ draft: null })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to discard draft: ${error.message}`)
  return data ? toConfig(data as FormRow) : null
}

// Creates a new form, picking a unique slug from its label — same pattern as
// categoryStore.createCategory. Published immediately (no draft) with the
// standard contact step block, so it's a usable, submittable form right away;
// the admin adds its actual questions afterward in the same editor used for
// support/volunteer.
export async function createForm(label: string): Promise<FormConfig> {
  const supabase = getAdminClient()
  const base = slugify(label) || 'form'

  let id = base
  for (let n = 2; ; n++) {
    const { data } = await supabase.from('form').select('id').eq('id', id).maybeSingle()
    if (!data) break
    id = `${base}-${n}`
  }

  const row = {
    id,
    title: label.trim(),
    submit_label: 'Submit',
    success_title: 'All set',
    success_message: 'Thanks — we’ll be in touch.',
    steps: DEFAULT_CONTACT_STEPS,
  }

  const { data, error } = await supabase.from('form').insert(row).select('*').single()
  if (error) throw new Error(`Failed to create form: ${error.message}`)
  return toConfig(data as FormRow)
}

const PROTECTED_FORM_IDS = new Set(['support', 'volunteer'])

// Permanently deletes a form and every response to it (form_response has no
// DB cascade on form_id, so responses are removed first — same order as
// categoryStore.deleteCategory). The two built-in forms are wired directly
// into the home screen (Landing.tsx) and their own wizard components
// (SupportWizard/VolunteerWizard) — deleting them would break those, so it's
// blocked here rather than only hidden in the UI.
export async function deleteForm(id: string): Promise<{ responses: number }> {
  if (PROTECTED_FORM_IDS.has(id)) {
    throw new Error('The Support and Volunteer forms can’t be deleted.')
  }

  const supabase = getAdminClient()

  const { count } = await supabase
    .from('form_response')
    .select('id', { count: 'exact', head: true })
    .eq('form_id', id)

  const { error: responsesErr } = await supabase.from('form_response').delete().eq('form_id', id)
  if (responsesErr) throw new Error(`Failed to delete the form's responses: ${responsesErr.message}`)

  const { error: formErr } = await supabase.from('form').delete().eq('id', id)
  if (formErr) throw new Error(`Failed to delete form: ${formErr.message}`)

  return { responses: count ?? 0 }
}
