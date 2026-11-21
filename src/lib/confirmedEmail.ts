import type { User } from '@supabase/supabase-js'

/** The signed-in user's email, once they have shown they own it. A token
 *  for an address never confirmed proves nothing about who holds it: with
 *  Supabase's "Confirm email" off (a dashboard setting, not in the repo),
 *  anyone could sign up as an admin's address and get one. The health
 *  sweep, Nov 20. */
export function confirmedEmail(user: Pick<User, 'email' | 'email_confirmed_at'> | null | undefined): string | null {
  if (!user?.email || !user.email_confirmed_at) return null
  return user.email
}
