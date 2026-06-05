import type { CommunityWhatsAppGroup } from '@/types'

type Props = {
  groups: CommunityWhatsAppGroup[]
  onBack: () => void
}

export default function WhatsAppGroups({ groups, onBack }: Props) {
  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <h2 className="text-xl font-semibold text-slate-800 mb-4">Community WhatsApp Groups</h2>

      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.id} className="bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 text-sm">{group.name}</p>
                <p className="text-xs text-muted mt-1 leading-snug">{group.description}</p>
              </div>
              <a
                href={group.link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-md px-3 py-1.5 transition-colors whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.119.553 4.107 1.521 5.833L.057 23.428a.75.75 0 00.919.913l5.656-1.453A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.7 9.7 0 01-4.95-1.354l-.355-.211-3.655.938.964-3.572-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                </svg>
                Join Group
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
