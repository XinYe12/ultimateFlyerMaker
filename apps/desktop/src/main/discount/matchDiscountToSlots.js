// apps/desktop/src/main/discount/matchDiscountToSlots.js

function norm(s) {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[’'"]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normZh(s) {
  return (s ?? "")
    .toString()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\u4e00-\u9fff0-9a-zA-Z]+/g, "")
    .trim();
}

function normalizeSize(s) {
  const t = norm(s);
  if (!t) return "";

  let m = t.match(/^(\d+)\s*[x*]\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|oz)\b$/i);
  if (m) return `${m[1]}x${m[2]}${m[3].toLowerCase()}`;

  m = t.match(/^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|oz)\s*[*x]\s*(\d+)\b$/i);
  if (m) return `${m[3]}x${m[1]}${m[2].toLowerCase()}`;

  m = t.match(/^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|oz)\s*-\s*(\d+(?:\.\d+)?)\s*\2\b$/i);
  if (m) return `${m[1]}${m[2].toLowerCase()}-${m[3]}${m[2].toLowerCase()}`;

  m = t.match(/^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|oz)\b$/i);
  if (m) return `${m[1]}${m[2].toLowerCase()}`;

  return "";
}

function tokens(s) {
  const t = norm(s);
  return t ? t.split(" ").filter(Boolean) : [];
}

function charBigrams(s) {
  const t = norm(s).replace(/\s+/g, "");
  if (t.length < 2) return t ? [t] : [];
  const out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function sizeCompatible(a, b) {
  const A = normalizeSize(a);
  const B = normalizeSize(b);
  if (!A || !B) return true;
  return A === B;
}

function buildRowKey(row) {
  return `${norm(row.en)} ${normZh(row.zh)} ${normalizeSize(row.size)}`.trim();
}

function buildSlotKey(slot) {
  const ocrTexts = slot.ocr?.[0]?.rec_texts ?? [];
  return norm(ocrTexts.join(" "));
}


function score(slot, row) {
  const sk = buildSlotKey(slot);
  const rk = buildRowKey(row);
  return (
    0.75 * jaccard(tokens(sk), tokens(rk)) +
    0.25 * jaccard(charBigrams(sk), charBigrams(rk))
  );
}

/**
 * slots: ingest results (images)
 * discountRows: parsed discounts
 * RETURNS: slots[] with `discount` attached
 */
export function matchDiscountToSlots(
  { images: slots, discounts: discountRows },
  opts = {}
) {
  const threshold =
    typeof opts.threshold === "number" ? opts.threshold : 0.35;

  const rows = (discountRows ?? []).map((r, i) => ({
    ...r,
    id: r.id ?? `row_${i + 1}`
  }));

  const used = new Set();

  return (slots ?? []).map(slot => {
    let best = null;

    for (const row of rows) {
      if (used.has(row.id)) continue;

      const s = score(slot, row);
      if (!best || s > best.score) {
        best = { row, score: s };
      }
    }

    if (best) {
      used.add(best.row.id);

      return {
        ...slot,
        discount: best.row,
        matchScore: best.score,
        matchConfidence:
          best.score >= threshold ? "high" : "low"
      };
    }

    // no discount rows at all
    return {
      ...slot,
      discount: null,
      matchScore: 0,
      matchConfidence: "none"
    };
  });
}
