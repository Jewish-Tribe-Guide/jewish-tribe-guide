/** The blue dot on You: a saved place changed since You was last opened
 *  (board PhoneYouDot, Nov 15). Says so to a screen reader too. */
export function YouDot({ className = '' }: { className?: string }) {
  return (
    <span data-testid="you-dot" className={`absolute h-[11px] w-[11px] rounded-full bg-primary ring-[2.5px] ring-white ${className}`}>
      <span className="sr-only">, a saved place changed</span>
    </span>
  )
}
