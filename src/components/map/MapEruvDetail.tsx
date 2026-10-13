'use client'

import UpButton from '@/components/UpButton'
import { EruvListing } from '@/components/resources/EruvListing'
import type { Eruv } from '@/lib/eruv'

/** An eruv opened on the guide's map: its listing, as the Eruv page shows
 *  it, in the sheet or sidebar a place opens in, with the same way back. */
export default function MapEruvDetail({ eruv, color, now, timezone, candles, onBack }: { eruv: Eruv; color: string; now: Date; timezone: string; candles: number | null; onBack: () => void }) {
  return (
    <div data-testid="map-eruv-detail">
      <UpButton label="Back to list" onClick={onBack} className="" />
      <EruvListing eruv={eruv} color={color} now={now} timezone={timezone} candles={candles} />
    </div>
  )
}
