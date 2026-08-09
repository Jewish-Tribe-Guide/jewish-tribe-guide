import { defineConfig, devices } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end tests.
//
// These exist because the largest change this codebase has had — giving every
// screen its own URL, and moving the content to the server — had no automated
// coverage at all. It was verified by hand, once, by clicking through it. That
// catches a break the day it's made and never again.
//
// Run against a production build, not `next dev`, deliberately. Three things
// this project depends on only behave correctly in production: the prerendered
// HTML (the whole point of the server-rendering work), Cache Components, and
// the service worker, which refuses to register in development. Testing the
// dev server would test a different application.
// ─────────────────────────────────────────────────────────────────────────────

const PORT = 3210
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // A failing assertion should fail, not hang for the default 30s.
  expect: { timeout: 5_000 },
  fullyParallel: true,
  // Nothing here should be flaky; a retry that passes is hiding something.
  retries: 0,
  reporter: process.env.CI ? 'dot' : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The mobile tab bar and the inline card grid only exist below the `sm`
    // breakpoint, so they can't be covered by the desktop project at all.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    // Its own port, so a dev server left running on 3000 doesn't get tested by
    // accident — which would silently test the wrong build.
    command: `npm run build && npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
