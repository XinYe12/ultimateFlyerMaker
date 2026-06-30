/**
 * Canonical sale price formats enforced across all input UIs.
 *
 *   Regular price  :  9.99  or  $9.99
 *   Multi-buy      :  2/5.99   (quantity first, then slash, then price)
 *   Per-unit       :  5.99/ea  (price first, then slash, then unit letters)
 *
 * Legacy "2 FOR $5.99" is still parsed for display but users must re-enter
 * in the canonical multi-buy form (2/5.99) when editing.
 */

// ── Pattern constants ──────────────────────────────────────────────────────

/** Matches integer quantity + slash + decimal price: 2/5.99 or 3/9 */
export const MULTI_BUY_RE = /^(\d+)\s*\/\s*(\d+\.?\d*)$/;

/** Matches decimal price + slash + alphabetic unit: 5.99/ea, $8.99/box */
export const PER_UNIT_RE = /^\$?(\d+\.?\d*)\s*\/\s*([A-Za-z]+)$/;

/** Matches plain price, optionally with leading dollar sign: 9.99, $9.99 */
export const SINGLE_RE = /^\$?(\d+\.?\d*)$/;

// ── Validators ─────────────────────────────────────────────────────────────

/** Returns an error string if the sale price value is non-empty but wrongly formatted, else "". */
export function validateSalePrice(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (MULTI_BUY_RE.test(v) || PER_UNIT_RE.test(v) || SINGLE_RE.test(v)) return "";
  return 'Use: "9.99" (regular), "2/5.99" (multi-buy), or "5.99/ea" (per-unit)';
}

/** Returns whether a sale price string passes format validation. */
export function isSalePriceValid(value: string): boolean {
  return validateSalePrice(value) === "";
}

// ── Hint text ──────────────────────────────────────────────────────────────

export const SALE_PRICE_PLACEHOLDER = "e.g. 9.99  |  2/5.99  |  5.99/ea";

export const SALE_PRICE_FORMAT_HINT =
  "Regular: 9.99 · Multi-buy: 2/5.99 · Per-unit: 5.99/ea";

// ── Parser for render ──────────────────────────────────────────────────────

export type PriceParts =
  | { type: "MULTI"; quantity: string; integer: string; decimal: string; unit: "" }
  | { type: "SINGLE"; quantity: null; integer: string; decimal: string; unit: string };

/**
 * Parse a price display string into render-ready parts.
 * Supports canonical formats (2/5.99, 5.99/ea, 9.99) and legacy "2 FOR $5.99".
 * Returns null if the string cannot be parsed.
 */
export function parsePriceDisplay(display: string): PriceParts | null {
  const s = display.trim();
  if (!s) return null;

  // ── Canonical multi-buy: 2/5.99 ──
  const multiMatch = s.match(MULTI_BUY_RE);
  if (multiMatch) {
    const [intPart, decPart = ""] = multiMatch[2].split(".");
    return { type: "MULTI", quantity: multiMatch[1], integer: intPart, decimal: decPart, unit: "" };
  }

  // ── Canonical per-unit: 5.99/ea or $8.99/box ──
  const unitMatch = s.match(PER_UNIT_RE);
  if (unitMatch) {
    const [intPart, decPart = ""] = unitMatch[1].split(".");
    return { type: "SINGLE", quantity: null, integer: intPart, decimal: decPart, unit: unitMatch[2] };
  }

  // ── Legacy multi-buy: "2 FOR $4.99" ──
  const legacyMultiMatch = s.match(/^(\d+)\s+FOR\s+\$?([\d.]+)/i);
  if (legacyMultiMatch) {
    const [intPart, decPart = ""] = legacyMultiMatch[2].split(".");
    return { type: "MULTI", quantity: legacyMultiMatch[1], integer: intPart, decimal: decPart, unit: "" };
  }

  // ── Plain/dollar price: 9.99 or $9.99 ──
  const singleMatch = s.match(/^\$?([\d.]+)$/);
  if (singleMatch) {
    const [intPart, decPart = ""] = singleMatch[1].split(".");
    return { type: "SINGLE", quantity: null, integer: intPart, decimal: decPart, unit: "" };
  }

  // ── Fallback: legacy "$X.XX/UNIT" or any price-slash-word ──
  const fallbackMatch = s.match(/\$?([\d.]+)(?:\/(\w+))?/);
  if (fallbackMatch) {
    const [intPart, decPart = ""] = fallbackMatch[1].split(".");
    return { type: "SINGLE", quantity: null, integer: intPart, decimal: decPart, unit: fallbackMatch[2] || "" };
  }

  return null;
}
