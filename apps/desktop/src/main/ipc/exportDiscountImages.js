import path from "path";
import fs from "fs";
import { app } from "electron";
import { renderTitleImage } from "../render/renderTitleImage.js";
import { renderPriceImage } from "../render/renderPriceImage.js";

function pickTitleText(item) {
  // Prefer user discount title if present
  const d = item?.result?.discount;

  // parsed discount item shape
  if (d && typeof d.en === "string" && d.en.trim()) return d.en.trim();

  // DiscountMatch shape
  if (d?.title?.en && typeof d.title.en === "string" && d.title.en.trim())
    return d.title.en.trim();

  // fallback to OCR title
  const t = item?.result?.title?.en;
  if (t && typeof t === "string" && t.trim()) return t.trim();

  return "";
}

function pickPriceParts(item) {
  const d = item?.result?.discount;

  // 1) parsed discount item shape (your parseDiscountText/Xlsx output)
  // d.price.display looks like "$7.99/order" or "2 FOR $5.00"
  if (d?.price?.display && typeof d.price.display === "string" && d.price.display.trim()) {
    return {
      after: d.price.display.trim(),
      before: (d.regularPrice ?? "").toString().trim(),
      unit: (d.unit ?? "").toString().trim(),
    };
  }

  // 2) DiscountMatch shape (after/before/unit)
  if (d?.price?.after && typeof d.price.after === "string" && d.price.after.trim()) {
    return {
      after: d.price.after.trim(),
      before: (d.price.before ?? "").toString().trim(),
      unit: (d.price.unit ?? "").toString().trim(),
    };
  }

  return { after: "", before: "", unit: "" };
}

export async function exportDiscountImages(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const outputDir = path.join(app.getPath("desktop"), "UFM_Discount_Labels");
  fs.mkdirSync(outputDir, { recursive: true });

  const results = [];

  for (const item of items) {
    if (!item || !item.id || !item.result) continue;

    const base = item.id;
    const titlePath = path.join(outputDir, `${base}_title.png`);
    const pricePath = path.join(outputDir, `${base}_price.png`);

    // ---------- TITLE (USER DISCOUNT > MATCH > OCR) ----------
    const titleText = pickTitleText(item);
    if (!titleText) continue;

    const titleImagePath = renderTitleImage({
      en: titleText,
      zh: "", // keep empty unless you later support zh from discount
      size: item.result.title?.size ?? "",
      outputPath: titlePath,
    });

    // ---------- PRICE (USER DISCOUNT > MATCH) ----------
    const { after, before, unit } = pickPriceParts(item);

    let priceImagePath;
    if (after) {
      priceImagePath = renderPriceImage({
        afterPrice: after,
        beforePrice: before,
        priceUnit: unit,
        outputPath: pricePath,
      });
    }

    results.push({
      id: item.id,
      titleImagePath,
      priceImagePath,
    });
  }

  return results;
}
