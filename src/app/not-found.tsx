import Link from 'next/link'

// Shown for an unknown community (/baltimore before Baltimore exists) and an
// unknown slug under one (/philly/nonsense). Both used to be impossible to
// express: the whole site was one URL, so an unrecognized view rendered an
// empty state with a 200 — which is also what a crawler and a link preview saw.
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-3 text-sm text-muted">
        This link may be out of date — a category or community can be renamed or removed after a
        link to it has been shared.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
      >
        Go home
      </Link>
    </main>
  )
}
