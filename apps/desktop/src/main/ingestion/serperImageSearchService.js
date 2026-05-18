// apps/desktop/src/main/ingestion/serperImageSearchService.js
// Serper.dev Google Image Search — same output shape as braveImageSearchByQuery

import fetch from "node-fetch";
import { scoreResult } from "./braveSearchService.js";

export function serperKeysPresent() {
  return !!process.env.SERPER_API_KEY;
}

const SERPER_POST_TIMEOUT_MS = 14_000;
const SERPER_MAX_ATTEMPTS = 3;

function isTransientSerperError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const name = String(err?.name || "");
  return (
    name === "AbortError" ||
    msg.includes("aborted") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("socket") ||
    msg.includes("tls") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("econnrefused") ||
    msg.includes("eai_again")
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeSerperResults(data, limit) {
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
}

async function serperFetchOnce(query, limit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERPER_POST_TIMEOUT_MS);
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
      const err = new Error(`HTTP ${res.status}`);
      err._serperHttpStatus = res.status;
      throw err;
    }

    const data = await res.json();
    return normalizeSerperResults(data, limit);
  } finally {
    clearTimeout(timeout);
  }
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

  let lastErr = null;
  for (let attempt = 1; attempt <= SERPER_MAX_ATTEMPTS; attempt++) {
    try {
      return await serperFetchOnce(query, limit);
    } catch (err) {
      lastErr = err;
      const status = err?._serperHttpStatus;
      if (status != null && status >= 400 && status < 500) {
        console.warn(`[serperImageSearch] HTTP ${status} — not retrying`);
        return [];
      }
      if (status != null && status >= 500) {
        if (attempt < SERPER_MAX_ATTEMPTS) {
          const backoff = 400 + attempt * 250;
          console.warn(`[serperImageSearch] HTTP ${status} — retry in ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
      }
      if (!isTransientSerperError(err)) {
        console.warn("[serperImageSearch] failed:", err.message);
        return [];
      }
      if (attempt < SERPER_MAX_ATTEMPTS) {
        const backoff = 400 + attempt * 250;
        console.warn(`[serperImageSearch] attempt ${attempt} failed (${err.message}) — retry in ${backoff}ms`);
        await sleep(backoff);
      }
    }
  }
  console.warn("[serperImageSearch] failed after retries:", lastErr?.message);
  return [];
}
