import { useEffect } from 'react'

type Props = {
  title: string
  onClose: () => void
}

export default function IntakeModal({ title, onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
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
        {/* Form content will be added here */}
        <p className="text-muted text-sm">Form coming soon.</p>
      </div>
    </div>
  )
}
