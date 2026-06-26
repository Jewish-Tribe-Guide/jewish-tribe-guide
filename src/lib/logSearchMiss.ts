// Fire-and-forget: tells the server that a search returned nothing, so we can
// see what people look for but can't find. Never throws and never blocks — a
// logging failure must have zero effect on the user's search experience.
export function logSearchMiss(query: string, source = ''): void {
  try {
    fetch('/api/search-miss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, source }),
      // Still delivers if the visitor navigates away right after.
      keepalive: true,
    }).catch(() => {})
  } catch {
    // ignore — logging is best-effort
  }
}
