import { listEruvimWithLines, saveLineRead } from './eruvStore'
import { candlesTomorrow, runLine, type LineRun } from './eruvLines'
import { resolveCommunity } from './communityStore'
import { sendEruvLineAlert } from './email'

// The daily cron's eruv part (cron/watches): each community's eruv lines
// are read the day before candles (eruvLines.ts), new or changed ones wait
// for an admin, and the admins hear once about each. One eruv failing
// never stops the rest.

export async function runEruvLines(now = new Date()): Promise<LineRun[]> {
  const all = await listEruvimWithLines()
  const runs: LineRun[] = []
  for (const communityId of [...new Set(all.map((e) => e.communityId))]) {
    const community = await resolveCommunity(communityId)
    const due = await candlesTomorrow({ latitude: community.mapCenter.lat, longitude: community.mapCenter.lng, timezone: community.timezone }, now)
    const told: { name: string; first: boolean }[] = []
    for (const eruv of all.filter((e) => e.communityId === communityId)) {
      try {
        const { run, save } = await runLine(eruv, { due, now })
        if (save) await saveLineRead(communityId, eruv.id, save)
        if (run.result === 'new' || run.result === 'changed') told.push({ name: eruv.name, first: run.result === 'new' })
        runs.push(run)
      } catch (err) {
        runs.push({ id: eruv.id, result: 'failed', error: err instanceof Error ? err.message : String(err) })
      }
    }
    await sendEruvLineAlert(communityId, told).catch((err) => console.error('[eruv lines] alert failed:', err))
  }
  return runs
}
