// The cookie that lets one browser see a hidden community's public pages
// (proxy.ts's gate). Set two ways: by opening the community's preview link
// (?access=<token>), and by its own admin console (/api/admin/whoami), so an
// admin building a hidden guide sees it in Site's previews and "View the
// site" without a link. Kept here so the two can't disagree on its shape.

export function previewCookieName(slug: string): string {
  return `jpc_preview_${slug}`
}

export function previewCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    // "/", not "/<slug>": the public API routes are gated on it too
    // (proxy.ts's gateCommunityApi), and they live under /api. The name
    // already says which community it opens.
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  }
}
