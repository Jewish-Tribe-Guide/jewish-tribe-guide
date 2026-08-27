<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Only when a task actually touches Next.js framework mechanics — routing/`app` directory conventions, data fetching, server actions, middleware, `next.config.ts`, or other file conventions — read the matching guide in `node_modules/next/dist/docs/` first and heed its deprecation notices. Ordinary component/logic edits that don't call a Next.js API directly don't need this.
<!-- END:nextjs-agent-rules -->

# Local admin access

Default to the **local** admin console (`npm run dev`, then `http://localhost:3000/philly/admin?devToken=<DEV_ADMIN_BYPASS_SECRET>`) instead of the deployed one — the secret is in `.env.local` as `DEV_ADMIN_BYPASS_SECRET`. This hits `/api/admin/dev-login`, which signs you in instantly and works only when `NODE_ENV !== 'production'` (so it's a no-op against a real deployment — see that route's own comments). No magic-link email needed. (`/admin` still works too — it redirects to `/philly/admin`, see next.config.ts.)

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

One caveat when you do run them: `cache-roundtrip` polls a rebuilt production
server and its first run after a cold build can exhaust the 20s poll while
being perfectly correct. Re-run before believing a failure there; a real
caching bug fails every time, not once.

**When you fix a bug or change behavior, add or update a test that would have caught it, in the same change.** Not a separate follow-up, not only when asked — the default. If the behavior genuinely can't be automated (an OS-level gesture, a visual judgment call), say so explicitly instead of silently skipping coverage.

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
- **Run a new e2e test several times before trusting it**, and under the full suite rather than alone — the parallel run is where the timing-dependent ones fall over. Both flakes found here passed in isolation.

## Caching

Cached content reads are wired in three places that have to agree: a `use cache` + `cacheTag` store, the tag in `src/lib/cacheTags.ts`, and `allCommunityTags` (which `revalidatePublicContent` iterates). Miss the third and the admin's save appears to work while the site serves the old content for a day, with nothing failing anywhere.

`cacheTags.test.ts` derives the expected tag list from `TAGS` itself, so adding a store without wiring its invalidation fails the unit suite. `caching.spec.ts` then checks the pages really are served from the cache (`x-nextjs-cache: HIT`), since `use cache` that has quietly stopped applying looks identical to one that works.

Note that `/admin` and `/inbox` **are** prerendered and CDN-cached, correctly — both are `'use client'` shells that fetch their data in the browser with an `Authorization` header. That stops being safe the moment anyone moves one of those fetches to the server, and the symptom would be invisible: the page still works, the headers don't change, and one admin's moderation queue gets served to whoever loads the page next. `caching.spec.ts` guards it.

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
