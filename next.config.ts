import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { optimizedImagePatterns } from "./src/lib/imageHosts";

// Security headers applied to every response. These are the "safe" set — they
// harden against clickjacking, MIME-sniffing, and referrer leakage without
// restricting which resources the app may load (a full Content-Security-Policy
// that allowlists Google Maps / Supabase / Vercel is the next step, but needs
// live testing to avoid breaking those integrations).
const securityHeaders = [
  // Block the site from being embedded in an <iframe> elsewhere (clickjacking).
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  // Stop browsers from MIME-sniffing responses into a different content type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't leak full URLs (which can carry context) to other origins.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Force HTTPS for two years, including subdomains. Vercel already serves HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Deny powerful features the app doesn't use; keep geolocation for "use my
  // current location" (self only).
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=()' },
];

const nextConfig: NextConfig = {
  // Lets the cache-round-trip e2e suite (scripts/run-cache-e2e-server.mjs)
  // build into its own directory instead of overwriting whatever `.next` the
  // real e2e/dev build left behind — it needs its own real production build
  // (Cache Components only behaves correctly there), just pointed at the
  // disposable test Supabase project instead of the real one.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    // Shared with the components that render these images, so the config and
    // the "can this be optimized?" check can't drift apart — see
    // src/lib/imageHosts.ts for why the list is narrow rather than a wildcard.
    remotePatterns: optimizedImagePatterns(process.env.NEXT_PUBLIC_SUPABASE_URL),
  },
  // Cache Components. Two things this buys:
  //
  //   1. `use cache` + cacheTag on the content reads, so a category directory
  //      isn't a fresh Supabase query for every visitor of every page. The
  //      content is public, identical for everyone, and changes when an admin
  //      edits it — so it's cached until an admin edit invalidates the tag,
  //      rather than on a timer that's either too slow or too eager.
  //
  //   2. Route state preservation. Next keeps recent routes mounted behind
  //      React's <Activity> instead of unmounting them, which is exactly what
  //      the old page.tsx hand-rolled for the map — kept permanently mounted
  //      under `display: none` so pan/zoom and the selected pin survived a tab
  //      switch. That hack is gone; this replaces it properly.
  //
  // The trade-off is that component state now survives navigating away and
  // back, which it didn't before. Anything that relied on unmounting to reset
  // needs to say so explicitly — see the wizard and dropdown reset patterns.
  cacheComponents: true,
  allowedDevOrigins: ['192.168.1.176', '*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.io'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

// Wraps the build to upload source maps to Sentry so stack traces show real
// file/line instead of minified output. Silently skips the upload (build still
// succeeds) until SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN are set — see
// .env.example.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
});
