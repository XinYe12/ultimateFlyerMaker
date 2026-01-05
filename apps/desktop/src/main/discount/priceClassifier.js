function normalizePrice(p) {
  if (!p) return p;
  if (/^\d+\.\d$/.test(p)) return `${p}0`;
  return p;
}


export function classifyPrice(afterPrice) {
  if (!afterPrice) {
    return { type: "EMPTY", price: "" };
  }

  const raw = String(afterPrice)
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .trim();

    if (raw.includes("/")) {
    const parts = raw.split("/");

    let qty = "";
    let price = "";

    for (const p of parts) {
      if (/^\d+$/.test(p)) {
        qty = p;
      } else if (/^\d+\.\d+$/.test(p) || /^\d+$/.test(p)) {
        price = normalizePrice(p);
      }
    }

    if (qty && price) {
      return {
        type: "MULTI",
        qty,
        price
      };
    }
  }


  // SINGLE PRICE
  return {
    type: "SINGLE",
    price: raw
  };
}
