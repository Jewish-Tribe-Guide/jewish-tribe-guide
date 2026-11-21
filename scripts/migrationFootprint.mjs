// What a migration makes that can be looked for afterwards: the tables it
// creates and the columns it adds (the health sweep, Nov 20). Migrations
// are pasted into the SQL editor by hand, so nothing recorded which ran
// where before `migration_ran` (migration 105). For one from before it,
// migration-report.mjs looks for these on a database to tell whether it ran.

/** Words after ADD or DROP in an ALTER TABLE that aren't a column's name. */
const NOT_COLUMNS = new Set(['constraint', 'default', 'not', 'primary', 'foreign', 'unique', 'check', 'exclude', 'identity', 'expression'])

const withoutComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
const nameOf = (raw) => raw.replace(/"/g, '').replace(/^public\./i, '').toLowerCase()
const TABLE = String.raw`((?:"?public"?\.)?"?\w+"?)`

/** The tables a migration creates, the columns (`table.column`) it adds,
 *  and what it drops or renames away. */
export function footprint(sql) {
  const tables = new Set()
  const columns = new Set()
  const gone = new Set()
  for (const statement of withoutComments(sql).split(';')) {
    const s = statement.replace(/\s+/g, ' ').trim()
    const created = new RegExp(String.raw`\bcreate (?:unlogged )?table (?:if not exists )?${TABLE}`, 'i').exec(s)
    if (created) tables.add(nameOf(created[1]))
    const dropped = /\bdrop table (?:if exists )?([^;]+?)(?: cascade| restrict)?$/i.exec(s)
    if (dropped) for (const t of dropped[1].split(',')) gone.add(nameOf(t.trim()))
    const altered = new RegExp(String.raw`\balter table (?:if exists )?(?:only )?${TABLE} (.*)$`, 'i').exec(s)
    if (!altered) continue
    const table = nameOf(altered[1])
    const rest = altered[2]
    const renamedTable = /^rename to "?(\w+)"?/i.exec(rest)
    if (renamedTable) {
      gone.add(table)
      tables.add(nameOf(renamedTable[1]))
      continue
    }
    const renamed = /^rename (?:column )?"?(\w+)"? to "?(\w+)"?/i.exec(rest)
    if (renamed) {
      gone.add(`${table}.${nameOf(renamed[1])}`)
      columns.add(`${table}.${nameOf(renamed[2])}`)
      continue
    }
    for (const [, col] of rest.matchAll(/(?:^|,)\s*add (?:column )?(?:if not exists )?"?(\w+)"?/gi)) {
      if (!NOT_COLUMNS.has(col.toLowerCase())) columns.add(`${table}.${col.toLowerCase()}`)
    }
    for (const [, col] of rest.matchAll(/(?:^|,)\s*drop (?:column )?(?:if exists )?"?(\w+)"?/gi)) {
      if (!NOT_COLUMNS.has(col.toLowerCase())) gone.add(`${table}.${col.toLowerCase()}`)
    }
  }
  return { tables: [...tables], columns: [...columns], gone: [...gone] }
}

/** For each migration, in order, what to look for to tell it ran: its
 *  tables and columns, less any a later migration dropped or renamed. */
export function probes(migrations) {
  const prints = migrations.map((m) => ({ name: m.name, ...footprint(m.sql) }))
  return prints.map((p, i) => {
    const later = new Set(prints.slice(i + 1).flatMap((q) => q.gone))
    const stays = (table) => !later.has(table)
    return {
      name: p.name,
      tables: p.tables.filter(stays),
      columns: p.columns.filter((c) => stays(c.split('.')[0]) && !later.has(c)),
    }
  })
}
