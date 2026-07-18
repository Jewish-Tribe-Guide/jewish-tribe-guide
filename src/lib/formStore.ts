import { getAdminClient } from './supabase/admin'
import type { FormConfig, FormContent, FormStep } from './forms'

type FormRow = {
  id: string
  title: string
  submit_label: string
  success_title: string
  success_message: string
  steps: FormStep[]
  draft: FormContent | null
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
