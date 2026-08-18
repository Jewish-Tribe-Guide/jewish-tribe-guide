import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { dismissLocationPrompt } from '../e2e/helpers'
import { FORM_E2E_FORM_ID } from '../scripts/formE2eConstants.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Fills out and submits a real wizard, then confirms the response actually
// landed in the database — the gap AGENTS.md calls out directly: "the
// branching DSL that decides which questions get asked is unit-tested
// (forms.test.ts), but nothing fills in a wizard and posts it, because a
// passing test would leave a real request in someone's inbox." Runs against
// the disposable test Supabase project (see run-test-project-server.mjs),
// so there's no real inbox for it to land in, and it cleans up after itself.
//
// No admin session needed — submitting a form is a public endpoint. Reading
// it back and cleaning up use a plain service-role client built from the
// same TEST_SUPABASE_* vars playwright.form.config.ts already validated and
// remapped in this process.
//
// Drives the real UI (not a raw POST to /api/requests) deliberately: the
// point is proving the branching DSL → Wizard.tsx → API → database pipeline
// end to end, not just the API in isolation — forms.test.ts already covers
// evaluateCondition/stepIsVisible as pure logic. The seeded form
// (run-test-project-server.mjs) mirrors DEFAULT_CONTACT_STEPS' own
// branching (a single-select step whose two variants depend on whether
// phone/email were given), so filling both here exercises a real branch,
// not just the default path.
// ─────────────────────────────────────────────────────────────────────────────

test('a real wizard submission reaches the database', async ({ page, request }) => {
  const initial = await page.goto('/')
  if (!initial) throw new Error('No response for "/"')
  const community = new URL(page.url()).pathname.split('/').filter(Boolean)[0]
  expect(community, 'the "/" redirect should land on a community').toBeTruthy()

  const uniqueEmail = `e2e-form-test-${Date.now()}@test.invalid`
  const uniqueName = `E2E Form Test ${Date.now()}`

  await page.goto(`/${community}/${FORM_E2E_FORM_ID}`)
  // The "Share your live location?" prompt overlays everything and
  // intercepts clicks — same real-visitor treatment AGENTS.md documents for
  // the rest of this repo's e2e suite.
  await dismissLocationPrompt(page)

  // Step 1: name (plain text).
  await page.getByPlaceholder('Your full name').fill(uniqueName)
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 2: contact (phone + email, at least one required) — both given so
  // the branching single-select step below has a step to actually show.
  await page.locator('#wizard-contact-phone').fill('2155550100')
  await page.locator('#wizard-contact-email').fill(uniqueEmail)
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 3: preferredContact (single-select, branches on phone+email both
  // present — see the seeded form's second `preferredContact` variant).
  // Single-select auto-advances on click, no Continue button.
  await expect(page.getByRole('heading', { name: 'How should we reach you?' })).toBeVisible()
  await page.getByRole('button', { name: 'Email me' }).click()

  // Step 4: an optional trailing text step — exists specifically so this
  // form has a real Submit button (Wizard.tsx never renders one for a
  // 'single'-kind last step, see run-test-project-server.mjs's comment).
  // Left blank on purpose (it's optional) — submitting an unanswered
  // optional field is itself part of what's being proven.
  await page.getByRole('button', { name: 'Submit' }).click()

  // The visitor-facing signal: the real success screen, with the real
  // successMessage this seeded form was given (not a generic default).
  await expect(page.getByRole('heading', { name: 'All set' })).toBeVisible()
  await expect(page.getByText('Thanks — this is a test submission from the form-roundtrip e2e suite.')).toBeVisible()

  // The actual proof: a real row landed in the database, not just a happy
  // UI state a failed background request could have left behind.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  try {
    const { data: response, error } = await supabase
      .from('form_response')
      .select('*')
      .eq('form_id', FORM_E2E_FORM_ID)
      .eq('contact->>email', uniqueEmail)
      .maybeSingle()

    expect(error, error?.message).toBeNull()
    expect(response, 'no form_response row landed for this submission').not.toBeNull()
    // buildContact() (contactSteps.ts) — fullName/preferredContact live on
    // `contact`, not `data`; `data` is only the form's own non-reserved steps.
    expect(response.contact.fullName).toBe(uniqueName)
    expect(response.contact.phone).toContain('215')
    expect(response.contact.preferredContact).toBe('email')

    // Confirm the API path this test drives is the same real endpoint the
    // request assertions in api.spec.ts already refuse unauthenticated
    // callers on — reachable independently via `request`, no extra setup.
    const apiCheck = await request.get('/api/forms')
    expect(apiCheck.ok()).toBe(true)
    const forms = (await apiCheck.json()).forms as { id: string }[]
    expect(forms.some((f) => f.id === FORM_E2E_FORM_ID)).toBe(true)
  } finally {
    // Not something this suite owns long-term — clean up every response to
    // this form, not just the one just created, in case an earlier failed
    // run left one behind.
    await supabase.from('form_response').delete().eq('form_id', FORM_E2E_FORM_ID)
  }
})
