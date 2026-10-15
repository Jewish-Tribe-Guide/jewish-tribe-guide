'use client'

const TOKEN_KEY = 'jpc_voter_token'

/** A stable anonymous token per browser (minted on first vote). Lets the
 *  server dedupe one vote per browser without requiring accounts. */
export function getVoterToken(): string {
  let t = localStorage.getItem(TOKEN_KEY)
  if (!t) {
    t = crypto.randomUUID()
    localStorage.setItem(TOKEN_KEY, t)
  }
  return t
}

let cache: Promise<Set<string>> | null = null

/** Every resource this browser has voted on, per the server's own record —
 *  not the local "jpc_voted" cache UpvoteButton keeps, which can drift from
 *  it (cleared/evicted independently of the vote token, or just never
 *  written back after a successful vote). Lets a page correct its own
 *  "voted" display instead of only trusting that local cache.
 *
 *  Memoized at the module level so every UpvoteButton on the page shares one
 *  request instead of firing one each. Doesn't mint a token: a browser that's
 *  never voted has nothing to check server-side, and shouldn't get an
 *  identity assigned just for looking. */
export function getMyVotedIds(): Promise<Set<string>> {
  if (!cache) {
    cache = (async () => {
      let token: string | null
      try {
        token = localStorage.getItem(TOKEN_KEY)
      } catch {
        return new Set<string>()
      }
      if (!token) return new Set<string>()
      try {
        const res = await fetch('/api/votes', { headers: { 'x-vote-token': token } })
        const body = await res.json()
        return new Set<string>(res.ok && body.ok ? (body.resourceIds as string[]) : [])
      } catch {
        return new Set<string>()
      }
    })()
  }
  return cache
}

/** Keeps the memoized list above in step with a vote this tab just made.
 *  Without it the list stays whatever the server said before the vote, for
 *  as long as the tab is open, and UpvoteButton trusts it over the local
 *  record — so on coming back to a listing you'd just upvoted, the button
 *  read as un-voted, and tapping it to take the vote back counted UP first,
 *  then down when the server answered (the user, Oct 15). Chained onto the
 *  same promise, so a request still in flight gets the vote applied on top
 *  of whatever it returns. Nothing to do if the list was never fetched: the
 *  first fetch will come from the server after this vote. */
export function noteMyVote(resourceId: string, voted: boolean) {
  if (!cache) return
  cache = cache.then((ids) => {
    const next = new Set(ids)
    if (voted) next.add(resourceId)
    else next.delete(resourceId)
    return next
  })
}
