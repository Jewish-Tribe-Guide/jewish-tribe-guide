// ── What a search found, said to a screen reader (Nov 20) ──
// The lines under the home box, You's, and a category page's list all
// change as a search is typed, and a screen reader said nothing: someone
// who can't see the list didn't know anything had come up (the health
// sweep). This line is never shown; a screen reader reads it when it
// changes. It stays in the page with nothing in it, since a live region
// that appears together with its text isn't read out everywhere.

export function searchFoundText(query: string, count: number | null, units: readonly [string, string] = ['result', 'results']): string {
  const words = query.trim()
  if (!words || count === null) return ''
  if (count === 0) return `Nothing found for “${words}”`
  return `${count} ${count === 1 ? units[0] : units[1]}`
}

/** `count` null: not searched yet, or still reading. */
export default function SearchAnnouncer({ query, count, units }: { query: string; count: number | null; units?: readonly [string, string] }) {
  return (
    <p role="status" className="sr-only" data-testid="search-announcer">
      {searchFoundText(query, count, units)}
    </p>
  )
}
