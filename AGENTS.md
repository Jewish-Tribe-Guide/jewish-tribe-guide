<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Only when a task actually touches Next.js framework mechanics — routing/`app` directory conventions, data fetching, server actions, middleware, `next.config.ts`, or other file conventions — read the matching guide in `node_modules/next/dist/docs/` first and heed its deprecation notices. Ordinary component/logic edits that don't call a Next.js API directly don't need this.
<!-- END:nextjs-agent-rules -->

# Tests

```bash
npm test          # unit — pure logic, fast, run constantly
npm run test:e2e  # end-to-end — builds and starts the app, ~1 min
npm run test:all  # both
```

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
- **Nothing in `e2e/` may write to the database.** The suite runs against the real Supabase project, so a test that submits a listing leaves a row in the moderation queue for a human to clear. `api.spec.ts` posts to the write endpoints deliberately, but only unauthenticated and only with ids that cannot exist — a pass means each one was refused before it reached the database.
- **Check that a new test fails.** Several here would have passed against a broken app: an offline test passes when the page is simply still online, and a "not cached" assertion passes when the header is absent for an unrelated reason. Break the thing on purpose, watch it go red, put it back.

## Caching

Cached content reads are wired in three places that have to agree: a `use cache` + `cacheTag` store, the tag in `src/lib/cacheTags.ts`, and `allCommunityTags` (which `revalidatePublicContent` iterates). Miss the third and the admin's save appears to work while the site serves the old content for a day, with nothing failing anywhere.

`cacheTags.test.ts` derives the expected tag list from `TAGS` itself, so adding a store without wiring its invalidation fails the unit suite. `caching.spec.ts` then checks the pages really are served from the cache (`x-nextjs-cache: HIT`), since `use cache` that has quietly stopped applying looks identical to one that works.

Note that `/admin` and `/inbox` **are** prerendered and CDN-cached, correctly — both are `'use client'` shells that fetch their data in the browser with an `Authorization` header. That stops being safe the moment anyone moves one of those fetches to the server, and the symptom would be invisible: the page still works, the headers don't change, and one admin's moderation queue gets served to whoever loads the page next. `caching.spec.ts` guards it.

## What still has no coverage

Worth knowing before trusting a green run:

- **The admin console's actual behaviour** — approving a submission, editing a category, the device preview. Every admin route is covered for *refusing an anonymous caller* (`api.spec.ts`), and the cache invalidation those routes trigger is unit-tested, but nothing signs in and drives the UI. `/api/admin/dev-login` can't help: it refuses when `NODE_ENV === 'production'`, which is exactly what the e2e suite runs.
- **A real invalidation round-trip** — that an admin's save makes the new content appear. The wiring is tested from both ends; the two have never been observed meeting.
- **Form submission end-to-end.** The branching DSL that decides which questions get asked is unit-tested (`forms.test.ts`), but nothing fills in a wizard and posts it, because a passing test would leave a real request in someone's inbox.
