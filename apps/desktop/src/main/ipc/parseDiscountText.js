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
export function normalizePricing(item) {
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

/**
 * Detect if a product name indicates multiple flavors/variants (series).
 * Strong keywords always trigger series; "flavor(s)"/"variety(ies)" only trigger
 * when preceded by an explicit number (e.g. "4 Flavors") to avoid false positives
 * on names like "Original Flavor" or "Grape Flavour Juice".
 */
function detectSeries(en, zh) {
  const combined = `${(en || "").toLowerCase()} ${(zh || "")}`;

  // Always-series keywords — reliably mean a product line or assorted pack
  const strongKeywords = ["series", "assorted", "多种", "系列", "什锦", "混合"];
  const hasStrong = strongKeywords.some(kw => combined.includes(kw));

  // Conditional: "flavor(s)" / "variety(ies)" only count when a digit precedes them
  const hasNumberedFlavor = /\d+\s*(?:flavor|flavours?|flavors|variety|varieties)/i.test(combined);

  if (!hasStrong && !hasNumberedFlavor) return { isSeries: false, flavorCount: 1 };

  // Extract explicit count from patterns like "6 flavors", "4 varieties", "4种"
  const numMatch = combined.match(/(\d+)\s*(?:flavor|flavours?|variety|varieties|种|个|pack|pc)/i);
  const n = numMatch ? Math.min(12, Math.max(2, parseInt(numMatch[1], 10))) : 6;
  return { isSeries: true, flavorCount: n };
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
    const en = item.english_name ?? "";
    const zh = (item.chinese_name ?? "").toString();
    const { isSeries, flavorCount } = detectSeries(en, zh);

    return {
      en,
      zh,
      size: (item.size ?? "").toString().trim(),
      salePrice: item.sale_price ?? "",
      regularPrice: item.regular_price ?? "",
      unit: item.unit ?? "",
      quantity: item.quantity ?? null,
      isSeries,
      flavorCount,
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
