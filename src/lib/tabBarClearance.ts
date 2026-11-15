// The room a phone screen leaves at its bottom so the fixed tab bar
// (MobileTabBar) doesn't cover its last line: the bar's own height, 58px,
// a little air, and the iPhone's bottom safe area, which the bar pads
// itself by. A flat 96px used to stand in for all three. It fitted an
// app added to the home screen (58 + a 34px safe area), but in Safari,
// whose own toolbar takes the bottom so the safe area is 0, it left a
// 38px gap under the footer (the user, Nov 14).
//
// A plain module, not MobileTabBar's: that one is 'use client', and a
// server component importing a string from it gets a client reference
// instead of the string.
export const TAB_BAR_CLEARANCE = 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]'
