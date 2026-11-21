// An /api/ address with no route of its own answers 404 here (Nov 21).
// Without this it reached the [community] pages (as the community "api"),
// and with Partial Prefetching those send their prerendered shell and a 200
// before the layout can find "api" isn't a community: e2e's check that the
// old paid travel-time endpoint is gone saw a 200. Every real route is more
// specific than this one, so it only ever answers what nothing else does.

function notFound() {
  return Response.json({ error: 'Not found.' }, { status: 404 })
}

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
