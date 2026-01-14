// apps/desktop/src/main/ingestion/braveSearchService.js

import fetch from "node-fetch";

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

function buildQueryFromOCR(ocr) {
  if (!ocr) return "";
  if (typeof ocr === "string") return ocr;
  return ocr.text || "";
}

async function searchBrave(query, limit = 5) {
  if (!BRAVE_API_KEY) return [];
  if (!query || !query.trim()) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000); // ⏱️ 8s max

  try {
    const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=${limit}`;

    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": BRAVE_API_KEY,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) return [];

    const data = await res.json();
    const raw = data?.web?.results || [];

    return raw.slice(0, limit).map((r) => ({
      title: r.title || "",
      url: r.url || "",
      description: r.description || "",
    }));
  } catch (err) {
    console.warn("⚠️ Brave search failed — continuing without it");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function braveImageSearch(imagePath, ocr, limit = 5) {
  const query = buildQueryFromOCR(ocr);
  return searchBrave(query, limit);
}
