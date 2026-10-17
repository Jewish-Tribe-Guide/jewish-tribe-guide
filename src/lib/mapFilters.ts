import { selectValues, type CategoryConfig } from './categories'

// ── The Map page's filters, per category (agreed Sep 30) ────────────────────
// The Map page shows several categories at once, and its Filters sheet has a
// section for each: that category's own Open now (where it keeps hours), its
// yes/no switches, its pick-lists. So each filter belongs to one category.
// Held by field key alone, as they used to be, Food's "t" (Meat, Dairy,
// Parve) was also Cemetery's "t" (its Type), and choosing Meat hid every
// cemetery.
//
// Above the sections, one Open now for everything showing that keeps hours
// (openNowAll): on turns every one on, off turns them all off, and it reads
// as on only when all of them are.

export type CategoryFilters = {
  openNow?: boolean
  bool?: string[]
  select?: Record<string, string[]>
}

/** Category id → its filters. A category with none is simply absent. */
export type MapFilterState = Record<string, CategoryFilters>

/** Whether a category keeps hours Open now can read (its own, not a
 *  mikvah's per-audience ones only). */
export function keepsHours(category: CategoryConfig): boolean {
  return category.detailFields.some((f) => f.type === 'hours' && f.filterable)
}

/** The fields a category's section offers: its filterable yes/no and
 *  pick-list fields, in the category's own order. */
export function filterFields(category: CategoryConfig) {
  return category.detailFields.filter((f) => f.filterable && (f.type === 'boolean' || f.type === 'select'))
}

function tidy(filters: MapFilterState, id: string, next: CategoryFilters): MapFilterState {
  const clean: CategoryFilters = {}
  if (next.openNow) clean.openNow = true
  if (next.bool?.length) clean.bool = next.bool
  const select = Object.fromEntries(Object.entries(next.select ?? {}).filter(([, vs]) => vs.length > 0))
  if (Object.keys(select).length) clean.select = select
  const out = { ...filters }
  if (Object.keys(clean).length) out[id] = clean
  else delete out[id]
  return out
}

export function toggleOpenNow(filters: MapFilterState, categoryId: string): MapFilterState {
  const f = filters[categoryId] ?? {}
  return tidy(filters, categoryId, { ...f, openNow: !f.openNow })
}

export function toggleBool(filters: MapFilterState, categoryId: string, key: string): MapFilterState {
  const f = filters[categoryId] ?? {}
  const bool = f.bool ?? []
  return tidy(filters, categoryId, { ...f, bool: bool.includes(key) ? bool.filter((k) => k !== key) : [...bool, key] })
}

export function toggleSelect(filters: MapFilterState, categoryId: string, key: string, value: string): MapFilterState {
  const f = filters[categoryId] ?? {}
  const chosen = f.select?.[key] ?? []
  const next = chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value]
  return tidy(filters, categoryId, { ...f, select: { ...f.select, [key]: next } })
}

/** The Open now above the sections: which of the categories showing keep
 *  hours, whether it's shown at all (two or more of them), and whether it
 *  reads as on (every one of them on). */
export function openNowAll(filters: MapFilterState, showing: readonly CategoryConfig[]) {
  const withHours = showing.filter(keepsHours)
  const on = withHours.filter((c) => filters[c.id]?.openNow)
  return {
    shown: withHours.length >= 2,
    on: withHours.length > 0 && on.length === withHours.length,
    /** "Food": the ones on, while not all are. */
    onFor: on.length > 0 && on.length < withHours.length ? on.map((c) => c.pluralLabel) : [],
    withHours,
  }
}

/** Every category showing that keeps hours to `on`: what the top switch,
 *  and typing "open now", do. */
export function setOpenNowFor(filters: MapFilterState, categories: readonly CategoryConfig[], on: boolean): MapFilterState {
  let out = filters
  for (const c of categories.filter(keepsHours)) {
    const f = out[c.id] ?? {}
    out = tidy(out, c.id, { ...f, openNow: on })
  }
  return out
}

/** Whether a listing passes its own category's yes/no and pick-list
 *  filters. Open now is checked by the map itself, which has the clock. */
export function passesFields(raw: Record<string, unknown>, f: CategoryFilters | undefined): boolean {
  if (!f) return true
  for (const key of f.bool ?? []) if (raw[key] !== true) return false
  for (const [key, values] of Object.entries(f.select ?? {})) {
    if (values.length && !selectValues(raw[key]).some((v) => values.includes(v))) return false
  }
  return true
}

/** How many filters are on, for the Filters button: each Open now, each
 *  switch, each pick. The top Open now counts once when it's on for all. */
export function filterCount(filters: MapFilterState, showing: readonly CategoryConfig[]): number {
  const top = openNowAll(filters, showing)
  let n = top.shown && top.on ? 1 : 0
  for (const c of showing) {
    const f = filters[c.id]
    if (!f) continue
    if (f.openNow && !(top.shown && top.on)) n++
    n += f.bool?.length ?? 0
    n += Object.values(f.select ?? {}).reduce((sum, vs) => sum + vs.length, 0)
  }
  return n
}

export type ActiveFilter = { key: string; label: string; remove: (filters: MapFilterState) => MapFilterState }

/** What's on, as the removable chips under the category chips say it:
 *  "Open now" when it's on for everything showing, otherwise "Food open
 *  now"; each switch and pick by its own label ("Meat", "Keilim"). */
export function activeFilters(filters: MapFilterState, showing: readonly CategoryConfig[]): ActiveFilter[] {
  const top = openNowAll(filters, showing)
  const out: ActiveFilter[] = []
  if (top.shown && top.on) {
    out.push({ key: 'open:all', label: 'Open now', remove: (f) => setOpenNowFor(f, top.withHours, false) })
  }
  for (const c of showing) {
    const f = filters[c.id]
    if (!f) continue
    if (f.openNow && !(top.shown && top.on)) {
      out.push({ key: `open:${c.id}`, label: top.shown ? `${c.pluralLabel} open now` : 'Open now', remove: (x) => toggleOpenNow(x, c.id) })
    }
    for (const key of f.bool ?? []) {
      const field = c.detailFields.find((d) => d.key === key)
      out.push({ key: `b:${c.id}:${key}`, label: field?.filterLabel ?? field?.label ?? key, remove: (x) => toggleBool(x, c.id, key) })
    }
    for (const [key, values] of Object.entries(f.select ?? {})) {
      for (const v of values) out.push({ key: `s:${c.id}:${key}:${v}`, label: v, remove: (x) => toggleSelect(x, c.id, key, v) })
    }
  }
  return out
}

// ── In the URL ───────────────────────────────────────────────────────────────
// open=1 is Open now for every category that keeps hours, as it always was;
// open=restaurant,grocery names them. Switches and picks are written
// category.key (is=mikvah.keilim, sel=restaurant.t:Meat|Dairy). A key with no
// category in front, from an older link or a category page's own Map
// button, belongs to the category the map was opened for, or failing that,
// to every category that has that field.

export type MapFiltersQuery = {
  open: string | null
  is: string | null
  sel: string | null
}

export function writeMapFilters(filters: MapFilterState, categories: readonly CategoryConfig[]): MapFiltersQuery {
  const withHours = categories.filter(keepsHours).map((c) => c.id)
  const open = Object.entries(filters).filter(([, f]) => f.openNow).map(([id]) => id)
  const all = withHours.length > 0 && withHours.every((id) => open.includes(id))
  const is = Object.entries(filters).flatMap(([id, f]) => (f.bool ?? []).map((k) => `${id}.${k}`))
  const sel = Object.entries(filters).flatMap(([id, f]) =>
    Object.entries(f.select ?? {}).filter(([, vs]) => vs.length).map(([k, vs]) => `${id}.${k}:${vs.join('|')}`),
  )
  return {
    open: open.length === 0 ? null : all ? '1' : open.sort().join(','),
    is: is.length ? is.join(',') : null,
    sel: sel.length ? sel.join(',') : null,
  }
}

export function readMapFilters(
  query: { open?: string | null; is?: string | null; sel?: string | null },
  categories: readonly CategoryConfig[],
  /** The category the map was opened for, which an unscoped key belongs to. */
  forCategory?: string | null,
): MapFilterState {
  const known = new Set(categories.map((c) => c.id))
  const owners = (key: string) =>
    forCategory && known.has(forCategory)
      ? [forCategory]
      : categories.filter((c) => c.detailFields.some((f) => f.key === key)).map((c) => c.id)
  const scoped = (raw: string): [string[], string] => {
    const dot = raw.indexOf('.')
    if (dot > 0 && known.has(raw.slice(0, dot))) return [[raw.slice(0, dot)], raw.slice(dot + 1)]
    return [owners(raw), raw]
  }
  let out: MapFilterState = {}

  const open = query.open?.trim()
  if (open === '1') out = setOpenNowFor(out, categories, true)
  else if (open) for (const id of open.split(',').map((s) => s.trim())) if (known.has(id)) out = tidy(out, id, { ...out[id], openNow: true })

  for (const raw of (query.is ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [ids, key] = scoped(raw)
    for (const id of ids) if (!out[id]?.bool?.includes(key)) out = toggleBool(out, id, key)
  }
  for (const pair of (query.sel ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const colon = pair.indexOf(':')
    if (colon <= 0) continue
    const [ids, key] = scoped(pair.slice(0, colon))
    const values = pair.slice(colon + 1).split('|').filter(Boolean)
    for (const id of ids) {
      const f = out[id] ?? {}
      out = tidy(out, id, { ...f, select: { ...f.select, [key]: [...new Set([...(f.select?.[key] ?? []), ...values])] } })
    }
  }
  return out
}
