import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
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
  active: boolean
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
    active: row.active !== false,
  }
}

// Every form, published content only — no drafts — and filtered to active
// forms. Used by the public GET /api/forms that the live wizards read, and
// by everything downstream that resolves a form's URL (sitemap, direct-URL
// resolution). An inactive form is invisible here but still returned by
// listFormsForAdmin, so the admin manager can edit and re-activate it.
export async function listPublishedForms(community: string): Promise<Omit<FormConfig, 'draft'>[]> {
  'use cache'
  cacheTag(TAGS.forms(community))
  cacheLife('days')
  const { data, error } = await getAdminClient()
    .from('form')
    .select('*')
    .eq('community_id', community)
    .order('id')
  if (error) throw new Error(`Failed to load forms: ${error.message}`)
  return (data as FormRow[]).map(toConfig).filter((f) => f.active !== false)
}

// Every form including drafts, for the admin Forms manager.
export async function listFormsForAdmin(community: string): Promise<FormConfig[]> {
  const { data, error } = await getAdminClient()
    .from('form')
    .select('*')
    .eq('community_id', community)
    .order('id')
  if (error) throw new Error(`Failed to load forms: ${error.message}`)
  return (data as FormRow[]).map(toConfig)
}

export async function getFormById(community: string, id: string): Promise<FormConfig | null> {
  const { data, error } = await getAdminClient()
    .from('form')
    .select('*')
    .eq('community_id', community)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Failed to load form: ${error.message}`)
  return data ? toConfig(data as FormRow) : null
}

// Saves a full draft copy (title/chrome text/steps) for a form, leaving the
// published content untouched until publishDraft is called.
export async function saveDraft(community: string, id: string, draft: FormContent): Promise<FormConfig | null> {
  const { data, error } = await getAdminClient()
    .from('form')
    .update({ draft, updated_at: new Date().toISOString() })
    .eq('community_id', community)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to save draft: ${error.message}`)
  return data ? toConfig(data as FormRow) : null
}

// Promotes a form's draft to published content, then clears the draft. No-op
// (returns the form as-is) if there's no draft to publish.
export async function publishDraft(community: string, id: string): Promise<FormConfig | null> {
  const form = await getFormById(community, id)
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
    .eq('community_id', community)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to publish form: ${error.message}`)
  return data ? toConfig(data as FormRow) : null
}

// Discards a form's draft, leaving published content untouched.
export async function discardDraft(community: string, id: string): Promise<FormConfig | null> {
  const { data, error } = await getAdminClient()
    .from('form')
    .update({ draft: null })
    .eq('community_id', community)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to discard draft: ${error.message}`)
  return data ? toConfig(data as FormRow) : null
}

// Wired directly into their own wizard components (SupportWizard/
// VolunteerWizard) — deleteForm below refuses to touch either one, since
// deleting them would break those wizards outright. Hiding them (active:
// false) is fine — the home-screen cards check the form's active state via
// useEntryCards (sections.tsx), same as any other category.
const PROTECTED_FORM_IDS = new Set(['support', 'volunteer'])

// Turns a form's public visibility on/off. Applies immediately to the
// published row, independent of any pending draft — unlike saveDraft/
// publishDraft, there's nothing to publish here, just a direct flip.
export async function setFormActive(community: string, id: string, active: boolean): Promise<FormConfig | null> {
  const { data, error } = await getAdminClient()
    .from('form')
    .update({ active })
    .eq('community_id', community)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to update form: ${error.message}`)
  return data ? toConfig(data as FormRow) : null
}

// Creates a new form, picking a unique slug from its title — same pattern as
// categoryStore.createCategory. Called only from the admin's Publish button
// on a brand-new (never-yet-saved) form — see FormEditor.tsx — so a form
// never exists, even in the admin list, until it's actually published; there
// is deliberately no "create a blank draft" step before that. Falls back to
// the standard contact step block if the admin published with none, so it's
// always a usable, submittable form.
export async function createForm(community: string, content: FormContent): Promise<FormConfig> {
  const supabase = getAdminClient()
  const base = slugify(content.title) || 'form'

  // Scoped by community — the same id in another community's form table is a
  // different row (composite primary key), so a global uniqueness check
  // would wrongly refuse a slug that community isn't even using.
  let id = base
  for (let n = 2; ; n++) {
    const { data } = await supabase
      .from('form')
      .select('id')
      .eq('community_id', community)
      .eq('id', id)
      .maybeSingle()
    if (!data) break
    id = `${base}-${n}`
  }

  const row = {
    id,
    community_id: community,
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

// Permanently deletes a form and every response to it (form_response has no
// DB cascade on form_id, so responses are removed first — same order as
// categoryStore.deleteCategory). The two built-in forms are wired directly
// into the home screen (Landing.tsx) and their own wizard components
// (SupportWizard/VolunteerWizard) — deleting them would break those, so it's
// blocked here rather than only hidden in the UI.
export async function deleteForm(community: string, id: string): Promise<{ responses: number }> {
  if (PROTECTED_FORM_IDS.has(id)) {
    throw new Error('The Support and Volunteer forms can’t be deleted.')
  }

  const supabase = getAdminClient()

  // form_response.form_id is a plain text column, not scoped by community_id
  // on its own — filtered by community as well so a same-id form in another
  // community can't have its responses swept up by this delete.
  const { count } = await supabase
    .from('form_response')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', community)
    .eq('form_id', id)

  const { error: responsesErr } = await supabase
    .from('form_response')
    .delete()
    .eq('community_id', community)
    .eq('form_id', id)
  if (responsesErr) throw new Error(`Failed to delete the form's responses: ${responsesErr.message}`)

  const { error: formErr } = await supabase
    .from('form')
    .delete()
    .eq('community_id', community)
    .eq('id', id)
  if (formErr) throw new Error(`Failed to delete form: ${formErr.message}`)

  return { responses: count ?? 0 }
}
