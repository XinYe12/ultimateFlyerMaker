import { sizeFromImage } from '../../../../shared/flyer/layout/sizeFromImage'
import type { IngestItem } from '../types'

export function buildEditorFlyerItems(items: IngestItem[]) {
  return items
    .map((item) => {
      const image = item.result?.cutoutPath
      if (!image) return null

      const size = sizeFromImage(image)

      return {
        id: item.id,
        width: size.width,
        height: size.height,
        image,
        title: item.result?.title,
        price: item.result?.discount,
        discount: item.result?.discount,
        matchConfidence: item.result?.title?.confidence,
      }
    })
    .filter(Boolean)
}
