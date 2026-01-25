// apps/desktop/src/main/ipc/parseDiscountText.js
// FINAL — AUTHORITATIVE (FIXED)

import { runDeepSeek } from "../ingestion/deepseekService.js";

let LAST_PARSED_DISCOUNTS = [];

/**
 * Normalize DeepSeek price semantics
 * - "2 for" → quantity = 2, unit = "pcs"
 * - Prevents "for" from ever being treated as a unit
 */
function normalizePricing(item) {
  let quantity = item.quantity ?? null;
  let unit = item.unit ?? "";
  let salePrice = item.sale_price ?? "";

  // Detect "2 for", "3for", etc
  if (typeof unit === "string") {
    const m = unit.toLowerCase().match(/^(\d+)\s*for$|^(\d+)for$/);
    if (m) {
      quantity = m[1] || m[2];
      unit = "pcs";
    }
  }

  return {
    ...item,
    quantity,
    unit,
    sale_price: salePrice
  };
}

function buildPriceDisplay(item) {
  const price = String(item.sale_price).replace(/[^0-9.]/g, "");

  if (item.quantity && price) {
    return `${item.quantity} FOR $${price}`;
  }

  if (price) {
    const unit = item.unit ? `/${item.unit}` : "";
    return `$${price}${unit}`;
  }

  return "";
}

export async function parseDiscountText(_event, rawText) {
  console.log("[parseDiscountText] rawText =", rawText);

  const input = typeof rawText === "string" ? rawText.trim() : "";
  if (!input) {
    throw new Error("parseDiscountText received empty input");
  }

  const result = await runDeepSeek({
    raw_ocr_text: input,
    image_path: null
  });

  console.log(
    "[parseDiscountText] deepseek result =",
    JSON.stringify(result, null, 2)
  );

  const rows = Array.isArray(result?.items)
    ? result.items
    : Array.isArray(result)
    ? result
    : [];

  const items = rows.map(rawItem => {
    const item = normalizePricing(rawItem);

    return {
      en: item.english_name ?? "",
      zh: item.chinese_name ?? "",
      size: item.size ?? "",
      salePrice: item.sale_price ?? "",
      regularPrice: item.regular_price ?? "",
      unit: item.unit ?? "",
      quantity: item.quantity ?? null,
      price: {
        display: buildPriceDisplay(item)
      }
    };
  });

  console.log("[parseDiscountText] parsed items =", items);

  LAST_PARSED_DISCOUNTS = items;
  return items;
}

// 🔑 FETCH CACHED DISCOUNTS
export function getLastParsedDiscounts() {
  return LAST_PARSED_DISCOUNTS;
}
