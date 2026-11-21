'use client'
// Naming a dropped pin, or renaming and removing one (split out of
// ResourceMapView Nov 21, no behaviour change).
import DroppedPinEditor from './DroppedPinEditor'
import type { useDroppedPins } from '@/lib/droppedPinsContext'

type DroppedPins = ReturnType<typeof useDroppedPins>

/* ── Dropped-pin naming/editing — a long-press on empty map (see
        onMapLongPress above) opens this with pendingDropAt set; tapping
        an already-placed one opens it with editingDroppedId instead.
        Never both at once. ──────────────────────────────────────── */
export default function DroppedPinEditors({
  pendingDropAt,
  setPendingDropAt,
  editingDroppedId,
  setEditingDroppedId,
  droppedPins,
  addDroppedPin,
  renameDroppedPin,
  removeDroppedPin,
}: {
  pendingDropAt: { lat: number; lng: number } | null
  setPendingDropAt: (at: { lat: number; lng: number } | null) => void
  editingDroppedId: string | null
  setEditingDroppedId: (id: string | null) => void
  droppedPins: DroppedPins['droppedPins']
  addDroppedPin: DroppedPins['add']
  renameDroppedPin: DroppedPins['rename']
  removeDroppedPin: DroppedPins['remove']
}) {
  return (
    <>
      {pendingDropAt && (
        <DroppedPinEditor
          onSave={(label) => {
            addDroppedPin({ id: crypto.randomUUID(), lat: pendingDropAt.lat, lng: pendingDropAt.lng, label })
            setPendingDropAt(null)
          }}
          onCancel={() => setPendingDropAt(null)}
        />
      )}
      {editingDroppedId && (() => {
        const pin = droppedPins.find((p) => p.id === editingDroppedId)
        // The pin was removed (e.g. from another tab) between the tap and
        // this render — nothing left to edit.
        if (!pin) return null
        return (
          <DroppedPinEditor
            initialLabel={pin.label}
            onSave={(label) => {
              renameDroppedPin(pin.id, label)
              setEditingDroppedId(null)
            }}
            onDelete={() => {
              removeDroppedPin(pin.id)
              setEditingDroppedId(null)
            }}
            onCancel={() => setEditingDroppedId(null)}
          />
        )
      })()}
    </>
  )
}
