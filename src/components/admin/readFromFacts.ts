import type { AdminEruv } from '@/lib/eruvStore'
import { websiteWatchOf } from '@/lib/eruvJob'
import type { ReadFromProps } from './ReadFrom'
import type { Jobs } from './useWatchJobs'

// What an eruv's Read from box says (ReadFrom.tsx), from the jobs the
// Places listing already has.

type Facts = Pick<ReadFromProps, 'facts' | 'read' | 'google'>


export function eruvReadFrom(eruv: AdminEruv, jobs: Jobs): Facts {
  const watch = websiteWatchOf(eruv, jobs.eruvim?.watches ?? [])
  return {
    facts: {
      kind: 'eruv',
      website: eruv.website,
      site: watch ? { ok: !watch.lastError } : null,
      emails: eruv.statusEmail ? [{ sender: eruv.statusEmail, at: eruv.statusEmailKept?.sentAt ?? null }] : [],
      statusPage: eruv.statusUrl,
      lists: [],
      refuah: false,
    },
    read: eruv.website ? { job: 'eruv-site', id: eruv.id } : null,
    google: null,
  }
}
