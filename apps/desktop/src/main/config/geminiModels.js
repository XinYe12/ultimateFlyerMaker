import { net } from "electron";
import { readUserConfig, writeUserConfig } from "../ipc/configStore.js";

// Persisted key used to store the last successfully resolved model.
const CACHE_KEY = "GEMINI_RESOLVED_MODEL";

// Last-resort hardcoded name — only used on the very first run when the
// models API is unreachable AND no prior successful lookup has been saved.
const BOOTSTRAP_FALLBACK = "gemini-2.5-flash";

let _resolvedVisionModel = null;

/**
 * Returns the Gemini vision model name to use for generateContent calls.
 *
 * Priority:
 *   1. GEMINI_MODEL env var (explicit user override in Settings or .env)
 *   2. In-memory cache from this process lifetime
 *   3. Live /models API from Google — picks the newest flash model, saves result
 *   4. Last-known-good model saved in ufm.config.json from a prior successful call
 *   5. BOOTSTRAP_FALLBACK hardcoded string (first-run-only last resort)
 */
export async function resolveGeminiVisionModel(apiKey) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (_resolvedVisionModel) return _resolvedVisionModel;

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  let res = null;
  try { res = await net.fetch(url); } catch { /* network error */ }

  if (res?.ok) {
    const { models = [] } = await res.json();

    const capable = models.filter(m =>
      Array.isArray(m.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes("generateContent")
    );

    const scored = capable.map(m => {
      const name = m.name.replace(/^models\//, "");
      const isFlash = name.includes("flash");
      const versionMatch = name.match(/(\d+)\.(\d+)/);
      const version = versionMatch
        ? parseInt(versionMatch[1]) * 100 + parseInt(versionMatch[2])
        : 0;
      return { name, score: (isFlash ? 10000 : 0) + version };
    });
    scored.sort((a, b) => b.score - a.score);

    if (scored.length) {
      _resolvedVisionModel = scored[0].name;
      // Persist so future launches survive API unavailability.
      writeUserConfig({ [CACHE_KEY]: _resolvedVisionModel });
      console.log(`[Gemini] Auto-resolved vision model: ${_resolvedVisionModel}`);
      return _resolvedVisionModel;
    }

    console.warn("[Gemini] /models returned no generateContent-capable models.");
  } else {
    console.warn(`[Gemini] Failed to list models (HTTP ${res?.status ?? "network error"}).`);
  }

  // API unavailable or empty — try last-known-good from config.
  const saved = readUserConfig()[CACHE_KEY];
  if (saved) {
    console.warn(`[Gemini] Using last-known-good model from config: "${saved}". Set GEMINI_MODEL in Settings to override.`);
    _resolvedVisionModel = saved;
    return _resolvedVisionModel;
  }

  // Absolute last resort: bootstrap hardcoded name.
  console.warn(`[Gemini] No cached model found — using bootstrap fallback "${BOOTSTRAP_FALLBACK}". Set GEMINI_MODEL in Settings to override.`);
  _resolvedVisionModel = BOOTSTRAP_FALLBACK;
  return _resolvedVisionModel;
}

export function clearResolvedVisionModel() {
  _resolvedVisionModel = null;
}
