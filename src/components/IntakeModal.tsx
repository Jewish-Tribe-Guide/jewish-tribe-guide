import { useEffect } from 'react'

type Props = {
  title: string
  onClose: () => void
  children?: React.ReactNode
}

export default function IntakeModal({ title, onClose, children }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 id="modal-title" className="text-xl font-semibold text-slate-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-slate-700 transition-colors p-1 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          {children ?? <p className="text-muted text-sm">Form coming soon.</p>}
        </div>
      </div>
    </div>
  )
}
