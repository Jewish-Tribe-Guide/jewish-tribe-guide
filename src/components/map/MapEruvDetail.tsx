'use client'

import { useCallback, useState } from 'react'
import BackIconButton from '@/components/BackIconButton'
import { EruvListing } from '@/components/resources/EruvListing'
import type { Eruv } from '@/lib/eruv'

/** An eruv opened on the guide's map: its listing, as the Eruv page shows
 *  it, in the sheet or sidebar a place opens in, with the same way back. */
export default function MapEruvDetail({
  eruv,
  color,
  now,
  timezone,
  candles,
  onBack,
  onEditingChange,
}: {
  eruv: Eruv
  color: string
  now: Date
  timezone: string
  candles: number | null
  onBack?: () => void
  /** Whether its edit form is open, for the desktop sidebar to step its
   *  search box aside, as it does for a place's. */
  onEditingChange?: (editing: boolean) => void
}) {
  // While editing, the editor's own ‹ is the way back; a "Back to list"
  // above it would be a second one.
  const [editing, setEditing] = useState(false)
  const reportEditing = useCallback(
    (next: boolean) => {
      setEditing(next)
      onEditingChange?.(next)
    },
    [onEditingChange],
  )
  return (
    <div data-testid="map-eruv-detail">
      {/* The phone's sheet only: the desktop sidebar's way back is the ←
          in its search box. The chevron alone, as for a place. */}
      {onBack && !editing && (
        <div className="mb-3">
          <BackIconButton label="Back to list" onClick={onBack} />
        </div>
      )}
      <EruvListing eruv={eruv} color={color} now={now} timezone={timezone} candles={candles} onEditingChange={reportEditing} />
    </div>
  )
}
