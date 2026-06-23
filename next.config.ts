import type { NextConfig } from "next";

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
  allowedDevOrigins: ['192.168.1.176', '*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.io'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
