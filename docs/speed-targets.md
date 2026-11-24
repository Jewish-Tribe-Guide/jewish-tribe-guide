# Speed targets

What "fast enough" means here, so a slow screen is a bug with a number on it
rather than a feeling. Agreed Nov 16.

## The targets

| What | Target | Why this number |
| --- | --- | --- |
| Something visible after a tap | ≤ 0.1s | Below this a response reads as instant. |
| The answer itself (a place, a list, a search result) | ≤ 1s on a mid-range phone on slow 4G | Past a second the visitor's attention drifts. |
| Largest Contentful Paint | ≤ 2.5s at p75 | Google's "good" line (Core Web Vitals). |
| Interaction to Next Paint | ≤ 200ms at p75 | Same. |
| Cumulative Layout Shift | ≤ 0.1 at p75 | Same. |
| Admin: a screen's data arriving (`GET /api/admin/…`) | ≤ 1s at p75 | **Proposed Nov 24, waiting on the user's OK.** The same second as a visitor's answer: an admin is a visitor doing a job. |
| Admin: a save answering (`POST`/`PATCH`/`DELETE /api/admin/…`) | ≤ 1s at p75 | **Proposed Nov 24, as above.** |

p75 is measured over real visitors, not on a developer's laptop.

## Where each one is checked

- **In CI, by order and count, never by time.** A timing assertion on a shared
  runner is what makes a suite flaky. So the tests check what the page does,
  not how long it takes:
  - `e2e/budgets.spec.ts`: bytes and requests per page (initial JS, images,
    preloads). Heavier pages are slower everywhere.
  - `e2e/first-tap.spec.ts`: the first tap on a place on a phone. The sheet
    never shows up empty.
- **On real visitors**: Vercel Speed Insights (`@vercel/speed-insights` in
  `src/app/layout.tsx`) reports LCP, INP and CLS from the live site. Read it
  before and after anything that changes what a page loads.
- **Every week, by email (Nov 24)**: Sentry measures the same web vitals
  (its browser pageload and interaction spans) and every admin request's
  duration, sampled at 10%. On Sundays the nightly email's run sends the
  site owners (`SUPERADMIN_EMAILS`) the last 7 days' p75 against each target
  above, and the slowest admin requests (`src/lib/speedReport.ts`). A
  report, not an alert. Vercel's Speed Insights has no read API, only its
  dashboard and CLI, which is why it reads Sentry. Needs `SENTRY_ORG` and
  `SENTRY_API_TOKEN` (the read-only one) on the live deployment; without
  them the email says it couldn't read.

  First reading (Nov 17–24, low sample): LCP 2.3s, INP 150ms, CLS 0.19
  (over), admin screens 532ms, saves under 1s except approving a
  suggestion (990ms). Slowest screens: Watches' jobs 2.2s, hours 1.6s,
  kosher 1.5s.

## Known causes, and what fixed them

- **The Watches tab (Nov 24).** Its combined read waited on the database
  five times in a row: sign-in, then the categories and the rest, then
  each job's own slice of the places (eight reads of one table, each
  after the categories), then the findings (after the places), then the
  places the findings name, read again. Live, each wait was about 0.3s at
  p75, and the read took 2.2s. Now every job filters one read of the
  community's places (`listResourcesForAdmin`, `approvedIn`), started
  beside the categories, and the findings start at once and take their
  places from it. Two waits: sign-in, then everything together. Locally
  each job's own screen went from 0.8–1.0s to about 0.45s, the combined
  read from 1.0–1.1s to 0.75–0.85s; what's left is building its 858KB
  answer. `watchJobPlaces.test.ts` fails if a job's places or findings
  wait on its categories again, or the places are read more than once.

- **The first tap on a place (Nov 16).** On a phone the sheet slid up empty
  and the place arrived about 0.3s later, on the first tap only. Two causes
  together. The place's code loaded on that tap (`next/dynamic`, kept lazy so
  the home stays under its JS budget). React.lazy then pauses the first draw
  even once the code is there, and React keeps a loading state it has shown
  for at least 300ms. Fixed with `src/lib/preloadable.tsx`. A category page
  on a phone loads that code once the page is idle, and draws it with no
  pause after that. Against the old code the check failed 3 of 3, with 17–18
  empty frames each time.

When a new lazy piece sits behind a tap that must answer at once, use
`preloadable` and load it ahead where the tap is likely. Don't load it on the
home screen; the home has its budget.
