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

/** Put the row into a known shape before driving the editor.
 *
 *  Both tests type into the body and then assert on what was stored, which
 *  quietly assumed the editor opens with the caret in a paragraph. It stopped
 *  being true the moment the real privacy copy grew section headings: the body
 *  now begins "<h2>Privacy Policy</h2>", Playwright's fill() replaces the text
 *  without leaving that first block, and everything typed came back as
 *  "<h2>…</h2>". Chrome's execCommand('bold') inside a heading is a no-op too —
 *  headings are already bold — so the formatting test lost its <strong> as
 *  well. Two failures, one cause, neither of them a bug in the app.
 *
 *  Seeding a single plain paragraph makes both tests independent of whatever
 *  the page happens to contain, which is the same rule the rest of the suite
 *  follows: don't depend on content an admin can edit. */
const SEED_BODY = '<p>Seed paragraph for the admin-write pages test.</p>'

test('editing a page through the real Pages tab saves to the database', async ({ page }) => {
  const supabase = getAdminClient()
  const { data: before } = await supabase.from('page').select('title,body').eq('slug', 'privacy').single()
  const originalBody = before!.body as string
  // The tab's buttons are labelled with the page's own title, which an admin
  // can rename — the same hardcoding broke e2e/routing.spec.ts once a page
  // was retitled "Privacy Policy and Terms of Use". Read it rather than
  // assume it.
  const title = before!.title as string

  const newBody = `E2E Admin Write ${randomUUID().slice(0, 8)}`

  try {
    await supabase.from('page').update({ body: SEED_BODY }).eq('slug', 'privacy')
    await page.goto('/admin/pages')
    await page.getByRole('button', { name: title, exact: true }).click()

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

// What this covers, and — measured, not assumed — what it does not.
//
// COVERS: that the Bold button is wired to something that actually formats
// text, and that the result travels through the save to the database. The
// test above cannot show this; a plain string goes in and comes back
// unchanged, exactly as the old <textarea> behaved, so it passed throughout
// the period when the editor itself was unverified.
//
// DOES NOT COVER, despite looking like it should: the toolbar button not
// stealing the caret when pressed (the onMouseDown preventDefault in
// RichTextEditor). That was checked directly — the line was removed and this
// test still passed, because Playwright's click doesn't move focus the way a
// real mouse press does. So do not rely on this test to protect that line;
// nothing currently does.
//
// ALSO NOT HERE FOR: the <b> → <strong> conversion. That's a pure function,
// covered faster and more thoroughly in src/lib/richText.test.ts. The
// assertions below check it only as a cheap side effect of already having the
// stored value in hand.
test('formatting applied in the Pages tab survives the save', async ({ page }) => {
  const supabase = getAdminClient()
  const { data: before } = await supabase.from('page').select('title,body').eq('slug', 'privacy').single()
  const originalBody = before!.body as string
  const title = before!.title as string

  const text = `Bold ${randomUUID().slice(0, 8)}`

  try {
    await supabase.from('page').update({ body: SEED_BODY }).eq('slug', 'privacy')
    await page.goto('/admin/pages')
    await page.getByRole('button', { name: title, exact: true }).click()

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
