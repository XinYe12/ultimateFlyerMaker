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

// Columns 6–12 map Mon–Sun. Truthy values: Y, yes, x, ✓, 1, true (case-insensitive).
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function isDayChecked(val) {
  if (val === true) return true;   // boolean TRUE written by a Form Control checkbox
  if (!val && val !== 1) return false;
  const s = String(val).trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1" || s === "✓" || s === "x";
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
export function buildPriceDisplay(item) {
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
  cosmetics: ["cosmetics", "beauty", "personal care"],
};

/* -------------------- sale field parser -------------------- */

/**
 * Extracts quantity and price directly from the sale column without LLM.
 * Handles: "2/4.99", "2/$4.99", "3 FOR $5.99", "3for5.99", "$2.99", "2.99"
 */
export function parseSaleField(sale) {
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
  const knownAliases = DEPARTMENT_ALIASES[departmentId];
  const aliases = knownAliases ?? [departmentId.toLowerCase()];

  return sections.find((s) => {
    if (!s.header) return false;
    return aliases.some((alias) => s.header.includes(alias));
  }) || null;
}

/* -------------------- direct row → items -------------------- */

/** Return true only if the price string (after stripping) looks like a real decimal number. */
function isValidPriceString(s) {
  return typeof s === "string" && /^\d+(\.\d+)?$/.test(s) && s !== "";
}

/** Convert spreadsheet rows directly to normalized discount items (no LLM). */
function rowsToItems(rows) {
  return rows
    .filter(row => {
      if (!Array.isArray(row)) return false;
      // Quick pre-check: col[4] must contain at least one digit
      if (!/\d/.test(String(row[4] || ""))) return false;
      // Full validation: parseSaleField must produce a clean numeric price
      const { salePrice } = parseSaleField(row[4]);
      return isValidPriceString(salePrice);
    })
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

      const days = DAY_KEYS.filter((_, i) => isDayChecked(row[6 + i]));

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
        days: days.length > 0 ? days : undefined,
      };
    });
}

/* -------------------- multi-sheet helpers -------------------- */

/**
 * Map a sheet tab name to a DepartmentId using DEPARTMENT_ALIASES.
 * Returns the matching departmentId or null.
 */
function sheetNameToDeptId(name) {
  const lower = String(name || "").toLowerCase();
  for (const [deptId, aliases] of Object.entries(DEPARTMENT_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) return deptId;
  }
  return null;
}

/** Read a named sheet from workbook and return its rows. */
function sheetToRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

/* -------------------- IPC handlers -------------------- */

/**
 * Parse ALL departments from an xlsx file.
 * Multi-sheet: each sheet tab is treated as a department.
 * Single-sheet: existing behaviour (split by in-row department headers).
 * Returns { [departmentId]: ParsedDiscount[] } for every department that has ≥1 item.
 */
export async function parseAllDepartmentsXlsx(_event, filePath) {
  const path = typeof filePath === "string" ? filePath.trim() : "";
  if (!path) throw new Error("parseAllDepartmentsXlsx received empty file path");

  const workbook = XLSX.readFile(path);
  const result = {};

  if (workbook.SheetNames.length > 1) {
    // Multi-sheet mode: each sheet tab = one department
    for (const sheetName of workbook.SheetNames) {
      const deptId = sheetNameToDeptId(sheetName);
      if (!deptId) {
        console.log(`[parseAllDepartmentsXlsx] Skipping unrecognized sheet "${sheetName}"`);
        continue;
      }
      const items = rowsToItems(sheetToRows(workbook, sheetName));
      if (items.length > 0) {
        result[deptId] = items;
        console.log(`[parseAllDepartmentsXlsx] Sheet "${sheetName}" → dept "${deptId}" (${items.length} items)`);
      }
    }
  } else {
    // Single-sheet mode: split by in-row department headers
    const allRows = sheetToRows(workbook, workbook.SheetNames[0]);
    const sections = splitByDepartment(allRows);

    for (const deptId of Object.keys(DEPARTMENT_ALIASES)) {
      const match = findMatchingSection(sections, deptId);
      if (!match) continue;
      const items = rowsToItems(match.rows);
      if (items.length > 0) {
        result[deptId] = items;
      }
    }
  }

  if (Object.keys(result).length === 0) {
    throw new Error("No recognized department sections found in the file");
  }

  return result;
}

export async function parseDiscountXlsx(_event, filePath, department) {
  const path = typeof filePath === "string" ? filePath.trim() : "";
  if (!path) throw new Error("parseDiscountXlsx received empty file path");

  const workbook = XLSX.readFile(path);

  let rows;

  if (workbook.SheetNames.length > 1) {
    // Multi-sheet mode
    if (department) {
      const deptAliases = DEPARTMENT_ALIASES[department] ?? [department.toLowerCase()];
      const matchingSheet = workbook.SheetNames.find(
        (n) => deptAliases.some((alias) => n.toLowerCase().includes(alias))
      );
      if (matchingSheet) {
        console.log(`[parseDiscountXlsx] Multi-sheet: matched dept "${department}" → sheet "${matchingSheet}"`);
        rows = sheetToRows(workbook, matchingSheet);
      } else {
        console.warn(`[parseDiscountXlsx] Multi-sheet: dept "${department}" not found — concatenating all sheets`);
        rows = workbook.SheetNames.flatMap((n) => sheetToRows(workbook, n));
      }
    } else {
      // No department hint: concatenate all sheets
      rows = workbook.SheetNames.flatMap((n) => sheetToRows(workbook, n));
    }
  } else {
    // Single-sheet mode (existing behaviour)
    const allRows = sheetToRows(workbook, workbook.SheetNames[0]);
    if (department) {
      const sections = splitByDepartment(allRows);
      const match = findMatchingSection(sections, department);
      if (match) {
        console.log(`[parseDiscountXlsx] Matched department "${department}" → header "${match.header}" (${match.rows.length} rows)`);
        rows = match.rows;
      } else {
        console.warn(`[parseDiscountXlsx] Department "${department}" not found in xlsx — using all rows`);
        rows = allRows;
      }
    } else {
      rows = allRows;
    }
  }

  const items = rowsToItems(rows);
  if (!items.length) throw new Error("XLSX contained no valid discount rows");
  return items;
}
