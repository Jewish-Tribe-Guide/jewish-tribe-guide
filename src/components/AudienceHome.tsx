'use client'

import SearchBar from '@/components/home/SearchBar'
import {
  CardRow,
  Section,
  directSupportCards,
  resourceCards,
  volunteerCards,
} from '@/components/home/sections'
import { useCategories } from '@/lib/useCategories'
import type { Audience, NavigateFn } from '@/types'

type Props = {
  audience: Audience
  onNavigate: NavigateFn
}

// The per-audience home pages (the header tabs switch between them, Airbnb
// Homes/Experiences style). Each shows only what's relevant to that visitor.
export default function AudienceHome({ audience, onNavigate }: Props) {
  const categories = useCategories()
  const isPatient = audience === 'patient'

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
      <div className="pt-10 sm:pt-12">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          {isPatient ? 'For patients & families' : 'For the community'}
        </h1>
        <p className="mt-1.5 text-[15px] text-slate-500">
          {isPatient
            ? 'Request support and find what you need, all within reach of your hospital.'
            : 'Lend a hand to a family in need, and find Jewish resources near you.'}
        </p>
        <div className="mt-6 max-w-xl">
          <SearchBar onNavigate={onNavigate} compact />
        </div>
      </div>

      {isPatient ? (
        <>
          <Section
            title="Direct Support"
            subtitle="Request help from the community — a neighbor will take it from there."
            seeAllLabel="All services"
            onSeeAll={() => onNavigate('patient', 'assist')}
          >
            <CardRow cards={directSupportCards(onNavigate)} />
          </Section>
          <Section
            title="Resources & Information"
            subtitle="Everything nearby, sorted by distance from your hospital."
            seeAllLabel="All resources"
            onSeeAll={() => onNavigate('patient', 'find')}
          >
            <CardRow cards={resourceCards(onNavigate, categories, { includeHospital: true })} tintOffset={2} />
          </Section>
        </>
      ) : (
        <>
          <Section
            title="Volunteer Opportunities"
            subtitle="The community runs on neighbors like you."
            seeAllLabel="Sign up"
            onSeeAll={() => onNavigate('community', 'give')}
          >
            <CardRow cards={volunteerCards(onNavigate)} />
          </Section>
          <Section
            title="Resources & Information"
            subtitle="Everything nearby, sorted by distance from your address."
            seeAllLabel="All resources"
            onSeeAll={() => onNavigate('community', 'find')}
          >
            <CardRow cards={resourceCards(onNavigate, categories, { includeHospital: false })} tintOffset={2} />
          </Section>
        </>
      )}
    </main>
  )
}
