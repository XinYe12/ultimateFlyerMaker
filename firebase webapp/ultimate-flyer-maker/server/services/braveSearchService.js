// apps/desktop/apps/desktop/src/main/ingestion/braveSearchService.js
// ✅ ELECTRON MAIN VERSION — COPY / PASTE AS-IS

import fetch from "node-fetch";

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

/* =========================
   CORE SEARCH
========================= */

async function searchBrave(query, count = 5) {
  if (!BRAVE_API_KEY) return [];
  if (!query || !query.trim()) return [];

  const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=${count}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Subscription-Token": BRAVE_API_KEY,
      Accept: "application/json",
    },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const raw =
    data?.web?.results || data?.results || data?.items || [];

  return raw.slice(0, count).map((item) => ({
    title: item.title || item.name || "",
    url: item.url || item.link || "",
    description: item.description || item.snippet || "",
  }));
}

/* =========================
   QUERY BUILDER
========================= */

function buildQueryFromOCR(ocr) {
  if (!ocr) return "";
  if (typeof ocr === "string") return ocr;

  const parts = [
    ocr.text,
    ocr.title,
    ocr.brand,
    ocr.product,
    ocr.weight,
  ].filter(Boolean);

  return parts.join(" ");
}

/* =========================
   PUBLIC API (USED BY INGESTION)
========================= */

export async function braveImageSearch(imagePath, ocrResult, limit = 5) {
  const query = buildQueryFromOCR(ocrResult);
  if (!query) return [];
  return searchBrave(query, limit);
}
