'use client'

import { useEffect, useState } from 'react'
import type { FormConfig } from '@/lib/forms'
import { forms as seededForms } from '@/data/forms.js'

type SeedForm = {
  id: string
  title: string
  submit_label: string
  success_title: string
  success_message: string
  steps: FormConfig['steps']
}

// Shown when /api/forms is unreachable (e.g. local dev without Supabase
// credentials) so the request/volunteer forms never go dark.
const FALLBACK_FORMS: FormConfig[] = (seededForms as SeedForm[]).map((f) => ({
  id: f.id,
  title: f.title,
  submitLabel: f.submit_label,
  successTitle: f.success_title,
  successMessage: f.success_message,
  steps: f.steps,
}))

// Module-level cache — shared across both wizards.
let cache: FormConfig[] | null = null
let inflight: Promise<FormConfig[]> | null = null

/** Every published form, or null while loading. Falls back to the seeded
 *  form set (src/data/forms.js) if the API fails or returns nothing. */
export function useForms(): FormConfig[] | null {
  const [forms, setForms] = useState<FormConfig[] | null>(cache)

  useEffect(() => {
    if (cache) return
    inflight ??= fetch('/api/forms')
      .then((res) => res.json())
      .then((body) =>
        body.ok && (body.forms as FormConfig[]).length > 0 ? (body.forms as FormConfig[]) : FALLBACK_FORMS,
      )
      .catch(() => FALLBACK_FORMS)
    let active = true
    inflight.then((loaded) => {
      cache = loaded
      if (active) setForms(loaded)
    })
    return () => {
      active = false
    }
  }, [])

  return forms
}

/** The published config for one form by id, or null while loading / not found. */
export function useForm(id: string): FormConfig | null {
  return useForms()?.find((f) => f.id === id) ?? null
}
