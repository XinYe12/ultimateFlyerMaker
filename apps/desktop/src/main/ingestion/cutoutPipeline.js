/**
 * Unified image cutout pipeline.
 *
 * All image sources (direct file drop, Serper, DB, embedded browser) call
 * runCutoutPipeline() instead of managing the cutout + shadow steps themselves.
 *
 * The key optimisation: if an image already has a transparent background
 * (product photos published pre-cut by the retailer), isAlreadyTransparent()
 * detects this in ~50 ms via alpha-channel corner sampling and the entire
 * rembg/border-trim pipeline is skipped. Only a shadow pass runs.
 */
import path from "path";
import sharp from "sharp";
import { runCutout, EXPORT_ROOT } from "../cutoutClient.js";
import { addShadowToCutout } from "./addShadow.js";
import { getResourceProfile } from "../resourceProfile.js";

function roundMs(ms) { return Math.round(ms); }

function getCutoutFallbackModel(primaryModel) {
  const explicit = String(process.env.UFM_CUTOUT_FALLBACK_MODEL || "").trim();
  if (explicit === "0" || /^none$/i.test(explicit)) return null;
  if (explicit && explicit !== primaryModel) return explicit;
  const current = primaryModel || getResourceProfile().rembgModel || "u2net";
  if (["u2net", "briaai-rmbg", "bria", "briaai-rmbg-1.4"].includes(current)) return "isnet-general-use";
  if (current === "isnet-general-use") return "birefnet-general-lite";
  if (current === "birefnet-general-lite") return "birefnet-general";
  return null;
}

/**
 * Returns true if the image already has a transparent background.
 *
 * Method: sample a small patch in each of the 4 corners. If ≥ 3 corners
 * have near-zero average alpha (< 10/255), the image was pre-cut by the
 * source and the rembg pipeline can be skipped entirely.
 *
 * JPEG files are excluded immediately (no alpha channel possible).
 */
export async function isAlreadyTransparent(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return false;

  let meta;
  try { meta = await sharp(imagePath).metadata(); }
  catch { return false; }

  if (!meta.hasAlpha) return false;
  const { width, height } = meta;
  if (!width || !height || width < 20 || height < 20) return false;

  // Corner patch: ~6% of the shorter dimension, clamped to [4, 15] px
  const cs = Math.max(4, Math.min(15, Math.floor(Math.min(width, height) * 0.06)));

  const [tl, tr, bl, br] = await Promise.all([
    sharp(imagePath).extract({ left: 0,          top: 0,           width: cs, height: cs }).ensureAlpha().raw().toBuffer(),
    sharp(imagePath).extract({ left: width - cs, top: 0,           width: cs, height: cs }).ensureAlpha().raw().toBuffer(),
    sharp(imagePath).extract({ left: 0,          top: height - cs, width: cs, height: cs }).ensureAlpha().raw().toBuffer(),
    sharp(imagePath).extract({ left: width - cs, top: height - cs, width: cs, height: cs }).ensureAlpha().raw().toBuffer(),
  ]);

  let transparent = 0;
  for (const buf of [tl, tr, bl, br]) {
    let sum = 0;
    for (let i = 3; i < buf.length; i += 4) sum += buf[i];
    if (sum / (buf.length / 4) < 10) transparent++;
  }
  return transparent >= 3;
}

/**
 * Run the full cutout pipeline for one image:
 *   1. Check if already transparent → if so, skip rembg and go straight to shadow
 *   2. Otherwise: border-trim → ML primary → ML fallback chain
 *   3. Add drop shadow to the best result
 *
 * @param {string} inputPath
 * @param {{
 *   signal?: AbortSignal,
 *   stats?: { serperRembgMs: number, serperShadowMs: number },
 *   skipTransparentCheck?: boolean,
 * }} options
 * @returns {{ path: string, lowConfidence: boolean, qualityReason: string|null, model: string, skippedCutout?: boolean }}
 */
export async function runCutoutPipeline(inputPath, options = {}) {
  const { signal, stats, skipTransparentCheck = false } = options;

  // ── Fast path: already transparent ──────────────────────────────────────────
  if (!skipTransparentCheck) {
    let transparent = false;
    try { transparent = await isAlreadyTransparent(inputPath); }
    catch (err) { console.warn("[cutoutPipeline] alpha check failed, running normal pipeline:", err?.message); }

    if (transparent) {
      console.log(`[cutoutPipeline] ${path.basename(inputPath)} already transparent — skipping cutout`);
      const t = stats ? performance.now() : 0;
      // Normalise to PNG in EXPORT_ROOT so addShadow naming works consistently
      const base = path.basename(inputPath, path.extname(inputPath)).replace(/\s+/g, "_");
      const passPath = path.join(EXPORT_ROOT, `${base}-${Date.now()}.passthrough.cutout.png`);
      await sharp(inputPath).ensureAlpha().png().toFile(passPath);
      const shadowPath = await addShadowToCutout(passPath, { lowConfidence: false });
      if (stats) stats.serperShadowMs += roundMs(performance.now() - t);
      return { path: shadowPath, lowConfidence: false, qualityReason: null, model: "passthrough", skippedCutout: true };
    }
  }

  // ── Slow path: border-trim → ML fallback chain ───────────────────────────────
  let cutoutResult;
  const t0 = stats ? performance.now() : 0;
  try {
    cutoutResult = await runCutout(inputPath, signal, { model: "border-trim" });
    console.log(
      `[cutoutPipeline] border-trim: coverage=${cutoutResult.alphaCoverage?.toFixed(2)}, ` +
      `lowConf=${cutoutResult.lowConfidence}, reason=${cutoutResult.qualityReason || "ok"}`
    );

    if (cutoutResult.lowConfidence) {
      console.log("[cutoutPipeline] border-trim low-confidence — escalating to ML");
      try {
        const mlResult = await runCutout(inputPath, signal);
        console.log(`[cutoutPipeline] ML primary: coverage=${mlResult.alphaCoverage?.toFixed(2)}, lowConf=${mlResult.lowConfidence}`);
        if (!mlResult.lowConfidence) {
          cutoutResult = mlResult;
        } else {
          const fallbackModel = getCutoutFallbackModel(mlResult.model);
          if (fallbackModel) {
            try {
              console.log(`[cutoutPipeline] Trying ML fallback: ${fallbackModel}`);
              const fb = await runCutout(inputPath, signal, { model: fallbackModel });
              if (!fb.lowConfidence || (fb.alphaCoverage ?? 0) > (cutoutResult.alphaCoverage ?? 0)) {
                cutoutResult = fb;
              }
            } catch (err) {
              console.warn(`[cutoutPipeline] ML fallback (${fallbackModel}) failed:`, err?.message);
            }
          } else if ((mlResult.alphaCoverage ?? 0) > (cutoutResult.alphaCoverage ?? 0)) {
            cutoutResult = mlResult;
          }
        }
      } catch (err) {
        console.warn("[cutoutPipeline] ML cutout failed:", err?.message);
      }
    }
  } finally {
    if (stats) stats.serperRembgMs += roundMs(performance.now() - t0);
  }

  // ── Shadow ───────────────────────────────────────────────────────────────────
  const t1 = stats ? performance.now() : 0;
  try {
    const shadowPath = await addShadowToCutout(cutoutResult.path, {
      lowConfidence: cutoutResult.lowConfidence,
      qualityReason: cutoutResult.qualityReason,
      borderAlpha: cutoutResult.borderAlpha,
      bboxAreaRatio: cutoutResult.bboxAreaRatio,
    });
    return { ...cutoutResult, path: shadowPath };
  } finally {
    if (stats) stats.serperShadowMs += roundMs(performance.now() - t1);
  }
}
