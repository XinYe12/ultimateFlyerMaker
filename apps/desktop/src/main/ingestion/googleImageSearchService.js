// apps/desktop/src/main/ingestion/googleImageSearchService.js
// Google Custom Search API — image search.
// Requires GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID in .env.
//
// Setup (one-time):
//   1. https://console.cloud.google.com → create/select project
//      → APIs & Services → Enable "Custom Search API"
//      → Credentials → Create API Key  → paste as GOOGLE_CSE_API_KEY
//   2. https://programmablesearchengine.google.com → Create Search Engine
//      → "Search the entire web" ON, SafeSearch OFF (optional)
//      → Copy the "Search engine ID" → paste as GOOGLE_CSE_ID
//   Free tier: 100 queries/day. Paid: $5 / 1000 queries.

import fetch from "node-fetch";
import { scoreResult } from "./braveSearchService.js";

const GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

export function googleKeysPresent() {
  return !!(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID);
}

/**
 * Search Google Images via Custom Search API.
 * Returns same shape as braveImageSearchByQuery: [{ title, url, thumbnail }]
 */
export async function googleImageSearch(query, limit = 6) {
  if (!googleKeysPresent()) return null; // null = "not configured", distinct from []

  const fetchCount = Math.min(limit * 2, 10); // Google CSE max per request is 10

  const params = new URLSearchParams({
    key: process.env.GOOGLE_CSE_API_KEY,
    cx:  process.env.GOOGLE_CSE_ID,
    q:   query,
    searchType: "image",
    num: String(fetchCount),
    safe: "off",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${GOOGLE_ENDPOINT}?${params}`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.warn(`[googleImageSearch] HTTP ${res.status}: ${body}`);
      return null;
    }

    const data = await res.json();
    const items = data?.items || [];

    const mapped = items.map((item) => ({
      title:     item.title || "",
      url:       item.link || "",
      thumbnail: item.image?.thumbnailLink || item.link || "",
    }));

    // Same priority sort as Brave: supermarkets first, recipe/stock/social last.
    const scored = mapped
      .filter((r) => r.url)
      .map((r) => ({ ...r, _score: scoreResult(r.url) }))
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...r }) => r);

    return scored.slice(0, limit);
  } catch (err) {
    console.warn("[googleImageSearch] request failed:", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
