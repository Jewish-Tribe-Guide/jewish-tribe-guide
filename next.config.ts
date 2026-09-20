import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { optimizedImagePatterns } from "./src/lib/imageHosts";
import { buildCsp } from "./src/lib/csp";

// Security headers applied to every response. These are the "safe" set — they
// harden against clickjacking, MIME-sniffing, and referrer leakage without
// restricting which resources the app may load (a full Content-Security-Policy
// that allowlists Google Maps / Supabase / Vercel is the next step, but needs
// live testing to avoid breaking those integrations).
const securityHeaders = [
  // Block the site from being embedded in an <iframe> elsewhere (clickjacking).
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  // The full policy, in REPORT-ONLY mode: the browser evaluates it and reports
  // what it would block, but blocks nothing, so a wrong allowlist can't break
  // the map or the forms. Violations go to Sentry from production. Once the
  // reports are quiet, enforce it by renaming this header to
  // 'Content-Security-Policy' (and dropping the frame-ancestors-only one above,
  // which the full policy already contains). See src/lib/csp.ts for what it
  // does and deliberately doesn't cover.
  {
    key: 'Content-Security-Policy-Report-Only',
    value: buildCsp({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      reportViolations: process.env.VERCEL_ENV === 'production',
      dev: process.env.NODE_ENV !== 'production',
    }),
  },
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
    // Next's own default is 8 deviceSizes (640-3840) + 8 imageSizes (16-384)
    // — every distinct (photo, width) pair the optimizer is ever asked for
    // counts as its own Image Optimization Transformation, so a wide,
    // mostly-unused ladder is pure waste against a metered quota. Narrowed to
    // what this app actually requests, not a generic guess:
    //
    //   imageSizes — every fixed-px `sizes` prop in the app (CategoryIcon,
    //   the header logo) asks for 32/36/40/44/48px, never the default's
    //   16/128/256/384. [32, 48, 64, 96] covers those at both 1x and 2x
    //   density (36/40/44/48 all round up to 48; their 2x doubles round up
    //   to 64 or 96) with nothing left over.
    //
    //   384 was added after the ladder started at 640 and that turned out to
    //   be too coarse at the small end: a home-screen tile is half a phone's
    //   width (~187px) or a quarter of a desktop grid (~290px), and with 640
    //   as the smallest step every one of them downloaded a 640px image for a
    //   slot a third that wide — measured at 20-58 KB each. 384 covers a phone
    //   at 2x density and a desktop at 1x. It adds one variant per photo
    //   rather than replacing one (phones and 1x desktops move from 640 to
    //   384; the rest still use what they did), so the extra transformations
    //   are bounded by the number of tile photos.
    //
    //   deviceSizes — every viewport-relative `sizes` prop (the hero photo,
    //   category tile cards) sits inside a max-w-6xl (1152px) container;
    //   nothing here is a true edge-to-edge layout except the category
    //   band photo, kept in mind with the 1920 tier. Content-uploaded photos
    //   are themselves capped at 1200px on upload anyway (ImageCropModal's
    //   OUTPUT_MAX_PX), so anything above that produces the same source
    //   image again under a different label, not a sharper one.
    //
    // Same visual result at every size that's actually used — this doesn't
    // trade quality for quota, it just stops generating variants nobody
    // requests. Not a monthly lever like imageHosts.ts's kill switches;
    // this is a permanent fix, safe to leave in place regardless of usage.
    imageSizes: [32, 48, 64, 96],
    deviceSizes: [384, 640, 828, 1080, 1280, 1920],
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
  // /admin and /inbox live outside /[community] (see
  // src/app/admin/[community]/layout.tsx's own comment), but the URL should
  // still read as /{community}/admin and /philly/inbox rather than sitting
  // at the bare root alongside the public site. A rewrite masks that without
  // literally moving the files under [community] — which would force them
  // to inherit [community]/layout.tsx's public SiteChrome (header/nav/
  // footer), wrong for an internal console. beforeFiles so this always wins
  // over [community]/[slug] ever trying to resolve "admin"/"inbox" as a
  // category/form slug.
  //
  // Admin is per-community now (src/app/admin/[community]/...): the
  // internal route order is /admin/{community}/..., reversed from the
  // external /{community}/admin/... — this rewrite is what reconciles the
  // two. /inbox stays hardcoded to 'philly' — same known limitation as
  // before, it's a single hospital-facing queue, not per-community.
  //
  // `:community((?!api\b).*)` — NOT plain `:community` — because 'api' is a
  // syntactically valid community slug shape (looksLikeCommunitySlug would
  // accept it) and /api/admin/submissions etc. are real, unrelated routes
  // that happen to match "/:anything/admin/:path*" too. Without this
  // exclusion the rewrite silently ate every /api/admin/* request and
  // rewrote it to a nonexistent /admin/api/... route — 404 in place of every
  // admin API call, caught by e2e/api.spec.ts's anonymous-caller coverage
  // (which expects 401, not 404) the first time this ran against a full
  // build rather than just typecheck/unit tests.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/:community((?!api\\b).*)/admin/:path*', destination: '/admin/:community/:path*' },
        { source: '/philly/inbox', destination: '/inbox' },
      ],
    };
  },
  // /admin used to redirect to /philly/admin (the shared console, back when
  // there was only one). Now it's a real, standalone page of its own — the
  // superadmin console (src/app/admin/page.tsx) — so no redirect for it.
  // /inbox keeps its redirect: it has no per-community split (one
  // hospital-facing queue) and no standalone page of its own, so the old
  // bare bookmark still needs somewhere real to land.
  async redirects() {
    return [{ source: '/inbox', destination: '/philly/inbox', permanent: true }];
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
