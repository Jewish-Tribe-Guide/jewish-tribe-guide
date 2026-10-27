import { PlusIcon } from '@/components/icons'

/** The floating "+ Add", bottom right: the site's own one and each category
 *  page's. Apricot, the one colour on the site that means "you can add here"
 *  (drawn Oct 26, board K), so it stands out from the blue of everything
 *  else you tap. The word shows on the phone too. */
export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // "Add", never "Add {category}": an empty category's own button
      // already says that, and both are on screen at once. aria-label wins
      // for the accessible name whatever the visible text grows into.
      aria-label="Add"
      className="fixed right-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+1rem)] desktop:bottom-6 z-40 flex h-14 items-center justify-center gap-2 rounded-full bg-add pl-[1.125rem] pr-[1.375rem] text-ink text-[17px] font-semibold shadow-[0_6px_16px_rgba(19,36,58,0.14)] cursor-pointer active:scale-95 transition-transform"
    >
      <PlusIcon className="h-[22px] w-[22px] shrink-0" />
      <span className="whitespace-nowrap">Add</span>
    </button>
  )
}
