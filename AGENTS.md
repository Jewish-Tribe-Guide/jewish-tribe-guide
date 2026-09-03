<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Only when a task actually touches Next.js framework mechanics — routing/`app` directory conventions, data fetching, server actions, middleware, `next.config.ts`, or other file conventions — read the matching guide in `node_modules/next/dist/docs/` first and heed its deprecation notices. Ordinary component/logic edits that don't call a Next.js API directly don't need this.
<!-- END:nextjs-agent-rules -->

# Local admin access

Default to the **local** admin console (`npm run dev`, then `http://localhost:3000/philly/admin?devToken=<DEV_ADMIN_BYPASS_SECRET>`) instead of the deployed one — the secret is in `.env.local` as `DEV_ADMIN_BYPASS_SECRET`. This hits `/api/admin/dev-login`, which signs you in instantly and works only when `NODE_ENV !== 'production'` (so it's a no-op against a real deployment — see that route's own comments). No magic-link email needed. `/admin` (no community segment, `?devToken=` works there too) is a different, standalone page — the superadmin console (`src/app/admin/page.tsx`), gated by the global `SUPERADMIN_EMAILS` list rather than any one community's `admin_email` — for cross-community actions like creating a new community. It no longer redirects to `/philly/admin`.

# Never write to production without being told to, every time

`.env.local` carries `PROD_SUPABASE_URL` and `PROD_SUPABASE_SERVICE_ROLE_KEY`
so `sync-dev-from-prod` can READ production. They also grant full write access
to the live database, and nothing technical stops that being used.

So the rule is behavioural, and it is absolute: **do not write to production
without an explicit go-ahead in the same exchange.** That covers running a
migration script with `--prod --apply`, editing rows through the Supabase
client, and any "while I'm here" follow-up to a write that was approved
earlier. Approval is per-action, never standing. Show the dry run, say plainly
what will change, and wait.

Reversibility is not authorisation. Taking a backup first is right and does not
substitute for asking — that mistake has already been made here: a category
colour rewrite and three edits to the live privacy policy went out on inferred
intent because a backup existed and the change looked obviously wanted.

Two failure modes worth naming, both of which have happened:

- **Ordering.** Content written for code that hasn't deployed yet renders as
  raw markup on the live site. Deploy first, verify, then migrate the content.
- **Invalidation.** A write made straight to the database bypasses the cache
  invalidation every admin save performs, so the site keeps serving the old
  copy for a day and it looks like the write silently failed. Redeploy, or
  `POST /api/admin/revalidate`.

Reads are fine. Dry runs are fine. The moment it writes, ask.

# Tests

```bash
npm test                    # unit — pure logic, fast, run constantly
npm run test:e2e            # end-to-end — builds and starts the app, ~1 min
npm run test:integration    # store-level reads/writes against a disposable test Supabase project
npm run test:cache-roundtrip  # proves an admin save actually reaches the cached page (e2e-cache/)
npm run test:form-roundtrip   # fills in and submits a real intake wizard (e2e-form/)
npm run test:admin-write      # signs in and drives /admin for real: approve/reject, category/form CRUD (e2e-admin-write/)
npm run test:all            # unit + e2e only — the four suites above need TEST_SUPABASE_* and run separately/in CI
```

The last four run against a **disposable second Supabase project** (`TEST_SUPABASE_*` env vars), specifically so they're free to write and delete real rows — unlike everything in `e2e/`. See each suite's own `e2e-*/auth.setup.ts` for the mechanism.

## Which suite covers what you just touched

`test:all` is unit + e2e **only**. The four `TEST_SUPABASE_*` suites are not in
it, not in `npm test`, and not in `test:e2e` — so a change to something they
cover passes everything you'd normally run and fails in CI. That has already
happened: the Pages tab got a rich-text editor, every local check was green,
and `test:admin-write` broke on a locator the editor had made ambiguous.

Look up what you edited before calling it done:

| If you touched | Run |
| --- | --- |
| `src/components/admin/**`, `src/app/admin/**`, `src/app/api/admin/**` | `test:admin-write` |
| `SubmissionCard`, `fmt()`, `FieldType`, the `Minyan` type — anything changing what the moderation queue renders | `npx vitest run src/components/admin/SubmissionCard.test.tsx` (see below) |
| The moderation queue, category editor, form editor, Pages tab specifically | `test:admin-write` |
| `src/components/wizard/**`, `src/components/intake/**`, form submission or its API | `test:form-roundtrip` |
| `src/lib/cacheTags.ts`, anything `use cache` or `revalidateTag`, a store's cached read | `test:cache-roundtrip` |
| `src/lib/submissionStore.ts` (the only store with an `*.integration.test.ts` today) | `test:integration` |
| `src/app/about/**`, `src/app/privacy/**`, `src/lib/pagesStore.ts`, `src/lib/richText.ts` | `test:admin-write` **and** `test:cache-roundtrip` (they split the `page` singletons between them — admin-write owns `privacy`, cache-roundtrip owns `about`) |
| Routing, data loading, caching, metadata, page shells | `test:e2e` (see below) |

Running one locally needs `TEST_SUPABASE_*` set, and `SHARED_DEV_TEST_PROJECT=1`
if your `.env.local` points dev at that same project. All four refuse to run
otherwise, rather than risk writing to the real database — the guard is in each
`playwright.*.config.ts` for the three Playwright suites, and in
`src/test/integrationEnv.ts` for `test:integration`.

### A wait can never outlast the test budget above it (closed)

This section used to say `cache-roundtrip`'s `/about` test failed "roughly one
run in thirty" for reasons intrinsic to stale-while-revalidate, and told you to
re-run before believing a failure. **That was wrong, and following it meant
re-running a real, deterministic bug until it went away.**

The measurements it cited still stand — invalidation converges in 1.2–1.6s
cold, STALE → HIT on every observed run — which is precisely why the diagnosis
should have been suspect: a thing that always finishes in under two seconds
does not intermittently need more than sixty. The poll asks for 60s. The
config set no `timeout` at all, so Playwright's 30s default applied, and the
poll could never reach the budget the comment beside it spends a paragraph
justifying. CI failed with `Test timeout of 30000ms exceeded`, exactly on the
ceiling. The "one in thirty" was a 30s cap under a 60s allowance.

Generalising the check found the same shape twice more:
`e2e/helpers.ts` fetched content on the 30s request default inside a 30s test,
and `e2e-admin-write/community-editor.spec.ts` has three
`toPass({ timeout: 30_000 })` revalidation polls under the same default. The
last two pass today only because their conditions resolve quickly; the retry
headroom written into them was fictional.

Every Playwright config now sets a test `timeout` above the largest wait
beneath it (e2e 60s, cache 90s, admin-write 60s), with `expect` left at 5s so
a genuine regression still fails in five seconds rather than a minute.
`src/test/e2eTimeouts.test.ts` derives this for every `playwright*.config.ts`
by scanning its `testDir`, so a poll that asks for more than its config allows
fails the unit suite instead of surfacing as a flake months later.

The general rule, since this cost three separate investigations: **when a test
"flakes" only in CI and the failure lands exactly on a round number, suspect a
budget, not the system under test.**

**A test that uses an existing row must put that row into a known state first, and restore it after.** Two of the write suites create their own fixture (a category, a form) and delete it again, so nothing an admin does can reach them. The suites that edit a singleton — the `page` rows, `site_settings` — have no such luxury and must borrow the real record, which makes them the ones that break. `e2e-admin-write/pages-editor.spec.ts` broke three times this way: on a page being retitled, on its body gaining headings (which changed which HTML element the editor's caret landed in), and on a locator that matched a newly-added toolbar. Read what you need from the row, overwrite it with something known, then restore it in `finally`. Never assume what a real page contains.

## The moderation queue must show what an edit actually proposes

The queue is how an admin sees what the public is suggesting, so a field it
renders *identically* before and after is a change someone approves blind.
That has already happened: minyanim were summarised as
`"5 minyanim: Shacharis, Mincha"`, so editing a time, a day, a note — or the
`season` field added later — produced a byte-identical string and the diff
reported the field as unchanged.

`SubmissionCard.test.tsx` is keyed on `Record<FieldType, …>` and
`Record<keyof Minyan, …>`, so **adding a field type or a minyan property is a
compile error until you classify it there**. That is deliberate, and it is the
guarantee — not a convention anyone has to remember. When it fails:

- a new `FieldType` needs a before/after sample in `SAMPLES`, and usually a
  branch in `SubmissionCard`'s `fmt()`; the test asserts the change renders as
  a change, stays readable, and never comes out as `[object Object]`.
- a new `Minyan` property needs an entry in `MINYAN_FIELD_VISIBILITY` — either
  `shown` (add it to `formatMinyanimSummary` and to `MINYAN_CHANGES`) or
  `deliberately-hidden` with the reason in a comment.

Don't satisfy the compiler by marking something hidden to make the build pass.
Anything a person authored is content a moderator needs to see.

**When you fix a bug or change behavior, add or update a test that would have caught it, in the same change.** Not a separate follow-up, not only when asked — the default. If the behavior genuinely can't be automated (an OS-level gesture, a real trackpad swipe, a visual judgment call), say so explicitly instead of silently skipping coverage.

**And confirm it goes red first.** A test written against code that already works proves only that the code still works — it does not prove the test would have caught anything. Put the old behaviour back (a `sed` on the one line, a scratch copy of the file), watch the new test fail, restore, watch it pass. Say in the commit how many failed against the old code.

This is not a formality. Tests that would have passed against the broken thing have shipped here more than once — see the e2e notes below, where an offline test passed because the page was simply still online, and the server-rendering tests certified the exact bug they were written to prevent. Both looked green the whole time.

Do NOT use `git stash` to swap the old behaviour back in. Pathspec `git stash push` silently stashes nothing when the paths are untracked, and an unconditional `git stash pop` after it then pops whatever unrelated stash was on top — which has already happened here, applying someone's months-old work-in-progress into a clean tree as a merge conflict. Copy the file aside and copy it back.

**Run `npm run test:e2e` before calling any change to routing, data loading, caching, or metadata done.** That is where the expensive mistakes have been, and every test in `e2e/` exists because something actually broke:

- `/` silently stopped being an HTTP redirect and became a JavaScript one, so crawlers and WhatsApp link previews saw a blank 200. Caused by wrapping `redirect()` in a `<Suspense>` boundary for Cache Components.
- The content was reported as server-rendered when only the shell was; every component still fetched after hydration. Only visible by fetching the HTML and looking for a listing name in it.
- The home-screen icon was the Next.js logo for the life of the project.
- A padded icon came out 513×513 for a manifest entry declaring 512×512.

None of those show up in `tsc`, `eslint`, or a passing build. Several looked fine in a browser.

## Writing them

- **Unit tests** (`src/**/*.test.ts`, Vitest, node environment) are for pure functions — time and hours logic, distance, validation, URL shapes. Anything that reads `new Date()` needs `vi.useFakeTimers()`.
- **E2E tests** (`e2e/*.spec.ts`, Playwright) run against a **production build**, deliberately: prerendered HTML, Cache Components and the service worker all behave differently under `next dev`, so testing the dev server would test a different application.
- **Derive expectations from the running app**, don't hardcode content. `e2e/helpers.ts` reads the real categories and listings from the API. An assertion on `"ACME Markets"` fails when an admin edits a listing, and a suite that cries wolf gets ignored.
- **Assert on server HTML** (`request.get()`) when the claim is about server rendering. A `page` assertion passes either way, because the client would fill it in.
- Don't use `waitForLoadState('networkidle')` — the map, zmanim and geolocation keep connections open, so it never settles. Use `ready()` from the helpers.
- On mobile, the "Share your live location?" prompt overlays everything and intercepts clicks. Call `dismissLocationPrompt(page)` after navigating, as a real visitor would.
- **Nothing in `e2e/` may write to the database.** The suite runs against whichever project `NEXT_PUBLIC_SUPABASE_URL` points to — the real one in CI, and potentially the shared dev/test project locally (see README "Using the test project for local dev too") — so a test that submits a listing leaves a row in that project's moderation queue for a human to clear either way. `api.spec.ts` posts to the write endpoints deliberately, but only unauthenticated and only with ids that cannot exist — a pass means each one was refused before it reached the database.
- **Check that a new test fails.** Several here would have passed against a broken app: an offline test passes when the page is simply still online, and a "not cached" assertion passes when the header is absent for an unrelated reason. Break the thing on purpose, watch it go red, put it back.
- **Never assert content against the raw HTML string.** A React Server Components response serializes every listing name into a `<script>`, so `expect(html).toContain(name)` passes on a page that rendered nothing — which is how the server-rendering tests came to certify the exact bug they were written to prevent. Use `serverMarkup()` from the helpers, which strips script contents.
- **The content is client-rendered, so `<main>` is empty for a moment.** `ready()` waits for the header, and the header is part of the shell that was always there. A one-shot `innerText()` read after it caught an empty string roughly two runs in three. Use auto-retrying assertions (`await expect(locator).toContainText(...)`) instead of snapshotting text.
- **The `warmup` project runs first, and everything depends on it.** Every
  public content read is `use cache` with `cacheLife('days')`, so it costs one
  real Supabase round trip against the freshly-started `next start` CI uses and
  microseconds thereafter. Without the warm-up, a dozen parallel tests reach for
  `/api/categories` at the same instant, all wait behind the same in-flight
  miss, and the round trip gets charged to whichever test ran out of its 30s
  budget first — which is exactly how `pins.spec.ts` failed in CI while the test
  beside it, calling the same helper, passed. `e2e/warmup.setup.ts` pays that
  read once, with its own 120s budget. It is not a retry: it re-runs nothing.
- **Run a new e2e test several times before trusting it**, and under the full suite rather than alone — the parallel run is where the timing-dependent ones fall over. Both flakes found here passed in isolation.

## Caching

Cached content reads are wired in three places that have to agree: a `use cache` + `cacheTag` store, the tag in `src/lib/cacheTags.ts`, and `allCommunityTags` (which `revalidatePublicContent` iterates). Miss the third and the admin's save appears to work while the site serves the old content for a day, with nothing failing anywhere.

`cacheTags.test.ts` derives the expected tag list from `TAGS` itself, so adding a store without wiring its invalidation fails the unit suite. `caching.spec.ts` then checks the pages really are served from the cache (`x-nextjs-cache: HIT`), since `use cache` that has quietly stopped applying looks identical to one that works.

`/inbox` **is** prerendered and CDN-cached, correctly — it's a `'use client'` shell that fetches its data in the browser with an `Authorization` header. That stops being safe the moment anyone moves that fetch to the server, and the symptom would be invisible: the page still works, the headers don't change, and one admin's moderation queue gets served to whoever loads the page next. `caching.spec.ts` guards it.

**Server-side invalidation being correct does not mean an open tab ever sees it.** These are two separate problems and the second one was missed for a long time. `[community]/layout.tsx` loads categories, site settings, home sections, forms and hospitals once (`loadCommunityContent`) and hands them to `ContentProvider`; an App Router layout does not re-render on client-side navigation between the screens under it. So all five were pinned to whatever the tab loaded with, for as long as it stayed open — an admin's rename, a newly published form, a hidden category, none of it arrived. Not on the next navigation, not an hour later, only on a full document load.

Measured rather than assumed, because the two halves look identical from the outside and it is easy to blame the wrong one: after an admin save the server converges in **2–4 seconds** (`x-nextjs-cache` goes `STALE` → `HIT`), while the same tab kept showing the old value indefinitely across ~100 client-side navigations. An earlier attempt at this chased React `<Activity>` route preservation instead and was wrong — a revisit does issue a real RSC request either way; the stale data was coming from the layout above it, not from the page.

`RefreshContentOnReturn` (mounted in that layout) fixes it by calling `router.refresh()` on the moments the content could have gone stale unnoticed — `visibilitychange`, `focus` and `online`. That is the set SWR and React Query revalidate on by default, minus polling, which is deliberately omitted: a background request on a loop costs battery and mobile data for content an admin changes a few times a week. `online` matters more here than it looks — this is used on hospital wifi, where losing signal and regaining it is an ordinary part of a session. The first two follow the same reasoning, and the same trigger pair, `useNow.ts` already uses to resync the clock. It matters most in the case this app is actually used in: an installed PWA that gets backgrounded rather than closed, and desktop tabs left open for days. Two things to know if you touch it: reading `Date.now()` during render fails the production build under Cache Components (`next dev` won't tell you), and **Playwright's `bringToFront()` fires neither event in headless Chromium** — instrumenting the page recorded an empty array across a full background/foreground cycle, so a test built on it would pass for the wrong reason forever. The test dispatches the events directly and says so.

`/admin` used to be the same single shared console, but became per-community (`/philly/admin`, `/ues/admin`, …) once a second community needed its own admin — see [[project-multi-community]]. It went through two designs before landing here: first a shared console with an `ADMIN_COMMUNITY_COOKIE` switcher (needed `cookies()` in the layout, which Cache Components treats as a genuine per-viewer runtime read, so the layout carried `export const instant = false` to opt out of prerendering). That's gone now — `src/app/admin/[community]/layout.tsx` resolves the community from the URL segment itself, the same way the public `[community]/layout.tsx` does, with no runtime API involved and no `instant = false` needed. `caching.spec.ts`'s admin-shell check still runs; it just finds nothing cached to check for `/admin` and still means something for `/inbox`.

## The content is not server-rendered (closed)

`[community]/page.tsx` and `[slug]/page.tsx` wrap their screens in `<Suspense>` so `useSearchParams` doesn't block prerendering. The intent was that only the part reading the query string waits for the request; for a while, the whole content subtree sat inside the boundary instead. What shipped was a shell — `/philly`'s `<main>` was `<div class="flex-1"></div>`, the literal fallback, followed by an unresolved `<template id="B:0">`.

Fixed by narrowing the boundary to just the piece that actually calls `useSearchParams()`. `Landing` (home) and `FindResources` (category directories) no longer call it directly — each has a thin `'use client'` wrapper (`LandingConnected`, `FindResourcesConnected`) that does, supplying the query-string-derived values as plain props. The `<Suspense>` around each wrapper uses the *same component with no query-string props* as its fallback, so the static/prerendered render and the "no query string yet" render are provably the same JSX call, not two hand-maintained copies that can drift. Everything else in the tree (the category grid, listing rows, home cards) no longer touches a Dynamic API at all and prerenders for real.

The data was already loaded on the server and arriving with the document even before this fix, so "a category page makes no API calls of its own" was passing the whole time — that part of the work always stood. Titles, metadata and Open Graph tags render server-side too, so link previews were fine even during the bug. The fix's actual payoff is no-JS clients, first contentful paint, and lower-tier crawlers, which were the cost of the boundary being too wide.

The two tests that used to assert this were marked `test.fail()`, per the same pattern as the "Coverage that used to be missing" section below — the suite stayed green, the bug stayed visible, and the fix is what turned them into an *unexpected pass*, Playwright's own signal that a `test.fail()` needs its marker removed. Both are plain `test()` now.

This was the same mechanism as the `/` redirect bug: a Suspense boundary added for Cache Components silently changed what gets delivered, and the test meant to catch it didn't — until `serverMarkup()` (stripping the RSC payload from raw HTML) made the check actually mean what it claimed to.

## Coverage that used to be missing (closed — see the suites above)

These were all real gaps at one point and are named in old commit history / memory. **All three are now closed** — don't re-report any of them without first checking `ls e2e-*` and the `test:*` scripts in `package.json`, since this exact section went stale before and misled a later session:

- **The admin console's actual behaviour** — closed by `e2e-admin-write/` (`npm run test:admin-write`): signs in as a real disposable admin and drives approve/reject, category create-and-delete, form create-and-delete.
- **A real invalidation round-trip** — closed by `e2e-cache/` (`npm run test:cache-roundtrip`): a real production build against the test project, proving an admin's save actually reaches the cached page.
- **Form submission end-to-end** — closed by `e2e-form/` (`npm run test:form-roundtrip`): fills in and submits a real intake wizard against the test project.

**If you close a gap like this, update this section in the same commit** — this file is read as authoritative instructions, so a stale "still missing" claim here is actively worse than no claim at all.

# Sentry

```bash
npm run sentry:check   # read-only — lists unresolved production errors
```

**Run `npm run sentry:check` before calling a change done, same as the test suites above.** Investigate and fix what turns up alongside whatever you're already touching, rather than leaving it for later — that's how this turns into tech debt. If a listed error is ambiguous (needs a product decision, or you can't reproduce it), say so explicitly and describe it instead of guessing at a fix.

Needs `SENTRY_API_TOKEN` in `.env.local` — a separate, read-only personal auth token (org:read, project:read, event:read; see `.env.example`), distinct from `SENTRY_AUTH_TOKEN` which is build-only and can't read issues. Without it the script just skips itself, so it's safe to run unconditionally.

Sentry only reports from the real Vercel production deployment (`VERCEL_ENV === 'production'`) — `npm run dev`, a local `npm run build && npm run start`, and every suite above run against the exact same DSN in `.env.local` but never report anything, so an unresolved issue here is a real visitor, not local noise. If that ever stops being true — a "ReferenceError: X is not defined" for an `X` that plainly exists in current source, or an event tagged `environment: development` or a `localhost` URL — the gate in `src/instrumentation.ts`/`src/instrumentation-client.ts` regressed; fix that before chasing the phantom bug.
