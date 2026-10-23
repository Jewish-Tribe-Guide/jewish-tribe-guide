import type { Minyan } from './davening'
import { sectionConfirmedAt } from './listingView'
import { isShabbosRow } from './minyanText'
import type { DirectoryResource } from '@/types'

/** When the usual time a minyan comes from was last checked: the usual
 *  Shabbos box's date for a Friday-night or Saturday row, else the weekday
 *  box's. Under a minyan the shul hasn't sent this week's times for:
 *  "Usual time · last checked Oct 12" (the user, Oct 23). Its own file, so
 *  the Minyanim list's code stays out of the listing's (see minyanText). */
export function usualCheckedAt(item: DirectoryResource, row: Minyan | undefined): string | undefined {
  return sectionConfirmedAt(item, row && isShabbosRow(row) ? 'shabbos' : 'weekday')
}
