import { listEruvimForAdmin, saveEmailRead, saveLineMissing, saveLineRead, saveStatusRead, type AdminEruv } from './eruvStore'
import { rereadKeptEmail } from './eruvEmail'
import { readEruvPage } from './eruvReader'
import { readEruvMap } from './eruvLines'

// An eruv's status page and map, read now rather than at their next turn:
// an admin's Read now (Places), and an eruv just added, by an admin or by
// approving a visitor's suggestion (Nov 9). Its status is otherwise read
// only on Fridays and before Yom Tov, so an eruv approved on a Tuesday
// would say nothing until then.

/** Its map read now, dated even when it's the same; seen here, so no email
 *  about a missing part later. */
export async function readAndSaveMap(community: string, eruv: AdminEruv | null, now = new Date()): Promise<void> {
  if (!eruv?.lineUrl) return
  const read = await readEruvMap({ ...eruv, lineUrl: eruv.lineUrl }, now)
  await saveLineRead(community, eruv.id, read.save)
  if (read.missing) await saveLineMissing(community, eruv.id, read.missing)
}

/** Its status page, a kept email, and its map, each read now if it has one. */
export async function readEruvNow(community: string, timezone: string, eruv: AdminEruv): Promise<void> {
  const now = new Date()
  if (eruv.statusUrl) await saveStatusRead(community, eruv.id, await readEruvPage(eruv.statusUrl, now))
  // Read now, it goes live and is put away; still unreadable, it waits.
  const reread = eruv.statusEmailKept && rereadKeptEmail(eruv.statusEmailKept, timezone)
  if (reread) await saveEmailRead(community, eruv.id, reread, null)
  await readAndSaveMap(community, eruv, now)
}

/** The same, by its id: nothing when there's no such eruv. */
export async function readEruvNowById(community: string, timezone: string, id: string): Promise<void> {
  const eruv = (await listEruvimForAdmin(community)).eruvim.find((e) => e.id === id)
  if (eruv) await readEruvNow(community, timezone, eruv)
}
