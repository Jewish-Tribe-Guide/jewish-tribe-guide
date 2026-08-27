import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives PagesEditor's real save flow — the admin console's Pages tab (About/
// Privacy), added alongside this test. Unlike category-editor.spec.ts and
// form-editor.spec.ts, there's nothing to create or delete: `page` rows are
// singletons seeded by migration, so this edits a real row through the real
// UI and puts the original body back afterward, same restore pattern as
// e2e-cache/cache-roundtrip.spec.ts uses for site_settings.
//
// Deliberately targets "privacy", not "about": e2e-cache/cache-roundtrip.spec.ts
// has its own PATCH/poll/restore cycle against the "about" row, and this job
// (`admin-write` in ci.yml) runs concurrently with `cache-roundtrip` against
// the same shared test Supabase project — no `needs:` dependency between
// them. Both suites hitting the same singleton row raced in real CI (each
// could stomp the other's write mid-poll), which surfaced as an intermittent
// cache-roundtrip timeout with no actual caching bug behind it. Splitting the
// two suites onto different rows removes the race outright, rather than
// papering over it with a longer timeout.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

test('editing a page through the real Pages tab saves to the database', async ({ page }) => {
  const supabase = getAdminClient()
  const { data: before } = await supabase.from('page').select('body').eq('slug', 'privacy').single()
  const originalBody = before!.body as string

  const newBody = `E2E Admin Write ${randomUUID().slice(0, 8)}`

  try {
    await page.goto('/admin/pages')
    await page.getByRole('button', { name: 'Privacy Policy', exact: true }).click()

    // getByRole, not getByLabel('Body'): the body field is a WYSIWYG now, and
    // its toolbar is labelled "Page body formatting" — which getByLabel
    // matches on substring, so 'Body' resolved to both the toolbar and the
    // editor and failed strict mode. Addressing the textbox by role says what
    // this actually wants and can't be broadened by a future sibling control.
    const bodyField = page.getByRole('textbox', { name: 'Page body' })
    await bodyField.fill(newBody)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved.')).toBeVisible({ timeout: 10_000 })

    const { data: after } = await supabase.from('page').select('body').eq('slug', 'privacy').single()
    // Not toBe(newBody): the Pages tab stores sanitized HTML now rather than
    // the raw string the old <textarea> saved, so typing a line into the
    // contenteditable arrives as "<p>…</p>". What this test is for is that
    // what was typed reached the database through the real UI — so it asserts
    // the text is there and that it arrived as markup, without pinning the
    // exact wrapper a browser chooses to put around a typed line.
    expect(after!.body).toContain(newBody)
    expect(after!.body).toMatch(/^<p>/)
  } finally {
    await supabase.from('page').update({ body: originalBody }).eq('slug', 'privacy')
  }
})

// The half the test above doesn't reach. Editing the body as plain text goes
// through the WYSIWYG without exercising any of it — the stored value comes
// back as the same plain string it went in as, which is exactly what the old
// <textarea> did too. So that test kept passing while the whole point of the
// editor went unverified, and it's how a strict-mode break in the Pages tab
// reached CI unnoticed.
//
// This drives the real toolbar and asserts on what lands in the database,
// which is the only place the full chain shows up: contenteditable produces
// <b>, the client sanitizer rewrites it to <strong>, the PATCH route
// sanitizes again, and the row has to end up holding markup rather than the
// styled spans a browser might have emitted.
test('formatting applied in the Pages tab survives the save', async ({ page }) => {
  const supabase = getAdminClient()
  const { data: before } = await supabase.from('page').select('body').eq('slug', 'privacy').single()
  const originalBody = before!.body as string

  const text = `Bold ${randomUUID().slice(0, 8)}`

  try {
    await page.goto('/admin/pages')
    await page.getByRole('button', { name: 'Privacy Policy', exact: true }).click()

    const bodyField = page.getByRole('textbox', { name: 'Page body' })
    await bodyField.fill(text)
    // Select what was just typed, then bold it through the actual toolbar
    // button rather than a keyboard shortcut — the button is the thing that
    // has to keep the selection alive (it preventDefaults mousedown for
    // exactly that reason), and a shortcut would route around the bug that
    // would break.
    await bodyField.press('ControlOrMeta+a')
    await page.getByRole('button', { name: 'Bold (⌘B)' }).click()

    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved.')).toBeVisible({ timeout: 10_000 })

    const { data: after } = await supabase.from('page').select('body').eq('slug', 'privacy').single()
    const saved = after!.body as string
    expect(saved).toContain(text)
    // <strong>, not <b>: the sanitizer canonicalises what contenteditable
    // emits, and storing <b> would mean it had been bypassed.
    expect(saved).toMatch(/<strong>/)
    expect(saved).not.toMatch(/<b>/)
  } finally {
    await supabase.from('page').update({ body: originalBody }).eq('slug', 'privacy')
  }
})
