import type { RowFactTone } from '@/lib/listingRow'

/** A row's facts line, coloured only where it means something (see
 *  lib/listingRow.ts): a category page's rows and the map's list, so a place
 *  reads the same in both. */
export const FACT_TONE: Record<RowFactTone, string> = {
  open: 'font-medium text-green-700',
  caution: 'font-medium text-caution',
  closed: 'font-medium text-red-700',
  minyan: 'font-semibold text-ink',
  opens: 'font-medium text-slate-700',
  quiet: 'text-slate-500',
  plain: '',
}
