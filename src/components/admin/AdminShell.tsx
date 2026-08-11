'use client'

// The <main>/heading wrapper every admin screen renders inside — both the
// loading/login states (see AdminAuthGate) and the authenticated route tree,
// so every route file drops straight into the same chrome without repeating
// it.
export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    // w-full: this <main> is a flex item of <body>'s flex-col layout (see
    // admin/layout.tsx). The tab bar's un-wrapped row of labels ("Desktop &
    // mobile", "Categories", …) was stretching THIS element wider than the
    // viewport — and with it, the whole page — rather than being contained by
    // the tab row's own `overflow-x-auto`. That scroll container never got a
    // chance to do its job because its own box had already grown past the
    // screen.
    //
    // min-w-0 alone (the usual fix for a flex item overflowing on its cross
    // axis) did NOT fix this — confirmed by forcing it live and watching the
    // element still render past the screen edge. Something about this
    // specific combination (max-w-3xl + mx-auto on a column flex item) didn't
    // resolve to the viewport width the way min-w-0 normally guarantees.
    // Forcing width: 100% directly did — the tab row picked up a real,
    // visible internal scrollbar the moment this landed. Keeping min-w-0 too:
    // it's still the semantically-correct guard for this class of bug and
    // costs nothing alongside w-full.
    <main className="w-full min-w-0 max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Resource Moderation</h1>
      <p className="text-sm text-muted mb-6">Review and approve submitted resources.</p>
      {children}
    </main>
  )
}
