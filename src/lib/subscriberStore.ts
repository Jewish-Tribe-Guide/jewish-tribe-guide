import { getAdminClient } from './supabase/admin'

export type Subscriber = {
  id: string
  communityId: string
  email: string
  categories: string[] | null
  notifyAdd: boolean
  notifyClosure: boolean
  unsubscribeToken: string
}

type Row = {
  id: string
  community_id: string
  email: string
  categories: string[] | null
  notify_add: boolean
  notify_closure: boolean
  unsubscribe_token: string
}

function toSubscriber(row: Row): Subscriber {
  return {
    id: row.id,
    communityId: row.community_id,
    email: row.email,
    categories: row.categories,
    notifyAdd: row.notify_add,
    notifyClosure: row.notify_closure,
    unsubscribeToken: row.unsubscribe_token,
  }
}

// Upsert on (community, email) — MERGES onto an existing subscription rather
// than replacing it, so resubmitting to add a category you weren't
// previously subscribed to doesn't silently drop the ones you already had.
// Categories: null (either side) means "all", which is a superset of any
// specific list, so the merge collapses to null the moment either side is
// already "all"; otherwise it's the union of both specific lists. Notify
// flags: OR'd, not overwritten — resubscribing only ever widens what you get
// notified about; narrowing (or unsubscribing entirely) is what the "Manage
// your subscription" link in every notification is for (see
// updateSubscriberByToken/deleteSubscriberByToken below), not a smaller
// repeat signup through the public form.
export async function createSubscriber(
  community: string,
  input: { email: string; categories: string[] | null; notifyAdd: boolean; notifyClosure: boolean },
): Promise<void> {
  const email = input.email.trim().toLowerCase()
  const newCategories = input.categories && input.categories.length > 0 ? input.categories : null

  const { data: existingRow, error: readError } = await getAdminClient()
    .from('subscriber')
    .select('categories, notify_add, notify_closure')
    .eq('community_id', community)
    .eq('email', email)
    .maybeSingle()
  if (readError) throw new Error(`Failed to save subscriber: ${readError.message}`)
  const existing = existingRow as Pick<Row, 'categories' | 'notify_add' | 'notify_closure'> | null

  const categories =
    existing && (existing.categories === null || newCategories === null)
      ? null
      : existing
        ? Array.from(new Set([...(existing.categories ?? []), ...(newCategories ?? [])]))
        : newCategories

  const { error } = await getAdminClient()
    .from('subscriber')
    .upsert(
      {
        community_id: community,
        email,
        categories,
        notify_add: input.notifyAdd || (existing?.notify_add ?? false),
        notify_closure: input.notifyClosure || (existing?.notify_closure ?? false),
      },
      { onConflict: 'community_id,email' },
    )
  if (error) throw new Error(`Failed to save subscriber: ${error.message}`)
}

export async function deleteSubscriberByToken(token: string): Promise<boolean> {
  const { data, error } = await getAdminClient().from('subscriber').delete().eq('unsubscribe_token', token).select('id')
  if (error) throw new Error(`Failed to unsubscribe: ${error.message}`)
  return (data?.length ?? 0) > 0
}

// The token from a "Manage your subscription" link — same token the
// unsubscribe link carries, so one link in every email covers both. Used to
// load the manage page's current state (which categories/kinds this address
// is actually subscribed to right now).
export async function getSubscriberByToken(token: string): Promise<Subscriber | null> {
  const { data, error } = await getAdminClient().from('subscriber').select('*').eq('unsubscribe_token', token).maybeSingle()
  if (error) throw new Error(`Failed to load subscriber: ${error.message}`)
  return data ? toSubscriber(data as Row) : null
}

// A real REPLACE, unlike createSubscriber's merge — this is the explicit
// "I opened my own manage link and set exactly this" surface, so it should
// do exactly what's submitted, including narrowing (removing a category, or
// turning a notify kind off) — the one thing the public signup form can't
// do (see createSubscriber's own doc on why that only ever widens).
export async function updateSubscriberByToken(
  token: string,
  input: { categories: string[] | null; notifyAdd: boolean; notifyClosure: boolean },
): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('subscriber')
    .update({
      categories: input.categories && input.categories.length > 0 ? input.categories : null,
      notify_add: input.notifyAdd,
      notify_closure: input.notifyClosure,
    })
    .eq('unsubscribe_token', token)
    .select('id')
  if (error) throw new Error(`Failed to update subscription: ${error.message}`)
  return (data?.length ?? 0) > 0
}

// The read the notification hook uses after an admin approves a matching
// submission — every subscriber in this community whose `categories` is
// null/empty (subscribed to everything) or contains this category id, and
// who has the relevant kind turned on.
export async function listSubscribersForCategory(
  community: string,
  categoryId: string,
  kind: 'add' | 'closure',
): Promise<Subscriber[]> {
  const column = kind === 'add' ? 'notify_add' : 'notify_closure'
  const { data, error } = await getAdminClient()
    .from('subscriber')
    .select('*')
    .eq('community_id', community)
    .eq(column, true)
    .or(`categories.is.null,categories.cs.{${categoryId}}`)

  if (error) throw new Error(`Failed to load subscribers: ${error.message}`)
  return (data as Row[]).map(toSubscriber)
}
