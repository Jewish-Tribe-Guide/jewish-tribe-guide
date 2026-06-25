// Timestamps for the Google Sheets tabs, which a human reads. Eastern
// (Philadelphia) local time, sortable: "2026-06-24 14:30:45". Written as a
// string so it reads correctly in the sheet without UTC-offset confusion.
//
// Note: this is for human-facing sheet rows only. Database/system fields
// (Supabase reviewed_at, googleSyncedAt, etc.) intentionally stay UTC ISO.
export function easternTimestamp(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date())
}
