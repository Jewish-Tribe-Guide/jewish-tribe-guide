import { community } from '@/community.config'

// The UI capability flags, with every field defaulted to `true` — so a community
// can flip any toggle in community.config.ts (or omit it entirely) and the app
// still resolves a complete, valid shape. Import `ui` from here, never read
// `community.ui` directly, so the defaults always apply.

type UiConfig = {
  contributions: { add: boolean; edit: boolean; report: boolean }
  search: { landing: boolean; directory: boolean; map: boolean }
  map: { enabled: boolean; liveTracking: boolean; nearbyList: boolean; pins: boolean }
  upvotes: boolean
}

// community.ui is `as const`; read it loosely so missing keys fall back to true.
const raw = (community as { ui?: DeepPartial<UiConfig> }).ui ?? {}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export const ui: UiConfig = {
  contributions: {
    add: raw.contributions?.add ?? true,
    edit: raw.contributions?.edit ?? true,
    report: raw.contributions?.report ?? true,
  },
  search: {
    landing: raw.search?.landing ?? true,
    directory: raw.search?.directory ?? true,
    map: raw.search?.map ?? true,
  },
  map: {
    enabled: raw.map?.enabled ?? true,
    liveTracking: raw.map?.liveTracking ?? true,
    nearbyList: raw.map?.nearbyList ?? true,
    pins: raw.map?.pins ?? true,
  },
  upvotes: raw.upvotes ?? true,
}

/** True if any public-contribution path is enabled — the moderation queue / admin
 *  matters only when at least one is on. */
export const contributionsEnabled =
  ui.contributions.add ||
  ui.contributions.edit ||
  ui.contributions.report
