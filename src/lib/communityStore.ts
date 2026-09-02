import { cacheLife, cacheTag } from 'next/cache'
import { CONFIG_COMMUNITY_SLUG } from './configCommunity'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { community as configCommunity } from '@/community.config'
import { assertUsableSlug } from './routes'
import { isValidPinColor } from './categoryColor'

// ─────────────────────────────────────────────────────────────────────────────
// Communities — the tenant this site is currently showing.
//
// One database, one row per community, `community_id` on every content table
// (see supabase/migrations/20240101000027_communities.sql for why that shape
// rather than a database each). Everything that reads content scopes to one
// community; nothing merges across them.
//
// src/community.config.ts stays the bootstrap: a fresh install with no
// `community` rows yet still renders, using the config as a single implicit
// community. Once rows exist they win. That keeps `npm run setup` working on a
// blank database and means this module never returns an empty list.
// ─────────────────────────────────────────────────────────────────────────────

export type Community = {
  slug: string
  name: string
  shortName: string
  tagline: string
  mission: string
  manifestDescription: string
  region: string
  timezone: string
  mapCenter: { lat: number; lng: number }
  themeColor: string
  backgroundColor: string
  /** Optional-module + UI capability overrides; same shapes as community.config.ts.
   *  Empty objects mean "inherit the config defaults". */
  features: Record<string, unknown>
  ui: Record<string, unknown>
  sortOrder: number
  isDefault: boolean
  /** Whether this community appears on the public switcher (GET
   *  /api/communities) and in sitemap.ts. Direct URLs to its own pages and
   *  admin console work regardless — see the migration's own comment for
   *  why. A superadmin toggles this from CommunityManager once a community
   *  is ready to go live. */
  visible: boolean
}

type Row = {
  slug: string
  name: string
  short_name: string
  tagline: string
  mission: string
  manifest_description: string
  region: string
  timezone: string
  map_center: { lat: number; lng: number } | null
  theme_color: string
  background_color: string
  features: Record<string, unknown> | null
  ui: Record<string, unknown> | null
  sort_order: number
  is_default: boolean
  visible: boolean
}

function toCommunity(row: Row): Community {
  return {
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    tagline: row.tagline,
    mission: row.mission,
    manifestDescription: row.manifest_description,
    region: row.region,
    timezone: row.timezone,
    mapCenter: row.map_center ?? configCommunity.mapCenter,
    themeColor: row.theme_color,
    backgroundColor: row.background_color,
    features: row.features ?? {},
    ui: row.ui ?? {},
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    visible: row.visible,
  }
}

// Re-exported so existing importers keep working; defined in its own module
// so proxy.ts can use it without pulling in the Supabase client.
export { CONFIG_COMMUNITY_SLUG }

function communityFromConfig(): Community {
  return {
    slug: CONFIG_COMMUNITY_SLUG,
    name: configCommunity.name,
    shortName: configCommunity.shortName,
    tagline: configCommunity.tagline,
    mission: configCommunity.mission,
    manifestDescription: configCommunity.manifestDescription,
    region: configCommunity.region,
    timezone: configCommunity.timezone,
    mapCenter: configCommunity.mapCenter,
    themeColor: configCommunity.themeColor,
    backgroundColor: configCommunity.backgroundColor,
    features: {},
    ui: {},
    sortOrder: 0,
    isDefault: true,
    visible: true,
  }
}

/** Every community, in display order. Never empty — falls back to the config
 *  community when the table is missing or bare (fresh install, or the
 *  migration not yet run).
 *
 *  Cached: this is read on every request (the layout resolves the community
 *  from the path with it) and changes only when someone adds a community by
 *  hand. `communities` is the tag to invalidate if that ever moves into the
 *  admin. */
export async function listCommunities(): Promise<Community[]> {
  'use cache'
  cacheTag(TAGS.communities)
  cacheLife('days')

  try {
    const { data, error } = await getAdminClient()
      .from('community')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error || !data?.length) return [communityFromConfig()]
    return (data as Row[]).map(toCommunity)
  } catch {
    return [communityFromConfig()]
  }
}

/** The community served when the visitor hasn't picked one — the row flagged
 *  `is_default`, else the first by sort order. */
export async function getDefaultCommunity(): Promise<Community> {
  const all = await listCommunities()
  return all.find((c) => c.isDefault) ?? all[0]
}

/** Resolves a requested slug to a real community, falling back to the default
 *  rather than erroring: a stale slug in someone's localStorage (a community
 *  that was renamed or removed) should quietly land them somewhere real. */
export async function resolveCommunity(slug: string | null | undefined): Promise<Community> {
  const all = await listCommunities()
  if (slug) {
    const hit = all.find((c) => c.slug === slug)
    if (hit) return hit
  }
  return all.find((c) => c.isDefault) ?? all[0]
}

/** The admin email configured for one community, or null if it hasn't been
 *  set yet. Server-only, and deliberately NOT part of the `Community` type /
 *  `listCommunities()`'s output — that object is serialized straight to any
 *  visitor via the public GET /api/communities (the header switcher's data
 *  source), so an admin's email has no business riding along on it. Used
 *  only by adminAuth.ts's per-community authorization check. Not cached
 *  ('use cache'/cacheTag) like listCommunities() — this is read at admin
 *  sign-in/authorization time, where a stale value could wrongly admit or
 *  reject someone right after it was changed, and it's a single indexed-row
 *  point query, not a page-render-path cost worth caching.
 *
 *  A list, not a single address — see the admin_emails migration's own
 *  comment on why a community moved from one shared login to a real
 *  per-person allowlist. Empty means "not configured yet", same meaning
 *  the old null singular value had. */
export async function getCommunityAdminEmails(slug: string): Promise<string[]> {
  const { data } = await getAdminClient().from('community').select('admin_emails').eq('slug', slug).maybeSingle()
  return (data as { admin_emails: string[] | null } | null)?.admin_emails ?? []
}

/** Who gets emailed about a new submission for this community — its own
 *  admin_emails, unless notify_on_submission is explicitly off (returns
 *  null then — see sendSubmissionNotification/sendNotification in
 *  email.ts, which skip sending entirely rather than falling back to
 *  anything). An empty admin_emails with notifications still on returns
 *  `[]`, which those callers read as "fall back to NOTIFICATION_TO".
 *
 *  Filtered against notify_muted_emails — any individual admin can mute
 *  just their own inbox (see setAdminNotifyPreference) without touching the
 *  community-wide switch or anyone else's address. Every admin muted still
 *  counts as "notifications on" for the `[]`-means-fall-back-to-
 *  NOTIFICATION_TO distinction above — this only ever narrows an already-on
 *  list, same as an empty admin_emails always has. */
export async function getCommunityNotifyRecipients(slug: string): Promise<string[] | null> {
  const { data } = await getAdminClient()
    .from('community')
    .select('admin_emails, notify_on_submission, notify_muted_emails')
    .eq('slug', slug)
    .maybeSingle()
  const row = data as {
    admin_emails: string[] | null
    notify_on_submission: boolean | null
    notify_muted_emails: string[] | null
  } | null
  if (row?.notify_on_submission === false) return null
  const muted = new Set((row?.notify_muted_emails ?? []).map((e) => e.trim().toLowerCase()))
  return (row?.admin_emails ?? []).filter((e) => !muted.has(e.trim().toLowerCase()))
}

/** Whether ONE admin currently wants submission-notification emails for
 *  this community — the Team tab's own "Email me about new submissions"
 *  checkbox reads this, scoped to the signed-in admin's own verified email
 *  (never another admin's — see setAdminNotifyPreference). True unless
 *  that address is on notify_muted_emails; not affected by the
 *  community-wide notify_on_submission switch, which is a separate,
 *  coarser control (see getCommunityNotifyRecipients). */
export async function getAdminNotifyPreference(slug: string, email: string): Promise<boolean> {
  const { data } = await getAdminClient()
    .from('community')
    .select('notify_muted_emails')
    .eq('slug', slug)
    .maybeSingle()
  const muted = (data as { notify_muted_emails: string[] | null } | null)?.notify_muted_emails ?? []
  const target = email.trim().toLowerCase()
  return !muted.some((e) => e.trim().toLowerCase() === target)
}

/** Sets ONE admin's own submission-notification preference — the write
 *  behind PATCH /api/admin/team, which always passes the CALLER's own
 *  verified email (never a client-supplied one), so this can only ever mute
 *  or unmute the signed-in admin's own address, never anyone else's.
 *  Case-insensitively deduped against notify_muted_emails the same way
 *  addCommunityAdminEmail dedupes admin_emails. */
export async function setAdminNotifyPreference(slug: string, email: string, notify: boolean): Promise<void> {
  const target = email.trim().toLowerCase()
  const { data } = await getAdminClient()
    .from('community')
    .select('notify_muted_emails')
    .eq('slug', slug)
    .maybeSingle()
  const current = (data as { notify_muted_emails: string[] | null } | null)?.notify_muted_emails ?? []
  const withoutTarget = current.filter((e) => e.trim().toLowerCase() !== target)
  const next = notify ? withoutTarget : [...withoutTarget, email.trim()]

  const { error } = await getAdminClient().from('community').update({ notify_muted_emails: next }).eq('slug', slug)
  if (error) throw new Error(`Failed to update notification preference: ${error.message}`)
}

/** Who to email when ONE admin approves or rejects a submission — every
 *  address on notify_review_emails EXCEPT the acting admin's own (nobody
 *  needs to be told about their own decision). Opt-IN, unlike
 *  notify_muted_emails' opt-out shape — see the notify_review_emails
 *  migration's own comment on why the two defaults differ. */
export async function getReviewActionRecipients(slug: string, actorEmail: string): Promise<string[]> {
  const { data } = await getAdminClient()
    .from('community')
    .select('notify_review_emails')
    .eq('slug', slug)
    .maybeSingle()
  const list = (data as { notify_review_emails: string[] | null } | null)?.notify_review_emails ?? []
  const actor = actorEmail.trim().toLowerCase()
  return list.filter((e) => e.trim().toLowerCase() !== actor)
}

/** Whether ONE admin currently wants to be emailed about other admins'
 *  approve/reject decisions — the Team tab's own second checkbox reads
 *  this, scoped to the signed-in admin's own verified email (never
 *  another admin's — see setAdminReviewNotifyPreference). True only when
 *  that address is on notify_review_emails; opt-in, so false for anyone
 *  who has never turned it on. */
export async function getAdminReviewNotifyPreference(slug: string, email: string): Promise<boolean> {
  const { data } = await getAdminClient()
    .from('community')
    .select('notify_review_emails')
    .eq('slug', slug)
    .maybeSingle()
  const list = (data as { notify_review_emails: string[] | null } | null)?.notify_review_emails ?? []
  const target = email.trim().toLowerCase()
  return list.some((e) => e.trim().toLowerCase() === target)
}

/** Sets ONE admin's own review-action-notification preference — same
 *  self-only shape as setAdminNotifyPreference: the write behind PATCH
 *  /api/admin/team always passes the CALLER's own verified email, never a
 *  client-supplied one. */
export async function setAdminReviewNotifyPreference(slug: string, email: string, notify: boolean): Promise<void> {
  const target = email.trim().toLowerCase()
  const { data } = await getAdminClient()
    .from('community')
    .select('notify_review_emails')
    .eq('slug', slug)
    .maybeSingle()
  const current = (data as { notify_review_emails: string[] | null } | null)?.notify_review_emails ?? []
  const withoutTarget = current.filter((e) => e.trim().toLowerCase() !== target)
  const next = notify ? [...withoutTarget, email.trim()] : withoutTarget

  const { error } = await getAdminClient().from('community').update({ notify_review_emails: next }).eq('slug', slug)
  if (error) throw new Error(`Failed to update notification preference: ${error.message}`)
}

/** Every community's configured admin_emails, keyed by slug — same
 *  server-only, uncached reasoning as getCommunityAdminEmails above, just
 *  for all communities at once. Used by the superadmin communities list
 *  (GET /api/admin/communities) so /admin can show which logins govern
 *  each community, without ever putting emails on the public
 *  /api/communities payload that listCommunities()/Community feeds. */
export async function listCommunityAdminEmails(): Promise<Record<string, string[]>> {
  const { data } = await getAdminClient().from('community').select('slug, admin_emails')
  const out: Record<string, string[]> = {}
  for (const row of (data ?? []) as { slug: string; admin_emails: string[] | null }[]) {
    out[row.slug] = row.admin_emails ?? []
  }
  return out
}

/** Every community's notify_on_submission flag, keyed by slug — same
 *  reasoning as listCommunityAdminEmails, for CommunityManager's own
 *  toggle. */
export async function listCommunityNotifyOnSubmission(): Promise<Record<string, boolean>> {
  const { data } = await getAdminClient().from('community').select('slug, notify_on_submission')
  const out: Record<string, boolean> = {}
  for (const row of (data ?? []) as { slug: string; notify_on_submission: boolean | null }[]) {
    out[row.slug] = row.notify_on_submission ?? true
  }
  return out
}

/** One community's notify_on_submission flag — what PATCH
 *  /api/admin/communities/:slug re-reads after a save so its response
 *  always carries the current value, without pulling every community's
 *  flag just to read one. */
export async function getCommunityNotifyOnSubmission(slug: string): Promise<boolean> {
  const { data } = await getAdminClient()
    .from('community')
    .select('notify_on_submission')
    .eq('slug', slug)
    .maybeSingle()
  return (data as { notify_on_submission: boolean | null } | null)?.notify_on_submission ?? true
}

/** Updates a community's admin login allowlist and/or its
 *  notify-on-submission toggle — superadmin action, same gate as
 *  create/delete/visibility (see PATCH /api/admin/communities/:slug).
 *  Either can be omitted to leave it unchanged. */
export async function setCommunityEmailLists(
  slug: string,
  updates: { adminEmails?: string[]; notifyOnSubmission?: boolean },
): Promise<Community> {
  const update: { admin_emails?: string[]; notify_on_submission?: boolean } = {}
  if (updates.adminEmails) update.admin_emails = updates.adminEmails
  if (updates.notifyOnSubmission !== undefined) update.notify_on_submission = updates.notifyOnSubmission

  const { data, error } = await getAdminClient().from('community').update(update).eq('slug', slug).select('*').single()
  if (error) throw new Error(`Failed to update "${slug}"'s email lists: ${error.message}`)
  return toCommunity(data as Row)
}

/** Adds one email to a community's admin allowlist — the one write a
 *  community's OWN admin console can make to it (see
 *  POST /api/admin/team), as opposed to the full replace
 *  setCommunityEmailLists offers the superadmin console. Deliberately
 *  add-only: there is no matching "remove" here, so a regular admin can
 *  grow their own team's access but never shrink anyone else's — only
 *  the superadmin console's edit panel can remove an address. Case-
 *  insensitively deduped against what's already there; a no-op (not an
 *  error) if the email is already on the list. */
export async function addCommunityAdminEmail(slug: string, email: string): Promise<string[]> {
  const trimmed = email.trim()
  if (!trimmed) throw new Error('Email is required.')

  const current = await getCommunityAdminEmails(slug)
  const alreadyPresent = current.some((e) => e.trim().toLowerCase() === trimmed.toLowerCase())
  const next = alreadyPresent ? current : [...current, trimmed]

  if (!alreadyPresent) {
    const { error } = await getAdminClient().from('community').update({ admin_emails: next }).eq('slug', slug)
    if (error) throw new Error(`Failed to add "${trimmed}": ${error.message}`)
  }
  return next
}

/** Every community's visibility + preview token, keyed by slug — the shape
 *  src/proxy.ts needs to decide whether a hidden community's request should
 *  be let through. Deliberately its own function rather than reusing
 *  listCommunities()/Community: the token must never ride on the public
 *  /api/communities payload (same reasoning as admin_email), and proxy.ts
 *  runs outside the request-cache lifecycle 'use cache' assumes, so this
 *  stays a plain uncached read like getCommunityAdminEmail. */
export async function listCommunityVisibility(): Promise<
  Record<string, { visible: boolean; previewToken: string }>
> {
  const { data } = await getAdminClient().from('community').select('slug, visible, preview_token')
  const out: Record<string, { visible: boolean; previewToken: string }> = {}
  for (const row of (data ?? []) as { slug: string; visible: boolean; preview_token: string }[]) {
    out[row.slug] = { visible: row.visible, previewToken: row.preview_token }
  }
  return out
}

/** Every community's preview token, keyed by slug — what CommunityManager
 *  needs to show a superadmin the shareable link for a hidden community.
 *  Same server-only/uncached reasoning as listCommunityAdminEmails. */
export async function listCommunityPreviewTokens(): Promise<Record<string, string>> {
  const { data } = await getAdminClient().from('community').select('slug, preview_token')
  const out: Record<string, string> = {}
  for (const row of (data ?? []) as { slug: string; preview_token: string }[]) {
    out[row.slug] = row.preview_token
  }
  return out
}

/** One community's preview token — what PATCH /api/admin/communities/:slug
 *  re-reads after a save that didn't itself touch visibility, so the
 *  client's response always carries the current token regardless of which
 *  fields the request actually changed. */
export async function getCommunityPreviewToken(slug: string): Promise<string | null> {
  const { data } = await getAdminClient().from('community').select('preview_token').eq('slug', slug).maybeSingle()
  return (data as { preview_token: string | null } | null)?.preview_token ?? null
}

/** Reads the requested community slug off an incoming request. Query param
 *  only for now — the URL/subdomain shape is still undecided, and keeping the
 *  read in one place means changing it later touches this function alone. */
export function communitySlugFromRequest(request: Request): string | null {
  return new URL(request.url).searchParams.get('community')
}

/** True if a valid IANA zone — `new Intl.DateTimeFormat` throws on anything
 *  else. Same check community.config.ts's own bootstrap validator uses. */
function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/** Creates a new community — the "New Community" admin flow's write path.
 *
 *  Validates the slug the same way a category/form slug is validated
 *  (assertUsableSlug — shape + the reserved-word list, since a community
 *  slug is a first-path-segment exactly like `admin`/`inbox`/`api`), plus a
 *  live uniqueness check against existing communities, since assertUsableSlug
 *  only knows about the fixed reserved words, not what's already taken.
 *
 *  `sortOrder` is one past whatever the highest existing value is, so a new
 *  community always lands at the end of the switcher rather than needing an
 *  explicit position. `isDefault` is never settable here — the community
 *  served for a bare "/" stays a deliberate, single admin action elsewhere,
 *  not a side effect of creating a new one. */
export async function createCommunity(input: {
  slug: string
  name: string
  tagline: string
  mission: string
  region: string
  timezone: string
  mapCenter: { lat: number; lng: number }
  themeColor: string
  backgroundColor: string
  adminEmails?: string[]
}): Promise<Community> {
  const slug = input.slug.trim().toLowerCase()
  assertUsableSlug(slug)

  const existing = await listCommunities()
  if (existing.some((c) => c.slug === slug)) {
    throw new Error(`"${slug}" is already in use by another community.`)
  }

  if (!input.name.trim()) throw new Error('Community name is required.')
  if (!isValidPinColor(input.themeColor)) throw new Error('Brand color must be a hex value like #1d4ed8.')
  if (!isValidPinColor(input.backgroundColor)) throw new Error('Background color must be a hex value like #f8fafc.')
  if (!isValidTimezone(input.timezone)) throw new Error(`"${input.timezone}" is not a valid timezone.`)
  const { lat, lng } = input.mapCenter
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Map center latitude must be between -90 and 90.')
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Map center longitude must be between -180 and 180.')

  const sortOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 10

  const { data, error } = await getAdminClient()
    .from('community')
    .insert({
      slug,
      name: input.name.trim(),
      short_name: input.name.trim().slice(0, 20),
      tagline: input.tagline.trim(),
      mission: input.mission.trim(),
      manifest_description: input.mission.trim(),
      region: input.region.trim(),
      timezone: input.timezone,
      map_center: input.mapCenter,
      theme_color: input.themeColor,
      background_color: input.backgroundColor,
      admin_emails: (input.adminEmails ?? []).map((e) => e.trim()).filter(Boolean),
      sort_order: sortOrder,
      is_default: false,
      // Starts hidden from the switcher/sitemap — see the visibility
      // migration's own comment. Its own pages and admin console work
      // immediately by direct URL; a superadmin publishes it explicitly
      // once it's ready (setCommunityVisibility below).
      visible: false,
    })
    .select('*')
    .single()

  if (error) {
    // The uniqueness check above reads listCommunities(), which is cached
    // ('days') — two creations for the same slug landing inside that
    // staleness window both pass it and fall through to the database's own
    // primary-key constraint. Re-map that to the same friendly message
    // instead of surfacing Postgres's raw constraint-violation text, the
    // same way categoryStore.createCategory does for its own singleton
    // collision.
    if (error.code === '23505') {
      throw new Error(`"${slug}" is already in use by another community.`)
    }
    throw new Error(`Failed to create community: ${error.message}`)
  }
  return toCommunity(data as Row)
}

/** Flips whether a community shows up in the public switcher/sitemap
 *  (see the visibility migration's own comment). Superadmin-only action —
 *  gated by the same GET/POST /api/admin/communities check, not any one
 *  community's own admin, since publishing a community isn't scoped to
 *  itself any more than creating one is. */
export async function setCommunityVisibility(
  slug: string,
  visible: boolean,
): Promise<{ community: Community; previewToken: string }> {
  const update: { visible: boolean; preview_token?: string } = { visible }
  // Unpublishing also rotates the preview token, so a link (or the cookie
  // proxy.ts sets from one — see that file's own comment) handed out before
  // stops working the instant the community is hidden again, instead of
  // quietly continuing to work forever off whatever token it already has.
  // Publishing doesn't need this: the token isn't meaningful while visible.
  if (!visible) update.preview_token = crypto.randomUUID()

  const { data, error } = await getAdminClient().from('community').update(update).eq('slug', slug).select('*').single()
  if (error) throw new Error(`Failed to update "${slug}"'s visibility: ${error.message}`)
  const row = data as Row & { preview_token: string }
  return { community: toCommunity(row), previewToken: row.preview_token }
}

/** Every table that carries `community_id` — the tables `deleteCommunity`
 *  sweeps before removing the `community` row itself. `community_id` is a
 *  plain column with no foreign key back to `community` (see this module's
 *  migration file's own note on why: resource.category isn't FK'd either,
 *  for the same slug-collision reason), so nothing cascades on its own —
 *  deleting a community without this would leave every one of its listings,
 *  categories, forms, submissions, etc. orphaned in the database forever,
 *  invisible but never cleaned up. Kept in one place so a new
 *  community-scoped table added later doesn't get silently left behind by a
 *  delete. Rows within each table that reference `resource.id` (votes, the
 *  tag junction) are left to their own existing FK cascade — see
 *  resourceStore.ts's hardDeleteArchivedResource. */
const COMMUNITY_SCOPED_TABLES = [
  'resource',
  'category',
  'form',
  'home_section',
  'site_settings',
  'submission',
  'form_response',
  'hospital',
  'tag',
] as const

/** Permanently deletes a community and every row that belongs to it —
 *  every listing, category, form, submission, site setting, tag, hospital,
 *  and form response. Irreversible, and there is no confirmation step
 *  in here — that belongs to the caller (see
 *  /api/admin/communities/[slug]/route.ts, which requires the admin to
 *  retype the slug, and CommunityManager.tsx, which shows the warning).
 *
 *  Refuses on the default community — there must always be exactly one
 *  (community_single_default_idx), and there's no "make a different one
 *  default" flow yet to reassign it to — and when this is the only
 *  community left, since listCommunities() is documented as never empty. */
export async function deleteCommunity(slug: string): Promise<void> {
  const all = await listCommunities()
  const target = all.find((c) => c.slug === slug)
  if (!target) throw new Error(`"${slug}" is not a real community.`)
  if (target.isDefault) throw new Error('The default community cannot be deleted.')
  if (all.length <= 1) throw new Error('Cannot delete the only remaining community.')

  const supabase = getAdminClient()
  for (const table of COMMUNITY_SCOPED_TABLES) {
    const { error } = await supabase.from(table).delete().eq('community_id', slug)
    if (error) throw new Error(`Failed to delete ${table} rows: ${error.message}`)
  }

  const { error } = await supabase.from('community').delete().eq('slug', slug)
  if (error) throw new Error(`Failed to delete community: ${error.message}`)
}
