// The column the phone's drill-down text screens sit in — About, Privacy
// (AboutDocument, PrivacyDocument) and Feedback (FeedbackScreen). One constant so their white
// boxes come out the same width: Feedback's card used to stop at 448px while
// the pages grew to 672px, which only showed on a phone turned sideways or a
// small tablet, where the three sat side by side in the same back-stack.
export const PAGE_COLUMN = 'mx-auto w-full max-w-2xl px-4 sm:px-6'

// The white box About, Privacy and Feedback are built of (boards About v2,
// Privacy and terms, Feedback; Nov 15).
export const PAGE_BOX = 'rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.05)]'
