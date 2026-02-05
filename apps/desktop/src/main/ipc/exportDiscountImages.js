import path from "path";
import fs from "fs";
import { app } from "electron";
import { renderTitleImage } from "../render/renderTitleImage.js";
import { renderPriceImage } from "../render/renderPriceImage.js";

function pickTitleData(item) {
  const d = item?.result?.discount;

  // 1) parsed discount item shape
  if (d && typeof d.en === "string" && d.en.trim()) {
    return { en: d.en.trim(), zh: (typeof d.zh === "string" ? d.zh : "").trim() };
  }

  // 2) DiscountMatch shape
  if (d?.title?.en && typeof d.title.en === "string" && d.title.en.trim()) {
    return { en: d.title.en.trim(), zh: (typeof d.title?.zh === "string" ? d.title.zh : "").trim() };
  }

  // 3) fallback to OCR/LLM title
  const t = item?.result?.title;
  if (t?.en && typeof t.en === "string" && t.en.trim()) {
    return { en: t.en.trim(), zh: (typeof t.zh === "string" ? t.zh : "").trim() };
  }

  // 4) Chinese-only fallback
  const zh = (typeof d?.zh === "string" ? d.zh : "") || (typeof t?.zh === "string" ? t.zh : "");
  if (zh.trim()) {
    return { en: "", zh: zh.trim() };
  }

  return { en: "", zh: "" };
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

  // 3) fallback to llmResult from ingestion (each image already has price from DeepSeek)
  const llmItem = item?.result?.llmResult?.items?.[0];
  if (llmItem?.sale_price) {
    const rawPrice = String(llmItem.sale_price).replace(/[^0-9.]/g, "");
    if (rawPrice) {
      const qty = Number(llmItem.quantity);
      return {
        after: (qty > 1) ? `${qty} FOR $${rawPrice}` : `$${rawPrice}`,
        before: llmItem.regular_price ? `$${String(llmItem.regular_price).replace(/[^0-9.]/g, "")}` : "",
        unit: llmItem.unit ? String(llmItem.unit).trim().toLowerCase() : "",
      };
    }
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

    // ---------- TITLE (USER DISCOUNT > MATCH > OCR > ZH FALLBACK) ----------
    const titleData = pickTitleData(item);
    const titleText = titleData.en || titleData.zh; // at least one must be non-empty to proceed

    let titleImagePath;
    let priceImagePath;

    try {
      if (titleText) {
        titleImagePath = renderTitleImage({
          en: titleData.en,
          zh: titleData.zh,
          size: item.result.discount?.size ?? item.result.title?.size ?? item.result.llmResult?.items?.[0]?.size ?? "",
          outputPath: titlePath,
        });

        // ---------- PRICE (USER DISCOUNT > MATCH > LLM FALLBACK) ----------
        let { after, before, unit } = pickPriceParts(item);

        // Single price with no unit → show /ea on the label
        const isMultiBuy = /^\d+\s+FOR\s+\$/i.test(after) || /^\d+\s+for\s+\$?[\d.]+/i.test(after);
        if (after && !unit && !isMultiBuy) {
          unit = "ea";
        }

        if (after) {
          priceImagePath = renderPriceImage({
            afterPrice: after,
            beforePrice: before,
            priceUnit: unit,
            outputPath: pricePath,
          });
        }
      }
    } catch (err) {
      console.error(`[exportDiscountImages] Failed to render labels for ${item.id}:`, err);
    }

    // Always push one result per item so discountLabels[i] aligns with placement i
    results.push({
      id: item.id,
      titleImagePath,
      priceImagePath,
    });
  }

  return results;
}
