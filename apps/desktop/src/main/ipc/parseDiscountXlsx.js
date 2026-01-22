/// apps/desktop/src/main/ipc/parseDiscountXlsx.js
// FINAL — AUTHORITATIVE
// XLSX → text → DeepSeek → normalized discount items
// OUTPUT CONTRACT MUST MATCH parseDiscountText

import XLSX from "xlsx";

/* -------------------- helpers -------------------- */

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function buildPriceDisplay(item) {
  // MULTI BUY
  if (item.quantity && item.salePrice) {
    const price = String(item.salePrice).replace(/[^0-9.]/g, "");
    return `${item.quantity} FOR $${price}`;
  }

  // SINGLE
  if (item.salePrice) {
    const price = String(item.salePrice).replace(/[^0-9.]/g, "");
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

  const items = Array.isArray(result) ? result : [result];

  return items.map((item) => ({
    // ---------- TITLES ----------
    en: normalizeOptionalString(item.english_name),
    zh: normalizeOptionalString(item.chinese_name),

    // ---------- SIZE ----------
    size: item.size ?? "",

    // ---------- RAW PRICES ----------
    salePrice: item.sale_price ?? "",
    regularPrice: item.regular_price ?? "",

    // ---------- MULTI / UNIT ----------
    unit: item.unit ?? "",
    quantity: item.quantity ?? null,

    // ---------- DISPLAY (REQUIRED) ----------
    price: {
      display: buildPriceDisplay({
        salePrice: item.sale_price,
        unit: item.unit,
        quantity: item.quantity
      })
    }
  }));
}
