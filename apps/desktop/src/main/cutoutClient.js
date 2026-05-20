import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import FormData from "form-data";
import sharp from "sharp";
import { getResourceProfile } from "./resourceProfile.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// project-owned exports dir
const EXPORT_ROOT = path.resolve(__dirname, "../../../exports/cutouts");

async function ensureExportDir() {
  await fs.mkdir(EXPORT_ROOT, { recursive: true });
}

/** rename() fails with EXDEV when src and dest are on different volumes (e.g. Temp on C:, project on D:). */
async function moveFileTo(src, dest) {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if (err && err.code === "EXDEV") {
      await fs.copyFile(src, dest);
      await fs.unlink(src).catch(() => {});
    } else {
      throw err;
    }
  }
}

function cutoutBaseUrl() {
  const host = process.env.UFM_HOST || "127.0.0.1";
  const port = Number(process.env.UFM_PORT || 17890);
  return `http://${host}:${port}`;
}

/**
 * Poll GET /health until `ready` or timeout. Returns true if cutout backend accepts work.
 */
export async function waitForCutoutReady({ maxWaitMs = 20000, intervalMs = 400 } = {}) {
  const url = `${cutoutBaseUrl()}/health`;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body?.ready === true) return true;
    } catch {
      /* try again */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Downscale the image in Node.js before sending to Python, matching the same
 * cap the Python server applies. Avoids a large Pillow decode spike on the
 * Python side for high-res user photos (editor cutouts) vs. small Serper images.
 * Returns { sendPath, isTemp } — caller must delete isTemp files after use.
 */
async function preshrinkForCutout(inputPath) {
  const rp = getResourceProfile();
  let cap = rp.cutoutMaxEdgePx || 1536;
  // Mirror Python's birefnet hard cap: attention matrices scale quadratically with pixels
  if ((rp.rembgModel || "").startsWith("birefnet") && cap > 768) cap = 768;
  if (cap <= 0) return { sendPath: inputPath, isTemp: false };

  let meta;
  try {
    meta = await sharp(inputPath).metadata();
  } catch {
    return { sendPath: inputPath, isTemp: false };
  }

  const maxEdge = Math.max(meta.width || 0, meta.height || 0);
  if (maxEdge <= cap) return { sendPath: inputPath, isTemp: false };

  const ext = path.extname(inputPath).toLowerCase();
  const tempPath = path.join(os.tmpdir(), `ufm-preshrink-${Date.now()}${ext || ".jpg"}`);
  await sharp(inputPath)
    .resize({ width: cap, height: cap, fit: "inside", withoutEnlargement: true })
    .toFile(tempPath);
  console.log(`[cutout] pre-shrunk input: ${maxEdge}px → ${cap}px before sending to Python`);
  return { sendPath: tempPath, isTemp: true };
}

export async function runCutout(inputPath, externalSignal) {
  await ensureExportDir();

  const { sendPath, isTemp } = await preshrinkForCutout(inputPath);

  const form = new FormData();
  const stream = fsSync.createReadStream(sendPath);
  form.append("file", stream);

  const fetchTimeoutMs = getResourceProfile().cutoutFetchTimeoutMs;
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(fetchTimeoutMs)])
    : AbortSignal.timeout(fetchTimeoutMs);

  let res;
  try {
    res = await fetch(`${cutoutBaseUrl()}/cutout`, {
      method: "POST",
      body: form,
      signal,
    });
  } finally {
    stream.destroy();
    if (isTemp) await fs.unlink(sendPath).catch(() => {});
  }

  if (!res || !res.ok) {
    let detail = `status ${res?.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch (_) {}
    throw new Error(`Cutout failed: ${detail}`);
  }

  const { output_path, alpha_coverage, low_confidence } = await res.json();

  const finalName =
    path.basename(inputPath).replace(/\s+/g, "_") + ".cutout.png";

  const finalPath = path.join(EXPORT_ROOT, finalName);

  await moveFileTo(output_path, finalPath);

  return { path: finalPath, alphaCoverage: alpha_coverage ?? null, lowConfidence: low_confidence ?? false };
}
