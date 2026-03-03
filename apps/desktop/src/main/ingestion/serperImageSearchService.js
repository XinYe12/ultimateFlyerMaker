// apps/desktop/src/main/ingestion/serperImageSearchService.js
// Serper.dev Google Image Search — same output shape as braveImageSearchByQuery

import fetch from "node-fetch";
import { scoreResult } from "./braveSearchService.js";

export function serperKeysPresent() {
  return !!process.env.SERPER_API_KEY;
}

/**
 * Search Google Images via Serper.dev API.
 * Returns up to `limit` results with { title, url, thumbnail }.
 * Prioritises supermarket domains (via scoreResult), deprioritises recipe/stock sites.
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<{ title: string; url: string; thumbnail: string }>>}
 */
export async function serperImageSearch(query, limit = 6) {
  if (!serperKeysPresent()) return [];
  if (!query?.trim()) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: Math.min(limit * 2, 10) }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[serperImageSearch] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const raw = data?.images || [];

    return raw
      .map((r) => ({
        title: r.title || "",
        url: r.imageUrl || "",
        thumbnail: r.thumbnailUrl || r.imageUrl || "",
      }))
      .filter((r) => r.url)
      .map((r) => ({ ...r, _score: scoreResult(r.url) }))
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...r }) => r)
      .slice(0, limit);
  } catch (err) {
    console.warn("[serperImageSearch] failed:", err.message);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
