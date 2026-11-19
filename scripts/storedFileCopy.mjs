// Live's photos, copied to the test project with the rows that show them
// (Nov 19).
//
// sync-dev-from-prod copied rows as they were, so every photo they show
// still pointed at live's storage: 130 of them by Nov 19. Live's clean-up
// only knows live's own rows, so when it cleared a logo live had stopped
// using, dev's Philly logo (still that file) broke, and with it the icon
// e2e tests on the test project, CI's included. So a row is copied with its
// files now: each live file it names is put in the test project's own
// storage, under the same path, and the row is pointed there. A file that
// can't be copied keeps its live address and is reported.

export const BUCKET = 'site-assets'

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Matches a stored file's address on `base`, plain or resized:
 *  group 1 is the kind (object or render/image), group 2 its path. */
function addressPattern(base) {
  return new RegExp(`${escape(base)}/storage/v1/(object|render/image)/public/${BUCKET}/([a-z-]+/[^"'?#\\s)<>\\\\]+)`, 'g')
}

/** The bucket paths of `base`'s files a value names, once each. */
export function storedPathsOn(value, base) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  return [...new Set([...text.matchAll(addressPattern(base))].map((m) => m[2]))]
}

/** The value with each named file in `copied` moved from `from` to `to`;
 *  any other address left as it was. */
export function pointAt(value, from, to, copied) {
  const text = JSON.stringify(value)
  const out = text.replace(addressPattern(from), (whole, kind, path) =>
    copied.has(path) ? `${to}/storage/v1/${kind}/public/${BUCKET}/${path}` : whole,
  )
  return out === text ? value : JSON.parse(out)
}

/** Copies one file from `fromUrl`'s public storage into `dest`'s bucket at
 *  the same path, unless it's there already. Never writes to the source. */
export async function copyFile(path, fromUrl, toUrl, dest) {
  const at = (base) => `${base}/storage/v1/object/public/${BUCKET}/${path}`
  if ((await fetch(at(toUrl), { method: 'HEAD' })).ok) return 'there'
  const res = await fetch(at(fromUrl))
  if (!res.ok) throw new Error(`${path}: live answered ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const { error } = await dest.storage
    .from(BUCKET)
    .upload(decodeURIComponent(path), bytes, { contentType: res.headers.get('content-type') ?? undefined, upsert: false })
  if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`${path}: ${error.message}`)
  return 'copied'
}

/** Copies every live file `rows` name, and returns the rows pointed at the
 *  copies, with the paths that failed. */
export async function withOwnFiles(rows, fromUrl, toUrl, dest, done = new Set()) {
  const failed = []
  for (const path of storedPathsOn(rows, fromUrl)) {
    if (done.has(path)) continue
    try {
      await copyFile(path, fromUrl, toUrl, dest)
      done.add(path)
    } catch (err) {
      failed.push(err instanceof Error ? err.message : String(err))
    }
  }
  return { rows: rows.map((r) => pointAt(r, fromUrl, toUrl, done)), failed }
}
