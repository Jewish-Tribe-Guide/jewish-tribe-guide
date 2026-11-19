'use client'

import ImageUploadField from '@/components/ImageUploadField'
import { withCommunity } from '@/lib/useCommunityData'

// The banner on a computer, the one photo a page has — shared by the full
// category editor and SingletonEditor. The same picker as the Home page's
// photo (the user, Nov 5: "we already have a standard for adding photos"):
// a wide crop, no hint, the address behind "Paste URL". A page can still
// carry an older pasted photo (cardImageUrl), which the banner falls back to
// (bandImageFor), so that's what shows until one is chosen here, and
// choosing or removing one clears it, leaving one photo, not two.
export function CardBandImageField({
  cardBandImageUrl,
  cardImageUrl,
  onChange,
  token,
  community,
  originalSource,
  onOriginalSourceChange,
}: {
  cardBandImageUrl: string
  cardImageUrl: string
  /** The new banner photo, and the older pasted one (always cleared). */
  onChange: (cardBandImageUrl: string, cardImageUrl: string) => void
  token: string
  community: string
  originalSource?: File | string | null
  onOriginalSourceChange?: (source: File | string | null) => void
}) {
  return (
    <ImageUploadField
      value={cardBandImageUrl.trim() || cardImageUrl.trim()}
      onChange={(url) => onChange(url, '')}
      uploadUrl={withCommunity('/api/admin/categories/band', community)}
      token={token}
      shape="square"
      aspect={5}
      showRepositionHint={false}
      collapseUrlInput
      originalSource={originalSource}
      onOriginalSourceChange={onOriginalSourceChange}
    />
  )
}
