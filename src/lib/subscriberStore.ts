import { getAdminClient } from './supabase/admin'

export type Subscriber = {
  id: string
  email: string
  categories: string[] | null
  notifyAdd: boolean
  notifyClosure: boolean
  unsubscribeToken: string
}

type Row = {
  id: string
  email: string
  categories: string[] | null
  notify_add: boolean
  notify_closure: boolean
  unsubscribe_token: string
}

function toSubscriber(row: Row): Subscriber {
  return {
    id: row.id,
    email: row.email,
    categories: row.categories,
    notifyAdd: row.notify_add,
    notifyClosure: row.notify_closure,
    unsubscribeToken: row.unsubscribe_token,
  }
}

// Upsert on (community, email) — resubmitting the form (e.g. to change which
// categories you're subscribed to) updates the existing row rather than
// creating a second one. `categories` null/empty means "all categories".
export async function createSubscriber(
  community: string,
  input: { email: string; categories: string[] | null; notifyAdd: boolean; notifyClosure: boolean },
): Promise<void> {
  const { error } = await getAdminClient()
    .from('subscriber')
    .upsert(
      {
        community_id: community,
        email: input.email.trim().toLowerCase(),
        categories: input.categories && input.categories.length > 0 ? input.categories : null,
        notify_add: input.notifyAdd,
        notify_closure: input.notifyClosure,
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
