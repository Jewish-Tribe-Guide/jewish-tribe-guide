import { revalidateTag } from 'next/cache'
import { getAdminUser } from '@/lib/adminAuth'
import { TAGS } from '@/lib/cacheTags'
import { revalidatePublicContent } from '@/lib/revalidateContent'

// POST /api/admin/revalidate — throw away the cached public content. Admin only.
//
// Every other admin write revalidates as a side effect of saving. This exists
// for the writes that don't go through the admin at all: the one-off scripts
// that talk to Supabase directly (promote-page-headings, sync-dev-from-prod, a
// hand-run backfill). Those change the data without the app ever hearing about
// it, so the site keeps serving its cached copy for a day — which reads exactly
// like the script having silently failed, and cost real time more than once
// before this route existed.
//
// The alternative was to make the scripts write through the admin API instead
// of Supabase, which is more correct in principle and miserable for a bulk
// migration: batching, partial failure and rate limits all become the script's
// problem. One endpoint to say "the data moved, forget what you cached" keeps
// the scripts simple and honest.
//
// Deliberately blunt — it invalidates all public content rather than taking a
// list of tags. A caller that has just rewritten rows in bulk generally cannot
// say precisely what it touched, and over-invalidating costs a few refetches
// while under-invalidating costs a day of stale content. Same reasoning as
// revalidatePublicContent's own note.
//
// TAGS.pages is invalidated separately because it is global rather than
// per-community, so revalidatePublicContent (which iterates communities) does
// not cover it — the same split the pages admin route already has to make.
export async function POST(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    await revalidatePublicContent()
    revalidateTag(TAGS.pages, 'max')
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/revalidate] failed:', err)
    return Response.json({ ok: false, errors: ['Could not revalidate.'] }, { status: 502 })
  }
}
