/// apps/desktop/src/main/ipc/parseDiscountXlsx.js
// XLSX → normalized discount items (no DeepSeek; reads columns directly)
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

/* -------------------- department aliases -------------------- */

const DEPARTMENT_ALIASES = {
  grocery:   ["grocery", "groceries"],
  frozen:    ["frozen"],
  hot_food:  ["hot food", "hotfood", "prepared food"],
  sushi:     ["sushi"],
  meat:      ["meat"],
  seafood:   ["seafood"],
  fruit:     ["fruit"],
  vegetable: ["vegetable", "veggie", "vegetables"],
  hot_sale:  ["hot sale", "hotsale", "special"],
  produce:   ["produce"],
};

/* -------------------- sale field parser -------------------- */

/**
 * Extracts quantity and price directly from the sale column without LLM.
 * Handles: "2/4.99", "2/$4.99", "3 FOR $5.99", "3for5.99", "$2.99", "2.99"
 */
function parseSaleField(sale) {
  const raw = String(sale ?? "").trim();
  // "2/4.99" or "2/$4.99"
  const slashMatch = raw.match(/^(\d+)\s*\/\s*\$?([0-9.]+)/);
  if (slashMatch) return { quantity: parseInt(slashMatch[1], 10), salePrice: slashMatch[2] };
  // "3 FOR $5.99" or "3for5.99"
  const forMatch = raw.match(/^(\d+)\s*for\s*\$?([0-9.]+)/i);
  if (forMatch) return { quantity: parseInt(forMatch[1], 10), salePrice: forMatch[2] };
  // plain "$2.99" or "2.99"
  return { quantity: null, salePrice: raw.replace(/[^0-9.]/g, "") };
}

/* -------------------- department splitting -------------------- */

/**
 * Detect if a row is a department header.
 * Returns the header text (lowercase) or null.
 */
function isDepartmentHeader(row) {
  if (!Array.isArray(row)) return null;
  const text = String(row[0] || row[1] || "").trim();
  if (!text || text.length > 40) return null;
  // Reject pure numeric values (row counters like 1, 2, 3)
  if (/^\d+$/.test(text)) return null;
  // Must have no sale price in col[4]
  const sale = String(row[4] || "").trim();
  if (sale) return null;
  // Must contain at least one letter
  if (!/[a-zA-Z\u4e00-\u9fff]/.test(text)) return null;
  return text.toLowerCase();
}

/**
 * Split rows into sections by department header.
 * Returns [{ header: string|null, rows: [] }, ...]
 */
function splitByDepartment(rows) {
  const sections = [];
  let current = { header: null, rows: [] };

  for (const row of rows) {
    const header = isDepartmentHeader(row);
    if (header) {
      if (current.rows.length > 0 || current.header) {
        sections.push(current);
      }
      current = { header, rows: [] };
    } else {
      current.rows.push(row);
    }
  }

  if (current.rows.length > 0 || current.header) {
    sections.push(current);
  }

  return sections;
}

/**
 * Find a section whose header matches the given departmentId.
 * Returns the matching section or null.
 */
function findMatchingSection(sections, departmentId) {
  const aliases = DEPARTMENT_ALIASES[departmentId];
  if (!aliases) return null;

  return sections.find((s) => {
    if (!s.header) return false;
    return aliases.some((alias) => s.header.includes(alias));
  }) || null;
}

/* -------------------- direct row → items -------------------- */

/** Convert spreadsheet rows directly to normalized discount items (no LLM). */
function rowsToItems(rows) {
  return rows
    .filter(row => Array.isArray(row) && String(row[4] || "").trim())  // must have sale price
    .map(row => {
      const en   = normalizeOptionalString(row[1]);
      const zh   = normalizeOptionalString(row[2]);
      const size = normalizeOptionalString(row[3]);
      const reg  = normalizeOptionalString(row[5]);
      const { quantity: rawQty, salePrice } = parseSaleField(row[4]);
      const { isSeries, flavorCount } = detectSeries(en, zh);

      let quantity = rawQty;
      let unit = "";
      let finalSize = size;

      const qNum = quantity != null ? (typeof quantity === "number" ? quantity : parseInt(String(quantity), 10)) : NaN;

      if (Number.isFinite(qNum) && isLikelyWeightGrams(qNum)) {
        finalSize = finalSize ? `${finalSize} ${qNum}g` : `${qNum}g`;
        quantity = null;
        unit = "";
      }

      return {
        en,
        zh,
        isSeries,
        flavorCount,
        size: finalSize.trim(),
        salePrice,
        regularPrice: reg,
        unit,
        quantity,
        price: { display: buildPriceDisplay({ salePrice, unit, quantity }) },
      };
    });
}

/* -------------------- IPC handler -------------------- */

export async function parseDiscountXlsx(_event, filePath, department) {
  const path = typeof filePath === "string" ? filePath.trim() : "";
  if (!path) throw new Error("parseDiscountXlsx received empty file path");

  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  let rows;
  if (department) {
    const sections = splitByDepartment(allRows);
    const match = findMatchingSection(sections, department);
    if (!match) throw new Error(`${department} department not found in uploaded file`);
    console.log(`[parseDiscountXlsx] Matched department "${department}" → header "${match.header}" (${match.rows.length} rows)`);
    rows = match.rows;
  } else {
    rows = allRows;
  }

  const items = rowsToItems(rows);
  if (!items.length) throw new Error("XLSX contained no valid discount rows");
  return items;
}
