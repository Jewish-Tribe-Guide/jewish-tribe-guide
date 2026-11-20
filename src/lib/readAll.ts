// ── Every row, not the first 1,000 (Nov 20, the health sweep) ──
// Supabase hands back at most 1,000 rows a request and says nothing about
// the rest: no error, no flag. A list read with no paging was right until
// its table grew, then quietly short. Live had 1,380 submissions by Nov 20,
// and the watches read every finding they've ever made to know what
// they've already proposed.
//
// So a read that can pass 1,000 rows goes through here: a page at a time,
// in the order the caller gives, until a page comes back short. The order
// must end on a unique key (the table's primary key), or a row can move
// between pages while they're read, and be skipped or counted twice.
//
//   const { data, error } = await readAll((from, to) =>
//     db.from('submission').select('id, payload').eq('community_id', c).order('id').range(from, to))
//
// src/test/readsArePaged.test.ts keeps unpaged list reads off the tables
// that grow; src/lib/supabase/rowCap.ts reports any read that still comes
// back at the cap.

/** The most rows Supabase returns in one request (its API's "Max rows"). */
export const ROW_CAP = 1000

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Every row of a read, a page at a time. Same `{ data, error }` as one
 *  read, so a caller's error handling stays as it was. */
export async function readAll<T>(page: (from: number, to: number) => Page<T>): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += ROW_CAP) {
    const { data, error } = await page(from, from + ROW_CAP - 1)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < ROW_CAP) return { data: rows, error: null }
  }
}
