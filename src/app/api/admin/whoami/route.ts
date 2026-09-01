import { getAdminUser, getAdminUserForCommunity, isAllowedAdminEmail } from '@/lib/adminAuth'

// GET /api/admin/whoami?community=<slug> — is the Bearer token's email
// allowed to administer this specific community (adminAuth.ts's
// getAdminUserForCommunity). GET /api/admin/whoami with no `community` —
// is it a SUPERADMIN (the global SUPERADMIN_EMAILS list, getAdminUser) instead;
// used by the standalone superadmin console at /admin itself
// (src/app/admin/page.tsx), which has no community in its URL at all.
//
// Used by AdminAuthGate right after a Supabase session appears, so a
// session minted for one community's admin (or a superadmin's) can't
// silently work somewhere it isn't authorized just because a token exists —
// the check has to happen again for wherever the gate actually is, not once
// at login.
//
// Deliberately returns no information beyond ok/not-ok — never the community's
// configured admin_emails itself, which stays server-only (see
// communityStore.ts's getCommunityAdminEmails). A client that already knows
// its own email just needs a yes/no.
export async function GET(request: Request) {
  const community = new URL(request.url).searchParams.get('community')

  const admin = community ? await getAdminUserForCommunity(request, community) : await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  // Included even on the per-community branch — a community admin who
  // ALSO happens to be on the global superadmin list still needs to know
  // that, so the console can show them the Communities tab (see AdminNav's
  // own use of this). Cheap to compute either way: isAllowedAdminEmail is
  // just a comma-separated env var check, no extra request.
  return Response.json({ ok: true, email: admin.email, isSuperAdmin: isAllowedAdminEmail(admin.email) })
}
