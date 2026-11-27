import { useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'

// The "+ Add" box (TellUsSheet) on a category page: whether it's open, and
// which listing it's about (moved out of GenericDirectory whole).
export function useTellUs() {
  // "+" opens "Saw something? Tell us" (agreed Oct 5); today's Add form is
  // one tap inside it, "Add a place".
  const [tellOpen, setTellOpen] = useState(false)
  // Kept on the page once opened, so it slides and fades away when closed
  // (SiteAddButton's note).
  const [tellMounted, setTellMounted] = useState(false)
  if (tellOpen && !tellMounted) setTellMounted(true)
  // The listing the box is about, when its Suggest an edit opened it, and
  // what that Suggest an edit opened before: the listing's own editor, in
  // place, for the box's "Edit the details myself" (Oct 6). Without one,
  // the page's own edit (onEdit).
  const [openItem, setOpenItem] = useState<DirectoryResource | null>(null)
  const editYourself = useRef<(() => void) | null>(null)
  const [tellTimes, setTellTimes] = useState(false)
  const [tellMenu, setTellMenu] = useState(false)
  // Add (Nov 27, boards R1-R3b): the box opens on Find the place, already
  // searching for what was typed; null when it was opened about a listing.
  const [findQuery, setFindQuery] = useState<string | null>(null)
  const tellAdd = (query = '') => {
    setOpenItem(null)
    setFindQuery(query)
    setTellOpen(true)
  }
  const tellAbout = (item: DirectoryResource, edit?: () => void, opts?: { times?: boolean; menu?: boolean }) => {
    setFindQuery(null)
    editYourself.current = edit ?? null
    setOpenItem(item)
    setTellTimes(!!opts?.times)
    setTellMenu(!!opts?.menu)
    setTellOpen(true)
  }
  return { tellOpen, setTellOpen, tellMounted, openItem, setOpenItem, editYourself, tellTimes, tellMenu, tellAbout, findQuery, tellAdd }
}
