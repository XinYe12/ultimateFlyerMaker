// apps/desktop/src/main/ingestion/braveSearchService.js

import fetch from "node-fetch";

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_WEB_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_IMAGE_ENDPOINT = "https://api.search.brave.com/res/v1/images/search";

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
    const url = `${BRAVE_WEB_ENDPOINT}?q=${encodeURIComponent(query)}&count=${limit}`;

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

// Generic text-based search (used elsewhere if needed)
export async function braveTextSearch(query, limit = 5) {
  return searchBrave(query, limit);
}

// Asian grocery + general supermarket domains — results from these float to the top.
const PREFERRED_DOMAINS = [
  // Asian specialty grocery
  "99ranch.com", "hmart.com", "tnt-supermarket.com", "seafoodcity.com",
  "mitsuwa.com", "marukai.com", "nijiya.com", "koamart.com",
  "sayweee.com", "weee.com", "umamicart.com", "asianfoodgrocer.com",
  "theAsianmall.com", "eastwestmarket.com", "sunlon.com",
  // General grocery / big-box retailers that carry Asian products
  "walmart.com", "target.com", "costco.com", "wholefoodsmarket.com",
  "kroger.com", "safeway.com", "albertsons.com", "publix.com",
  "instacart.com", "freshdirect.com", "amazon.com", "shop.ca",
  // Food product / brand sites
  "goldenboyfood.com", "kikkoman.com", "lkk.com", "ottogi.com",
];

// Domains that yield recipe/editorial/stock content rather than product images.
// These are deprioritised (sorted last) but NOT removed — they serve as fallback
// so searches like "long hot pepper" never return empty.
const DEPRIORITISED_DOMAINS = [
  "allrecipes.com", "foodnetwork.com", "epicurious.com", "seriouseats.com",
  "bonappetit.com", "cooking.nytimes.com", "simplyrecipes.com", "taste.com.au",
  "wikipedia.org", "wikimedia.org", "britannica.com",
  "gettyimages.com", "shutterstock.com", "istockphoto.com", "alamy.com",
  "dreamstime.com", "123rf.com", "depositphotos.com",
  "pinterest.com", "instagram.com", "facebook.com",
  "youtube.com", "reddit.com",
];

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Score a result URL: higher = show earlier.
 *  2 = preferred supermarket/grocery source
 *  1 = neutral (unknown domain)
 *  0 = deprioritised (recipe/stock/social)
 */
export function scoreResult(url) {
  const host = getDomain(url);
  if (!host) return 0;
  if (PREFERRED_DOMAINS.some((d) => host === d || host.endsWith("." + d))) return 2;
  if (DEPRIORITISED_DOMAINS.some((d) => host === d || host.endsWith("." + d))) return 0;
  return 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Brave Image Search: returns real image URLs + thumbnails for modal and replace. */
export async function braveImageSearchByQuery(query, limit = 6) {
  if (!BRAVE_API_KEY) {
    console.warn("[braveImageSearch] No BRAVE_API_KEY set");
    return [];
  }
  if (!query || !query.trim()) return [];

  const fetchCount = Math.min(limit * 3, 20);
  const params = new URLSearchParams({
    q: query,
    count: String(fetchCount),
    country: "us",
    search_lang: "en",
  });
  const url = `${BRAVE_IMAGE_ENDPOINT}?${params}`;

  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 800;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        headers: {
          "X-Subscription-Token": BRAVE_API_KEY,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "(unreadable)");
        console.warn(`[braveImageSearch] HTTP ${res.status}: ${body}`);
        return [];
      }

      const data = await res.json();
      const raw = data?.results || [];

      const toStr = (v) =>
        typeof v === "string" ? v : v?.src ? String(v.src) : v?.url ? String(v.url) : "";

      const mapped = raw.map((r) => {
        const imageUrl = toStr(r.properties?.url) || toStr(r.url) || "";
        const thumbnail = toStr(r.thumbnail) || imageUrl;
        return { title: r.title || "", url: imageUrl, thumbnail: thumbnail || "" };
      });

      // Sort: supermarkets first (score 2), neutral (1), recipe/stock/social last (0).
      const scored = mapped
        .filter((r) => r.url)
        .map((r) => ({ ...r, _score: scoreResult(r.url) }))
        .sort((a, b) => b._score - a._score)
        .map(({ _score, ...r }) => r);

      return scored.slice(0, limit);
    } catch (err) {
      const isRetryable = err.code === "ECONNRESET" || err.code === "ECONNREFUSED"
        || err.code === "ETIMEDOUT" || err.name === "AbortError";

      if (isRetryable && attempt < MAX_ATTEMPTS) {
        console.warn(`[braveImageSearch] attempt ${attempt} failed (${err.code ?? err.message}), retrying in ${RETRY_DELAY_MS}ms…`);
        await sleep(RETRY_DELAY_MS);
      } else {
        console.warn(`[braveImageSearch] failed after ${attempt} attempt(s): ${err.message}`);
        return [];
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return [];
}

// Backwards-compatible image-based helper (kept for possible future use)
export async function braveImageSearch(imagePath, ocr, limit = 5) {
  const query = buildQueryFromOCR(ocr);
  return searchBrave(query, limit);
}
