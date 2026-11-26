'use client'

import type { CategoryConfig } from '@/lib/categories'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { AdminBack, AdminBox, AdminRow } from './AdminUI'

// Add's first step (board U2, Nov 26): what kind of place it is, as the
// categories' rows. A tap goes on to finding it: no menu and no Next.

/** Where Add is: "Step 2 of 3". */
export function AddStep({ n }: { n: 1 | 2 | 3 }) {
  return <p className="m-0 text-[0.8125rem] font-extrabold uppercase tracking-[0.04em] text-slate-500">Step {n} of 3</p>
}

export default function AddWhat({ categories, onPick, onBack }: { categories: readonly CategoryConfig[]; onPick: (id: string) => void; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: 'Back', onClick: onBack }} title="What are you adding?" />
      <AddStep n={1} />
      <AdminBox>
        {categories.map((c) => (
          <AdminRow key={c.id} onClick={() => onPick(c.id)} icon={<CategoryGlyph categoryId={c.id} icon={c.icon ?? ''} className="h-5 w-5" />} name={c.label} />
        ))}
      </AdminBox>
    </div>
  )
}
