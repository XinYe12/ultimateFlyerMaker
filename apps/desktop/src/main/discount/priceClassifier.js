/**
 * classifyPrice
 * Input examples:
 *  - "10.99"
 *  - "10.99/ea"
 *  - "2.58/lb"
 *  - "15.88/case"
 *  - "10.99/8pcs"
 *
 * Output:
 * {
 *   price: "10.99",
 *   unit: "ea" | "lb" | "case" | "" | "pcs",
 *   type: "SINGLE" | "MULTI",
 *   qty?: "8"
 * }
 */
/**
 * classifyPrice
 *
 * MULTI-BUY patterns supported:
 *  - price / qty        → 8.99/8pcs
 *  - qty / price        → 2/2.99
 *  - qty for price      → 3 for 3.99
 *  - qty/price + unit   → 5/2ea
 *
 * SINGLE patterns:
 *  - 10.99
 *  - 10.99/order
 *  - 2.58/lb
 */

export function classifyPrice(raw, context = "") {  
  if (!raw || typeof raw !== "string") return null;
   const combined = `${raw} ${context}`
    .trim()
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/\s+/g, " ");

  const text = raw
    .trim()
    .toLowerCase()
    .replace(/^\$/, "");

  // --------------------------------------------------
  // MULTI ① price / qty  → 8.99/8pcs
  // --------------------------------------------------
  let m = text.match(
    /^(\d+\.\d{2})\s*\/\s*(\d+)\s*(pcs|pc|pieces)?$/
  );
  if (m) {
    return {
      type: "MULTI",
      price: m[1],
      qty: `${m[1]}pcs`
    };
  }

  // --------------------------------------------------
  // MULTI ② qty / price  → 2/2.99
  // --------------------------------------------------
  m = text.match(
    /^(\d+)\s*\/\s*(\d+\.\d{2})$/
  );
  if (m) {
    return {
      type: "MULTI",
      price: m[2],
      qty: m[1],
      unit: "pcs"
    };
  }
  // --------------------------------------------------
// MULTI ③a split tokens → 3.99 + 2 for
// --------------------------------------------------
m = combined.match(
  /^(\d+\.\d{2})\s*(\d+)\s*for$|^(\d+)\s*for\s*(\d+\.\d{2})$/
);
if (m) {
  const price = m[1] || m[4];
  const qty = m[2] || m[3];

  return {
    type: "MULTI",
    price,
    qty,
    unit: "pcs"
  };
}


  // --------------------------------------------------
  // MULTI ③ qty for price → 3 for 3.99
  // --------------------------------------------------
  m = text.match(
    /^(\d+)\s*for\s*\$?(\d+\.\d{2})$/
  );
  if (m) {
    return {
      type: "MULTI",
      price: m[2],
      qty: m[1],
      unit: "pcs"
    };
  }

  // --------------------------------------------------
  // MULTI ④ qty / price + unit → 5/2ea
  // --------------------------------------------------
  m = text.match(
    /^(\d+)\s*\/\s*(\d+\.\d{1,2})\s*(ea|each|pcs|pc)?$/
  );
  if (m) {
    return {
      type: "MULTI",
      price: Number(m[2]).toFixed(2),
      qty: m[1],
      unit: "pcs"
    };
  }

  // --------------------------------------------------
  // SINGLE price (with optional unit)
  // --------------------------------------------------
  m = text.match(
    /^(\d+\.\d{2})(?:\s*\/\s*([a-z]+))?$/
  );
  if (!m) return null;

  const price = m[1];
  const rawUnit = m[2] || "";

  const UNIT_MAP = {
    ea: "ea",
    each: "ea",
    order: "order",
    lb: "lb",
    lbs: "lb",
    pound: "lb",
    case: "case",
    box: "box",
    pack: "pack",
    pkg: "pack",
    pcs:"pcs",
    pieces: "pcs"
  };

  return {
    type: "SINGLE",
    price,
    unit: UNIT_MAP[rawUnit] || ""
  };
}
