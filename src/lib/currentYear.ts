import { cacheLife } from 'next/cache'

/** The current year, for the footer's copyright line.
 *
 *  Reading the clock is non-deterministic, so under Cache Components it either
 *  defers the component to request time or has to be cached. Cached is plainly
 *  right here: a copyright year is the same for every visitor, and the worst
 *  case for a day-long cache is that it turns over a few hours late on
 *  January 1st. */
export async function currentYear(): Promise<number> {
  'use cache'
  cacheLife('days')
  return new Date().getFullYear()
}
