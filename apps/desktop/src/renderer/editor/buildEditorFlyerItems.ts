import { sizeFromImage } from "@/shared/flyer/layout/sizeFromImage";
import { EditorItem } from "./glueDiscountItems";

export function buildEditorFlyerItems(items: EditorItem[]) {
  return items.map((item) => {
    const size = sizeFromImage(item.image);

    return {
      id: item.id,

      // layout-required
      width: size.width,
      height: size.height,

      // editor data
      image: item.image,
      title: item.title,
      price: item.price,
      discount: item.discount,
      matchConfidence: item.matchConfidence,
    };
  });
}
