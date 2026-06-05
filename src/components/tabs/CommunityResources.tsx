'use client'

import { useState } from 'react'
import { groceries, restaurants, hotels, mikvahs, eruvInfo, whatsappGroups } from '@/data/resources'
import ResourceDirectory from '@/components/resources/ResourceDirectory'
import Hotels from '@/components/resources/Hotels'
import MikvahInfo from '@/components/resources/MikvahInfo'
import EruvInfo from '@/components/resources/EruvInfo'
import WhatsAppGroups from '@/components/resources/WhatsAppGroups'

type View = 'groceries' | 'restaurants' | 'hotels' | 'mikvah' | 'eruv' | 'whatsapp' | null

const CATEGORIES = [
  {
    title: 'Food & Shopping',
    items: [
      { id: 'groceries' as View, label: 'Grocery Stores', icon: '🛒' },
      { id: 'restaurants' as View, label: 'Restaurants', icon: '🍽️' },
    ],
  },
  {
    title: 'Lodging',
    items: [
      { id: 'hotels' as View, label: 'Hotels', icon: '🏨' },
    ],
  },
  {
    title: 'Jewish Community Resources',
    items: [
      { id: 'mikvah' as View, label: 'Mikvah', icon: '💧' },
      { id: 'eruv' as View, label: 'Eruv Information', icon: '🗺️' },
      { id: 'whatsapp' as View, label: 'Community WhatsApp Groups', icon: '💬' },
    ],
  },
]

type Props = {
  hospitalId: string
  hospitalName: string
  onBack: () => void
}

export default function CommunityResources({ hospitalId, hospitalName, onBack }: Props) {
  const [activeView, setActiveView] = useState<View>(null)

  const goBack = () => setActiveView(null)

  // ── Detail views ──────────────────────────────────────────────────────────────
  if (activeView === 'groceries') {
    const items = groceries.filter((g) => g.hospitalId === hospitalId)
    return <ResourceDirectory title="Grocery Stores" items={items} onBack={goBack} />
  }
  if (activeView === 'restaurants') {
    const items = restaurants.filter((r) => r.hospitalId === hospitalId)
    return <ResourceDirectory title="Restaurants" items={items} onBack={goBack} />
  }
  if (activeView === 'hotels') {
    const items = hotels.filter((h) => h.hospitalId === hospitalId)
    return <Hotels items={items} onBack={goBack} />
  }
  if (activeView === 'mikvah') {
    const items = mikvahs.filter((m) => m.hospitalId === hospitalId)
    return <MikvahInfo items={items} onBack={goBack} />
  }
  if (activeView === 'eruv') {
    const eruv = eruvInfo[hospitalId as keyof typeof eruvInfo]
    if (!eruv) return (
      <div>
        <button onClick={goBack} className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <p className="text-muted text-sm">No eruv information available for this hospital.</p>
      </div>
    )
    return <EruvInfo eruv={eruv} onBack={goBack} />
  }
  if (activeView === 'whatsapp') {
    return <WhatsAppGroups groups={whatsappGroups} onBack={goBack} />
  }

  // ── Category index ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Back to Find Resources */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Option-3 heading */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Community Resources</h2>
        <p className="text-sm text-muted mt-0.5">{hospitalName}</p>
      </div>

      <div className="space-y-5">
        {CATEGORIES.map((cat) => (
          <div key={cat.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 px-1">
              {cat.title}
            </h3>
            <div className="space-y-2">
              {cat.items.map((item) => (
                <button
                  key={String(item.id)}
                  onClick={() => setActiveView(item.id)}
                  className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-3 text-left hover:border-primary hover:shadow-md transition-all cursor-pointer group"
                >
                  <span className="text-xl shrink-0" aria-hidden="true">{item.icon}</span>
                  <span className="font-medium text-slate-900 text-sm group-hover:text-primary transition-colors flex-1">
                    {item.label}
                  </span>
                  <svg className="w-4 h-4 text-muted group-hover:text-primary transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
