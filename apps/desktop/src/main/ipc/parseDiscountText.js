// apps/desktop/src/main/ipc/parseDiscountText.js
// FINAL — AUTHORITATIVE

import { runDeepSeek } from "../ingestion/deepseekService.js";


let LAST_PARSED_DISCOUNTS = [];

function buildPriceDisplay(item) {
  if (item.quantity && item.sale_price) {
    return `${item.quantity} FOR $${String(item.sale_price).replace(/[^0-9.]/g, "")}`;
  }

  if (item.sale_price) {
    const price = String(item.sale_price).replace(/[^0-9.]/g, "");
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

  const items = rows.map(item => ({
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
  }));

  console.log("[parseDiscountText] parsed items =", items);

  LAST_PARSED_DISCOUNTS = items;
  return items;
}


// 🔑 FETCH CACHED DISCOUNTS
export function getLastParsedDiscounts() {
  return LAST_PARSED_DISCOUNTS;
}
