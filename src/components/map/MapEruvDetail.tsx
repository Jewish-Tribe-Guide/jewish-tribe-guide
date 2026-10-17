'use client'

import { useState } from 'react'
import BackIconButton from '@/components/BackIconButton'
import { EruvListing } from '@/components/resources/EruvListing'
import type { Eruv } from '@/lib/eruv'
import type { HostedEditor } from '@/components/resources/ListingEditor'

/** An eruv opened on the guide's map: its listing, as the Eruv page shows
 *  it, in the sheet or sidebar a place opens in, with the same way back. */
export default function MapEruvDetail({
  eruv,
  color,
  now,
  timezone,
  candles,
  onBack,
  onEditor,
}: {
  eruv: Eruv
  color: string
  now: Date
  timezone: string
  candles: number | null
  onBack?: () => void
  /** Its edit form, while open, for the desktop sidebar to step back from
   *  with the ← in its search box, as it does for a place's. */
  onEditor?: (editor: HostedEditor | null) => void
}) {
  // While editing, the editor's own ‹ is the way back; a "Back to list"
  // above it would be a second one.
  const [editing, setEditing] = useState(false)
  return (
    <div data-testid="map-eruv-detail">
      {/* The phone's sheet only: the desktop sidebar's way back is the ←
          in its search box. The chevron alone, as for a place. */}
      {onBack && !editing && (
        <div className="mb-3">
          <BackIconButton label="Back to list" onClick={onBack} />
        </div>
      )}
      <EruvListing eruv={eruv} color={color} now={now} timezone={timezone} candles={candles} onEditingChange={setEditing} onEditor={onEditor} />
    </div>
  )
}
