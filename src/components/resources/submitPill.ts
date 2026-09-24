/** The one button that sends what you've written, floating under the
 *  desktop dialog or ending the content on a phone: the editor's
 *  "Send N changes" and a removal request's confirm. Shared so the two
 *  can't drift. Removal is primary blue like Send, not red: red is for
 *  something destroyed on the spot, and this is a request a moderator
 *  reviews before anything changes. */
export const SUBMIT_PILL =
  'w-full cursor-pointer rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none'
