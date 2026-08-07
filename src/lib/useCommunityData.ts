/** Appends the active community to a data URL, preserving any existing query. */
export function withCommunity(path: string, community: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}community=${encodeURIComponent(community)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// What used to live here: a per-community cache of in-flight and completed
// fetches, shared by the six content hooks so they didn't each re-request on
// every mount.
//
// All of it is gone because the thing it optimized is gone. Those hooks don't
// fetch any more — the content is loaded on the server and handed to the client
// tree (see loadCommunityContent / contentContext), so there is no request to
// deduplicate and no response to cache. The one survivor is this URL helper,
// still used by the tag autocomplete, which does genuinely query per keystroke.
// ─────────────────────────────────────────────────────────────────────────────
