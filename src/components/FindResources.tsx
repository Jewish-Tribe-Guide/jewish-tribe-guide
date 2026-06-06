'use client'

import { useState } from 'react'
import Synagogues from '@/components/tabs/Synagogues'
import AboutYourHospital from '@/components/tabs/AboutYourHospital'
import { groceries, restaurants, hotels, mikvahs, eruvInfo, whatsappGroups } from '@/data/resources'
import ResourceDirectory from '@/components/resources/ResourceDirectory'
import Hotels from '@/components/resources/Hotels'
import MikvahInfo from '@/components/resources/MikvahInfo'
import EruvInfo from '@/components/resources/EruvInfo'
import WhatsAppGroups from '@/components/resources/WhatsAppGroups'
import ZmanimCard from '@/components/ZmanimCard'

type FindView =
  | 'about-hospital'
  | 'synagogues'
  | 'groceries'
  | 'restaurants'
  | 'hotels'
  | 'mikvah'
  | 'eruv'
  | 'whatsapp'
  | 'zmanim'
  | null

type ResourceItem = {
  id: Exclude<FindView, null>
  label: string
  icon: string
  description: string
}

const ITEMS: ResourceItem[] = [
  {
    id: 'about-hospital',
    label: 'About Your Hospital',
    icon: '🏥',
    description: 'Chaplain, kosher meals, Jewish medical staff, prayer space, and Shabbat accommodations',
  },
  {
    id: 'synagogues',
    label: 'Synagogues',
    icon: '✡️',
    description: 'Nearby shuls with davening times, contacts, and WhatsApp groups',
  },
  {
    id: 'groceries',
    label: 'Grocery Stores',
    icon: '🛒',
    description: 'Kosher and local grocery stores near the hospital',
  },
  {
    id: 'restaurants',
    label: 'Restaurants',
    icon: '🍽️',
    description: 'Kosher and nearby dining options',
  },
  {
    id: 'hotels',
    label: 'Hotels',
    icon: '🏨',
    description: 'Lodging with shuttle and Shabbat-friendly options',
  },
  {
    id: 'mikvah',
    label: 'Mikvah',
    icon: '💧',
    description: 'Mikvah locations, hours, and contact information',
  },
  {
    id: 'eruv',
    label: 'Eruv Information',
    icon: '🗺️',
    description: 'Eruv status, maps, and contacts for Shabbat',
  },
  {
    id: 'whatsapp',
    label: 'Community WhatsApp Groups',
    icon: '💬',
    description: 'Join local support and coordination groups',
  },
  {
    id: 'zmanim',
    label: 'Zmanim & Shabbos',
    icon: '🕯️',
    description: 'Hebrew date, daily zmanim, candle lighting, and havdalah',
  },
]

type Props = {
  hospitalId: string
  hospitalName: string
  onBack: () => void
}

export default function FindResources({ hospitalId, hospitalName, onBack }: Props) {
  const [view, setView] = useState<FindView>(null)
  const [query, setQuery] = useState('')

  const goBack = () => setView(null)

  // ── Detail views ──────────────────────────────────────────────────────────────
  if (view === 'about-hospital') {
    return <AboutYourHospital hospitalId={hospitalId} hospitalName={hospitalName} onBack={goBack} />
  }
  if (view === 'synagogues') {
    return <Synagogues hospitalId={hospitalId} hospitalName={hospitalName} onBack={goBack} />
  }
  if (view === 'groceries') {
    const items = groceries.filter((g) => g.hospitalId === hospitalId)
    return <ResourceDirectory title="Grocery Stores" items={items} onBack={goBack} />
  }
  if (view === 'restaurants') {
    const items = restaurants.filter((r) => r.hospitalId === hospitalId)
    return <ResourceDirectory title="Restaurants" items={items} onBack={goBack} />
  }
  if (view === 'hotels') {
    const items = hotels.filter((h) => h.hospitalId === hospitalId)
    return <Hotels items={items} onBack={goBack} />
  }
  if (view === 'mikvah') {
    const items = mikvahs.filter((m) => m.hospitalId === hospitalId)
    return <MikvahInfo items={items} onBack={goBack} />
  }
  if (view === 'eruv') {
    const eruv = eruvInfo[hospitalId as keyof typeof eruvInfo]
    if (!eruv)
      return (
        <div>
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <p className="text-muted text-sm">No eruv information available for this hospital.</p>
        </div>
      )
    return <EruvInfo eruv={eruv} onBack={goBack} />
  }
  if (view === 'whatsapp') {
    return <WhatsAppGroups groups={whatsappGroups} onBack={goBack} />
  }
  if (view === 'zmanim') {
    return (
      <ZmanimCard
        key={hospitalId}
        hospitalId={hospitalId}
        hospitalName={hospitalName}
        onBack={goBack}
      />
    )
  }

  // ── Index ─────────────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase()
  const visibleItems = [...ITEMS]
    .sort((a, b) => a.label.localeCompare(b.label))
    .filter(
      (item) =>
        !q || item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    )

  return (
    <div>
      {/* Back to Home */}
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
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-800">Find Resources</h2>
        <p className="text-sm text-muted mt-0.5">{hospitalName}</p>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search resources…"
          aria-label="Search resources"
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-muted shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {visibleItems.length === 0 ? (
        <p className="text-muted text-sm">No resources match “{query}”.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className="flex flex-col items-start gap-3 p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-primary hover:shadow-md transition-all text-left cursor-pointer group h-full"
            >
              <span className="text-4xl" aria-hidden="true">{item.icon}</span>
              <div>
                <p className="text-base font-semibold text-slate-900 group-hover:text-primary transition-colors mb-1">
                  {item.label}
                </p>
                <p className="text-sm text-muted leading-snug">{item.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
