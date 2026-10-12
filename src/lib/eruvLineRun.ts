import { listEruvMapSources, saveLineMissing, saveLineRead } from './eruvStore'
import { newlyMissing, readEruvMap } from './eruvLines'
import { sendEruvLineAlert } from './email'

// The daily cron's eruv part (cron/watches): each eruv's map read, a fresh
// copy kept, and the admins told, once, of a part they left out that the
// map no longer has (eruvLines.ts). One eruv failing never stops the rest.

export type LineRun = { id: string; result: 'read' | 'missing' | 'failed'; error?: string; missing?: string[] }

export async function runEruvLines(now = new Date()): Promise<LineRun[]> {
  const sources = await listEruvMapSources()
  const runs: LineRun[] = []
  const tell = new Map<string, { name: string; missing: string[] }[]>()
  for (const source of sources) {
    try {
      const read = await readEruvMap(source, now)
      if (read.save) await saveLineRead(source.communityId, source.id, read.save)
      if (!read.missing) {
        runs.push({ id: source.id, result: 'failed', error: read.save && !read.save.ok ? read.save.error : undefined })
        continue
      }
      const fresh = newlyMissing(read.missing, source.lineMissing)
      if (read.missing.join('|') !== source.lineMissing.join('|')) await saveLineMissing(source.communityId, source.id, read.missing)
      if (fresh.length) tell.set(source.communityId, [...(tell.get(source.communityId) ?? []), { name: source.name, missing: fresh }])
      runs.push(read.missing.length ? { id: source.id, result: 'missing', missing: read.missing } : { id: source.id, result: 'read' })
    } catch (err) {
      runs.push({ id: source.id, result: 'failed', error: err instanceof Error ? err.message : String(err) })
    }
  }
  for (const [community, eruvim] of tell) await sendEruvLineAlert(community, eruvim).catch((err) => console.error('[eruv lines] alert failed:', err))
  return runs
}
