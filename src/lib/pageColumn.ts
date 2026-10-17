// The column the phone's drill-down text screens sit in — About, Privacy
// (PageDocument) and Feedback (FeedbackScreen). One constant so their white
// boxes come out the same width: Feedback's card used to stop at 448px while
// the pages grew to 672px, which only showed on a phone turned sideways or a
// small tablet, where the three sat side by side in the same back-stack.
export const PAGE_COLUMN = 'mx-auto w-full max-w-2xl px-4 sm:px-6'

// The page title on a desktop, where it sits inside the card: PageDocument's
// h1 and Feedback's, so the three pages' titles match there too.
export const PAGE_TITLE_DESKTOP =
  'desktop:text-[34px] desktop:font-bold desktop:leading-tight desktop:tracking-tight desktop:text-slate-900'
