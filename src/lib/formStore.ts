import { getAdminClient } from './supabase/admin'
import { DEFAULT_CONTACT_STEPS, type FormConfig, type FormContent, type FormStep } from './forms'

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

// Creates a new form, picking a unique slug from its title — same pattern as
// categoryStore.createCategory. Called only from the admin's Publish button
// on a brand-new (never-yet-saved) form — see FormEditor.tsx — so a form
// never exists, even in the admin list, until it's actually published; there
// is deliberately no "create a blank draft" step before that. Falls back to
// the standard contact step block if the admin published with none, so it's
// always a usable, submittable form.
export async function createForm(content: FormContent): Promise<FormConfig> {
  const supabase = getAdminClient()
  const base = slugify(content.title) || 'form'

  let id = base
  for (let n = 2; ; n++) {
    const { data } = await supabase.from('form').select('id').eq('id', id).maybeSingle()
    if (!data) break
    id = `${base}-${n}`
  }

  const row = {
    id,
    title: content.title.trim(),
    submit_label: content.submitLabel.trim() || 'Submit',
    success_title: content.successTitle.trim() || 'All set',
    success_message: content.successMessage.trim() || 'Thanks — we’ll be in touch.',
    steps: content.steps.length > 0 ? content.steps : DEFAULT_CONTACT_STEPS,
    icon: content.icon?.trim() || null,
    card_image_url: content.cardImageUrl?.trim() || null,
    card_text_color: content.cardImageUrl?.trim() ? content.cardTextColor || null : null,
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
