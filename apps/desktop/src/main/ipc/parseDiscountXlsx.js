/// apps/desktop/src/main/ipc/parseDiscountXlsx.js
// FINAL — AUTHORITATIVE
// XLSX → text → DeepSeek → normalized discount items
// OUTPUT CONTRACT MUST MATCH parseDiscountText

import XLSX from "xlsx";

/* -------------------- helpers -------------------- */

const WEIGHT_GRAM_MIN = 50;
const WEIGHT_GRAM_MAX = 9999;

function isLikelyWeightGrams(num) {
  return Number.isFinite(num) && num >= WEIGHT_GRAM_MIN && num <= WEIGHT_GRAM_MAX;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
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

/** Weights (924, 650g) go to size; only real multi-buy counts use "N FOR $price". */
function buildPriceDisplay(item) {
  const isMultiBuy = !!item.quantity;
  const price = extractPriceForDisplay(item.salePrice, isMultiBuy);

  if (item.quantity && price) {
    return `${item.quantity} FOR $${price}`;
  }

  if (price) {
    const unit = item.unit ? `/${item.unit}` : "";
    return `$${price}${unit}`;
  }

  return "";
}

/* -------------------- XLSX → CLEAN TEXT -------------------- */

function xlsxToText(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ""
  });

  const lines = [];
  let n = 1;

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const en = String(row[1] || "").trim();
    const zh = String(row[2] || "").trim();
    const size = String(row[3] || "").trim();
    const sale = String(row[4] || "").trim();
    const reg = String(row[5] || "").trim();

    if (!sale) continue;

    const parts = [];
    if (en) parts.push(`EN:${en}`);
    if (zh) parts.push(`ZH:${zh}`);
    parts.push(sale);
    if (size) parts.push(`SIZE:${size}`);
    if (reg) parts.push(`Was ${reg}`);

    lines.push(`${n}、 ${parts.join(" ")}`);
    n++;
  }

  return lines.join("\n");
}

/* -------------------- IPC handler -------------------- */

export async function parseDiscountXlsx(_event, filePath) {
  const path =
    typeof filePath === "string" ? filePath.trim() : "";

  if (!path) {
    throw new Error("parseDiscountXlsx received empty file path");
  }

  const text = xlsxToText(path);
  if (!text) {
    throw new Error("XLSX contained no valid discount rows");
  }

  // 🔑 reuse DeepSeek via text path
  const { runDeepSeek } = await import("../ingestion/deepseekService.js");

  const result = await runDeepSeek({
    raw_ocr_text: text,
    image_path: null
  });

  const items = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : [];

  return items.map((item) => {
    let quantity = item.quantity ?? null;
    let unit = (item.unit ?? "").toString().trim().toLowerCase();
    let size = (item.size ?? "").toString().trim();

    const qNum = quantity != null ? (typeof quantity === "number" ? quantity : parseInt(String(quantity), 10)) : NaN;

    if (unit === "g" || unit === "gram" || unit === "grams") {
      if (Number.isFinite(qNum) && qNum > 0) {
        size = size ? `${size} ${qNum}g` : `${qNum}g`;
      }
      quantity = null;
      unit = "";
    } else if (Number.isFinite(qNum) && isLikelyWeightGrams(qNum)) {
      size = size ? `${size} ${qNum}g` : `${qNum}g`;
      quantity = null;
      unit = "";
    } else if (unit) {
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
      en: normalizeOptionalString(item.english_name),
      zh: normalizeOptionalString(item.chinese_name),
      size: size.trim(),
      salePrice: item.sale_price ?? "",
      regularPrice: item.regular_price ?? "",
      unit,
      quantity,
      price: {
        display: buildPriceDisplay({
          salePrice: item.sale_price,
          unit,
          quantity,
        }),
      },
    };
  });
}
