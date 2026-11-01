// Features that are built but held back from the live site (Oct 13): browse,
// contribute and search come first. Nothing is deleted; each switch turns its
// feature back on everywhere it shows. They're switched on, and worked on, on
// redesign/today-home.
//
// Read at render time (features.todayHome), never copied into a module-level
// constant, so a test can turn one on or off.

type Features = {
  /** The home that changes with the day (step 6): its blocks, Pinned on the
   *  home and the Pinned page, and its settings in the admin's Site tab. Off,
   *  every visitor gets the classic home, whatever SiteSettings.homeStyle
   *  says. */
  todayHome: boolean
  /** What changed (step 7a): its page, its admin tab, the link at the foot
   *  of the category list, and the home's read of the activity log. */
  whatChanged: boolean
  /** Site's Forms tab (the user, Oct 31: hidden for now). Its page still
   *  answers at its address, and a form already published stays live. */
  formsTab: boolean
}

export const features: Features = {
  todayHome: false,
  whatChanged: false,
  formsTab: false,
}
