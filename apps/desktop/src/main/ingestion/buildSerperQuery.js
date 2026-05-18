// apps/desktop/src/main/ingestion/buildSerperQuery.js
// Constructs an optimised Google Images search query from a grocery discount item.
//
// Problems with the naive `en + zh + size` query:
//  - CJK characters confuse Serper (Google Images is primarily English)
//  - Unit suffixes like "/LB", "/EA" are meaningless to image search
//  - No context -> first result is often a recipe thumbnail, not a product shot

// CJK character detection via code-point ranges (ASCII-safe construction).
// Covers: Symbols/Punctuation 3000-303F, Extension A 3400-4DBF,
//         Unified Ideographs 4E00-9FFF, Compatibility F900-FAFF, Fullwidth FF00-FFEF.
function isCjk(ch) {
  const c = ch.codePointAt(0);
  return (
    (c >= 0x3000 && c <= 0x303f) ||
    (c >= 0x3400 && c <= 0x4dbf) ||
    (c >= 0x4e00 && c <= 0x9fff) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xff00 && c <= 0xffef)
  );
}

function stripCjk(text) {
  return Array.from(text)
    .filter((ch) => !isCjk(ch))
    .join("")
    .trim();
}

// Common grocery quantity/unit tokens that appear as standalone tokens after whitespace or slash.
// Matched as whole tokens so "POUNDS" is not accidentally stripped.
const UNIT_TOKEN_RE =
  /^\/?(?:LB|LBS|OZ|FL\.?OZ|G|GR|KG|ML|L|GAL|QT|PT|EA|PC|PCS|CT|PKG|PKT|BAG|BTL|BT|CAN|BOX|BUNCH|HEAD|PIECE|PIECES|SET|ROLL|SHEET|PAIR|POT|TRAY|EACH)$/i;

function stripUnits(text) {
  return text
    .split(/\s+/)
    .filter((tok) => tok && !UNIT_TOKEN_RE.test(tok))
    .join(" ")
    .trim();
}

/**
 * Build an optimised Serper query from a discount item descriptor.
 *
 * Returns { primary, fallback } where:
 *  - `primary`  -- best query (English name + "grocery store" context)
 *  - `fallback` -- simpler query tried if primary returns zero results
 *
 * @param {{ en?: string; zh?: string; size?: string }} di
 */
export function buildSerperQuery(di) {
  // Clean the English name: remove CJK characters that sometimes bleed in,
  // and remove unit suffixes that are noise for image search.
  const enClean = stripUnits(stripCjk(di.en || ""));

  // If no English name, fall back to a stripped version of the Chinese name
  const base = enClean || stripCjk(di.zh || "");

  const primary = base ? `${base} grocery store` : "";
  const fallback = base; // simpler retry without context suffix

  return { primary: primary.trim(), fallback: fallback.trim() };
}
