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

## Known causes, and what fixed them

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
