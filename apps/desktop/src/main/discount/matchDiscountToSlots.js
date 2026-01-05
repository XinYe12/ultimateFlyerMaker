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
  // keep only CJK + digits/letters
  return (s ?? "")
    .toString()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\u4e00-\u9fff0-9a-zA-Z]+/g, "")
    .trim();
}

function normalizeSize(s) {
  const t = norm(s);
  if (!t) return "";

  // 20g*4 or 4x20g
  let m = t.match(/^(\d+)\s*[x*]\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|oz)\b$/i);
  if (m) return `${m[1]}x${m[2]}${m[3].toLowerCase()}`;

  m = t.match(/^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|oz)\s*[*x]\s*(\d+)\b$/i);
  if (m) return `${m[3]}x${m[1]}${m[2].toLowerCase()}`;

  // range: 261g-300g or 500ml-1l
  m = t.match(/^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|oz)\s*-\s*(\d+(?:\.\d+)?)\s*\2\b$/i);
  if (m) return `${m[1]}${m[2].toLowerCase()}-${m[3]}${m[2].toLowerCase()}`;

  // single: 700g / 1l
  m = t.match(/^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|oz)\b$/i);
  if (m) return `${m[1]}${m[2].toLowerCase()}`;

  return "";
}

function tokens(s) {
  const t = norm(s);
  if (!t) return [];
  return t.split(" ").filter(Boolean);
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
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
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
  const en = norm(row.en);
  const zh = normZh(row.zh);
  const size = normalizeSize(row.size);
  return `${en} ${zh} ${size}`.trim();
}

function buildSlotKey(slot) {
  const meta = slot.meta ?? slot;
  const en = norm(meta.en);
  const zh = normZh(meta.zh);
  const size = normalizeSize(meta.size);
  return `${en} ${zh} ${size}`.trim();
}

function score(slot, row) {
  const slotKey = buildSlotKey(slot);
  const rowKey = buildRowKey(row);

  const wTok = jaccard(tokens(slotKey), tokens(rowKey));
  const wBi = jaccard(charBigrams(slotKey), charBigrams(rowKey));

  // stronger weight on token overlap; bigrams help with minor OCR/spacing noise
  return 0.75 * wTok + 0.25 * wBi;
}

/**
 * slots: [{ slotId?, x,y,width,height,imagePath, meta?:{en?,zh?,size?} }, ...]
 * discountRows: [{ id, en?, zh?, size?, salePrice, ... }, ...]
 */
export function matchDiscountToSlots(slots, discountRows, opts = {}) {
  const threshold = typeof opts.threshold === "number" ? opts.threshold : 0.35;

  const rows = (discountRows ?? []).map((r, i) => ({
    ...r,
    id: r.id ?? `row_${i + 1}`,
  }));

  const usedRows = new Set();
  const matched = [];
  const unmatchedSlots = [];
  const unmatchedDiscounts = [];

  for (let si = 0; si < (slots ?? []).length; si++) {
    const slot = slots[si];
    let best = null;

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (usedRows.has(row.id)) continue;

      if (!sizeCompatible((slot.meta ?? slot).size, row.size)) continue;

      const s = score(slot, row);
      if (!best || s > best.score) best = { row, score: s };
    }

    if (best && best.score >= threshold) {
      usedRows.add(best.row.id);

      matched.push({
        ...slot,
        discount: best.row,
        matchScore: best.score,
      });
    } else {
      unmatchedSlots.push(slot);
    }
  }

  for (const row of rows) {
    if (!usedRows.has(row.id)) unmatchedDiscounts.push(row);
  }

  return { matched, unmatchedSlots, unmatchedDiscounts };
}
