// Each watch job's own read: its route and query. The admin reads them all
// in one request (api/admin/watches/jobs runs these routes side by side on
// the server); this is the one list both ends use.
export const JOB_READS = {
  categories: '/api/admin/categories',
  dishes: '/api/admin/main-dishes',
  hospitals: '/api/admin/watches/hospitals?counts',
  hours: '/api/admin/watches/hours?counts',
  times: '/api/admin/watches/hours?counts&job=times',
  sites: '/api/admin/watches/sites',
  eruvim: '/api/admin/watches/eruv',
  kosher: '/api/admin/watches/kosher',
  google: '/api/admin/watches/google',
  links: '/api/admin/watches/links',
  runs: '/api/admin/watches/runs',
  places: '/api/admin/listings',
  lookAgain: '/api/admin/watches/look-again',
} as const

export type JobKey = keyof typeof JOB_READS
