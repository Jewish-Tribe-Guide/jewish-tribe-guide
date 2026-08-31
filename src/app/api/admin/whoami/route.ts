import { getAdminUserForCommunity } from '@/lib/adminAuth'

// GET /api/admin/whoami?community=<slug> — the only thing this route does is
// answer "is the Bearer token's email allowed to administer this specific
// community." Used by AdminAuthGate right after a Supabase session appears,
// so a session minted for one community's admin can't silently work on
// another's console just because a token exists — the check has to happen
// again per community, not once at login.
//
// Deliberately returns no information beyond ok/not-ok — never the community's
// configured admin_email itself, which stays server-only (see
// communityStore.ts's getCommunityAdminEmail). A client that already knows
// its own email just needs a yes/no.
export async function GET(request: Request) {
  const community = new URL(request.url).searchParams.get('community')
  if (!community) return Response.json({ ok: false, errors: ['community is required.'] }, { status: 400 })

  const admin = await getAdminUserForCommunity(request, community)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  return Response.json({ ok: true, email: admin.email })
}
