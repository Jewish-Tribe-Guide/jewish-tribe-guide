// Dates and addresses as the Watches tab's kind pages write them.

/** "Oct 21". */
export function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** A page's address without its scheme, for its link. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}
