import { PlusIcon } from '@/components/icons'

/** The floating "+ Add", bottom right: the site's own one and each category
 *  page's. Apricot, the one colour on the site that means "you can add here"
 *  (drawn Oct 26, boards N and O), so it stands out from the blue of
 *  everything else you tap. A deeper apricot edge holds its shape against
 *  the white rows: 1px on the phone, 1.5px on desktop. Smaller on the phone, now the colour does the work; the word
 *  shows there too. */
export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // "Add", never "Add {category}": an empty category's own button
      // already says that, and both are on screen at once. aria-label wins
      // for the accessible name whatever the visible text grows into.
      aria-label="Add"
      className="fixed right-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+1rem)] desktop:bottom-6 z-40 flex h-12 desktop:h-14 items-center justify-center gap-1.5 desktop:gap-2 rounded-full border desktop:border-[1.5px] border-add-edge bg-add pl-3.5 pr-[1.125rem] desktop:pl-[1.125rem] desktop:pr-[1.375rem] text-ink text-[15px] desktop:text-[17px] font-semibold shadow-[0_4px_12px_rgba(19,36,58,0.14)] desktop:shadow-[0_6px_16px_rgba(19,36,58,0.14)] cursor-pointer active:scale-95 transition-transform"
    >
      <PlusIcon className="h-5 w-5 desktop:h-[22px] desktop:w-[22px] shrink-0" />
      <span className="whitespace-nowrap">Add</span>
    </button>
  )
}
