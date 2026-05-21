// apps/desktop/src/main/ingestion/serperScorer.js
// Per-result confidence scoring for Serper image search results.
// Combines title relevance, URL quality, and domain affinity (static + learned)
// into a 0.0–1.0 score used to re-rank results before the cutout loop.

import { scoreResult, getDomain } from "./braveSearchService.js";

// Blend weights — sum to 1.0
const TITLE_WEIGHT  = 0.35;
const URL_WEIGHT    = 0.25;
const DOMAIN_WEIGHT = 0.40;

const STOP_WORDS = new Set([
  "the","a","an","of","and","with","in","for","to","at","by","from",
  "grocery","store","supermarket","fresh","organic","natural","brand","new",
]);

const GOOD_PATH_KW = ["product","item","shop","store","buy","catalog","p/","dp/","sku","goods"];
const BAD_PATH_KW  = ["recipe","blog","article","news","how-to","howto","wiki","watch","video","pin/","tutorial","ideas"];

// ---------- Learning weight cache (Phase 3) ----------

let _weightCache = {};
let _weightCacheLoaded = false;
let _weightRefreshTimer = null;
const CACHE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export async function initSerperScorer() {
  try {
    const { loadDomainWeights } = await import("./serperSignalService.js");
    _weightCache = await loadDomainWeights();
    _weightCacheLoaded = true;
    _weightRefreshTimer = setInterval(async () => {
      try {
        const { loadDomainWeights: reload } = await import("./serperSignalService.js");
        _weightCache = await reload();
        console.log("[serperScorer] Domain weights refreshed");
      } catch {}
    }, CACHE_REFRESH_INTERVAL_MS);
  } catch (err) {
    console.warn("[serperScorer] Weight load failed (using static scoring):", err.message);
    _weightCache = {};
    _weightCacheLoaded = true;
  }
}

export function shutdownSerperScorer() {
  if (_weightRefreshTimer) {
    clearInterval(_weightRefreshTimer);
    _weightRefreshTimer = null;
  }
}

// ---------- Score components ----------

function titleScore(result, di) {
  const enName = (di.en || "").toLowerCase();
  if (!enName) return 0.5;
  const diTokens = enName.split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
  if (diTokens.length === 0) return 0.5;
  const titleTokens = new Set(
    (result.title || "").toLowerCase().split(/\W+/).filter(t => t.length > 1 && !STOP_WORDS.has(t))
  );
  const matches = diTokens.filter(t => titleTokens.has(t)).length;
  return Math.min(matches / diTokens.length, 1.0);
}

function urlQualityScore(url) {
  let pathname;
  try { pathname = new URL(url).pathname.toLowerCase(); } catch { return 0.5; }
  if (GOOD_PATH_KW.some(kw => pathname.includes(kw))) return 1.0;
  if (BAD_PATH_KW.some(kw => pathname.includes(kw))) return 0.0;
  return 0.5;
}

function domainAffinityScore(url, department) {
  const rawScore = scoreResult(url) / 2; // normalise 0/1/2 → 0.0/0.5/1.0
  if (!_weightCacheLoaded) return rawScore;

  const domain = getDomain(url);
  const catKey = department || "_all";
  const w = _weightCache?.[domain]?.[catKey] ?? _weightCache?.[domain]?.["_all"];
  if (!w) return rawScore;

  const total = (w.a || 0) + (w.r || 0);
  if (total < 5) return rawScore; // cold start — trust static score
  const learnedRate = w.a / total;
  // blend ramps from 0% to 60% as data accumulates; cap preserves static knowledge
  const blend = Math.min(total / 20, 0.6);
  return rawScore * (1 - blend) + learnedRate * blend;
}

// ---------- Public API ----------

/**
 * Score a single Serper result against a discount item descriptor.
 * @param {{ title: string; url: string }} result
 * @param {{ en?: string; zh?: string; department?: string }} di
 * @returns {number} 0.0–1.0
 */
export function scoreSerpResult(result, di) {
  const ts = titleScore(result, di);
  const us = urlQualityScore(result.url);
  const ds = domainAffinityScore(result.url, di.department || "");
  return ts * TITLE_WEIGHT + us * URL_WEIGHT + ds * DOMAIN_WEIGHT;
}

/**
 * Re-rank Serper results by confidence score (descending).
 * Attaches `_confidence` to each result for use by JobProcessor.
 * @param {Array<{ title: string; url: string }>} results
 * @param {{ en?: string; zh?: string; department?: string }} di
 * @returns {Array}
 */
export function rerankSerperResults(results, di) {
  return results
    .map(r => ({ ...r, _confidence: scoreSerpResult(r, di) }))
    .sort((a, b) => b._confidence - a._confidence);
}
