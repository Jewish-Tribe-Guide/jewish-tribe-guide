// Shared by vercel-deployments-dry-run.mjs and vercel-deployments-delete.mjs
// — one paginated fetch of every deployment for a project, so the two
// scripts can't quietly drift into disagreeing about what "all of them"
// means (e.g. one forgetting a pagination page the other includes).

/** Every deployment for `project` (name or id), oldest-safe pagination via
 *  Vercel's own `pagination.next` cursor. `teamId` is optional — omit it for
 *  a personal (non-team) account. Throws on a non-ok response rather than
 *  returning a partial list silently, since a delete pass acting on a
 *  truncated "all deployments" would be worse than just failing loudly. */
export async function fetchAllDeployments(token, project, teamId) {
  const deployments = []
  let until

  for (;;) {
    const url = new URL('https://api.vercel.com/v6/deployments')
    url.searchParams.set('projectId', project)
    url.searchParams.set('limit', '100')
    if (teamId) url.searchParams.set('teamId', teamId)
    if (until) url.searchParams.set('until', String(until))

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Vercel API request failed (${res.status}): ${body}`)
    }
    const body = await res.json()
    deployments.push(...body.deployments)

    if (!body.pagination?.next) break
    until = body.pagination.next
  }

  return deployments
}

/** The one place "safe to delete" is decided, shared by both scripts so
 *  the dry-run's preview and the delete pass's actual target can never
 *  disagree. Deliberately conservative: ANY deployment with target
 *  'production' is excluded, not just the current one — a past production
 *  deployment is what "instant rollback" in Vercel's dashboard rolls back
 *  to, and this has no way to know if that safety net still matters to
 *  whoever's running it. */
export function splitByProductionSafety(deployments) {
  const production = deployments.filter((d) => d.target === 'production')
  const preview = deployments.filter((d) => d.target !== 'production')
  return { production, preview }
}
