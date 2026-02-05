// apps/desktop/src/main/ipc/parseDiscountText.js
// FINAL — AUTHORITATIVE (FIXED)

import { runDeepSeek } from "../ingestion/deepseekService.js";

let LAST_PARSED_DISCOUNTS = [];

/** Gram-weight range: numbers in this range are product size (e.g. 924g), not multi-buy quantity. */
const WEIGHT_GRAM_MIN = 50;
const WEIGHT_GRAM_MAX = 9999;

function isLikelyWeightGrams(num) {
  return Number.isFinite(num) && num >= WEIGHT_GRAM_MIN && num <= WEIGHT_GRAM_MAX;
}

/**
 * Normalize DeepSeek price semantics:
 * - Weights (e.g. 924, 650g) → move to size, do not use as quantity.
 * - "2 for", "3 for" → quantity = 2 or 3, unit = "pcs".
 */
function normalizePricing(item) {
  let quantity = item.quantity ?? null;
  let unit = (item.unit ?? "").toString().trim().toLowerCase();
  let size = (item.size ?? "").toString().trim();
  let salePrice = item.sale_price ?? "";

  const qNum = quantity != null ? (typeof quantity === "number" ? quantity : parseInt(String(quantity), 10)) : NaN;

  // Unit is "g", "gram", "grams" → quantity is weight, put in size
  if (unit === "g" || unit === "gram" || unit === "grams") {
    if (Number.isFinite(qNum) && qNum > 0) {
      size = size ? `${size} ${qNum}g` : `${qNum}g`;
    }
    quantity = null;
    unit = "";
  }
  // Quantity looks like grams (e.g. 924, 650) → treat as product size, not multi-buy
  else if (Number.isFinite(qNum) && isLikelyWeightGrams(qNum)) {
    size = size ? `${size} ${qNum}g` : `${qNum}g`;
    quantity = null;
    unit = "";
  }
  // "2 for", "3 for" in unit → multi-buy
  else if (unit) {
    const m = unit.match(/^(\d+)\s*for$|^(\d+)for$/);
    if (m) {
      const q = parseInt(m[1] || m[2], 10);
      if (Number.isFinite(q) && q > 0 && !isLikelyWeightGrams(q)) {
        quantity = String(q);
        unit = "pcs";
      } else {
        quantity = null;
        unit = "";
      }
    }
  }

  return {
    ...item,
    size,
    quantity,
    unit,
    sale_price: salePrice,
  };
}

/** Extract numeric price; for "2/4.99" use 4.99 not 24.99. */
function extractPriceForDisplay(salePrice, isMultiBuy) {
  const raw = String(salePrice ?? "").trim();
  if (!raw) return "";
  if (isMultiBuy && raw.includes("/")) {
    const afterSlash = raw.split("/").pop().replace(/[^0-9.]/g, "");
    if (afterSlash) return afterSlash;
  }
  return raw.replace(/[^0-9.]/g, "");
}

function buildPriceDisplay(item) {
  const isMultiBuy = !!item.quantity;
  const price = extractPriceForDisplay(item.sale_price, isMultiBuy);

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
      size: (item.size ?? "").toString().trim(),
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
