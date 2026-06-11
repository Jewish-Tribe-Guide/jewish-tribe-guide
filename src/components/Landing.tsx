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
import type { NavigateFn } from '@/types'

type Props = {
  onNavigate: NavigateFn
  /** Opens a service request form as a modal over the landing page. */
  onOpenService: (service: string) => void
}

// The landing page: a centered search up top, then the three browse rows.
// The header tabs (Patients & Families / Community) lead to the per-audience
// pages for anyone who wants a filtered view.
export default function Landing({ onNavigate, onOpenService }: Props) {
  const categories = useCategories()

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
      {/* ── Search hero ──────────────────────────────────────────────────────── */}
      <section className="pt-12 sm:pt-16 text-center">
        <h1 className="text-3xl sm:text-[40px] font-bold tracking-tight text-slate-900 leading-tight">
          What are you looking for?
        </h1>
        <p className="mt-3 max-w-2xl mx-auto text-[15px] sm:text-base text-slate-500">
          Kosher meals, rides, housing, visitors, and community resources for patients
          and families at Philadelphia hospitals.
        </p>
        <div className="mt-8 max-w-xl mx-auto">
          <SearchBar onNavigate={onNavigate} onOpenService={onOpenService} />
        </div>
      </section>

      <Section
        title="Direct Support"
        subtitle="Request help from the community — a neighbor will take it from there."
        seeAllLabel="Request direct support"
        onSeeAll={() => onNavigate('patient', 'assist')}
      >
        <CardRow cards={directSupportCards(onOpenService, onNavigate)} />
      </Section>

      <Section
        title="Resources & Information"
        subtitle="Everything nearby, sorted by distance from your hospital or address."
        seeAllLabel="All resources"
        onSeeAll={() => onNavigate('patient', 'find')}
      >
        <CardRow cards={resourceCards(onNavigate, categories, { includeHospital: true })} tintOffset={2} />
      </Section>

      <Section
        title="Volunteer Opportunities"
        subtitle="The community runs on neighbors like you."
        seeAllLabel="Sign up"
        onSeeAll={() => onNavigate('community', 'give')}
      >
        <CardRow cards={volunteerCards(onNavigate)} tintOffset={4} />
      </Section>
    </main>
  )
}
