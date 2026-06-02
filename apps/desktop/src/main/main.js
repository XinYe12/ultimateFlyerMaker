import { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage, session } from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import { fileURLToPath } from "url";
import "./loadEnv.js";

import { processFlyerImage } from "./imagePipeline.js";
import { ingestPhoto, ingestPhotoPhase1, ingestPhotoPhase2 } from "./ingestion/ingestPhoto.js";
import { runCutout } from "./cutoutClient.js";
import { addShadowToCutout } from "./ingestion/addShadow.js";
import { parseDiscountText } from "./ipc/parseDiscountText.js";
import { exportDiscountImages } from "./ipc/exportDiscountImages.js";
import { parseDiscountXlsx, parseAllDepartmentsXlsx } from "./ipc/parseDiscountXlsx.js";
import { exportExampleXlsx } from "./ipc/exportExampleXlsx.js";
import { ingestImages } from "./ipc/ingestImages.js";
import { getJobProcessor } from "./jobs/JobProcessor.js";
import { searchForDiscountItem } from "./ingestion/searchService.js";
import { braveImageSearchByQuery } from "./ingestion/braveSearchService.js";
import { googleImageSearch, googleKeysPresent } from "./ingestion/googleImageSearchService.js";
import os from "os";

import { startBackend, stopBackend, startHealthWatch, getBackendInfo } from "./startBackend.js";
import { getResourceProfile } from "./resourceProfile.js";
import { waitForBackend } from "./waitForBackend.js";
import { loadUserConfig, readUserConfig, writeUserConfig } from "./ipc/configStore.js";
import { initFirebase, admin } from "./firebase.js";
import { db as firestoreDb } from "./ingestion/firebase.js";
import { registerBackendIpc } from "./ipc/backend.js";
import { registerBackendProxyIpc } from "./ipc/backendProxy.js";
import { processDbBatch, requestBatchStop, getDbStats, getTodaysSaves, checkDbStorageConsistency, fixDbStorageConsistency, confirmSingleImageToDb, scanAndRemoveNonProducts, deleteProductFromDb, cleanMessyTitleProducts } from "./ipc/batchIngestToDB.js";
import { saveCombinationToDb } from "./ipc/saveCombinationToDB.js";
import { getQuotaStatus, getLiveQuotaStatus } from "./ipc/quotaTracker.js";
import { reembedAllProducts } from "./ingestion/migrateEmbeddings.js";
import { promoteSerperResults } from "./ingestion/promoteSerperResults.js";
import { initSerperScorer, shutdownSerperScorer } from "./ingestion/serperScorer.js";
import { recordSerperRejection, recordManualGoogleAccepted } from "./ingestion/serperSignalService.js";
import { getSerperLearningStats } from "./ipc/getSerperLearningStats.js";
import { testGeminiConnection } from "./ingestion/imageEmbeddingService.js";
import { parseTemplateFromImages } from "./ipc/parseTemplateFromImages.js";
import "./net/longFetch.js";
import log from "./logger.js";

/* ---------- Process-level startup clock (captured before app.whenReady()) ---------- */
const PROCESS_T0 = Date.now();

/* ---------- ESM __dirname fix ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- Crash sentinel ---------- */
const SENTINEL_PATH = path.join(app.getPath("userData"), ".ufm-running");

function writeSentinel() {
  try { fs.writeFileSync(SENTINEL_PATH, String(Date.now())); } catch {}
}
function removeSentinel() {
  try { fs.unlinkSync(SENTINEL_PATH); } catch {}
}
function didCrashLastRun() {
  try { return fs.existsSync(SENTINEL_PATH); } catch { return false; }
}

/** Wait for Vite dev server to be reachable (avoids ERR_CONNECTION_REFUSED when dev starts concurrently). */
async function waitForVite(host = "127.0.0.1", port = 5173, maxAttempts = 60, intervalMs = 500) {
  const url = `http://${host}:${port}`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(t);
      if (res.status !== undefined) {
        console.log("[main] Vite dev server ready at", url);
        return;
      }
    } catch (_) {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Vite dev server at ${url} did not become ready after ${maxAttempts} attempts`);
}

/* ---------- Safe IPC send helper ---------- */
function safeSend(channel, data) {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  } catch (err) {
    console.warn(`[safeSend] dropped ${channel}:`, err?.message ?? err);
  }
}

/* ---------- Electron windows ---------- */
let mainWindow = null;
let splashWindow = null;
let googleSearchWindow = null;
let forceQuit = false;

function createSplashWindow() {
  const splashPreloadPath = path.resolve(__dirname, "splashPreload.cjs");
  const splashHtmlPath = path.resolve(__dirname, "splash.html");

  splashWindow = new BrowserWindow({
    width: 380,
    height: 260,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: fs.existsSync(splashPreloadPath) ? splashPreloadPath : undefined,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(splashHtmlPath);
  splashWindow.once("ready-to-show", () => splashWindow?.show());
  splashWindow.on("closed", () => { splashWindow = null; });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function updateSplash(msg) {
  try {
    if (splashWindow && !splashWindow.isDestroyed() && !splashWindow.webContents.isDestroyed()) {
      splashWindow.webContents.send("splash:status", msg);
    }
  } catch (_) {}
}

function createWindow() {
  const preloadPath = path.resolve(__dirname, "preload.cjs");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      webviewTag: true
    }
  });

  mainWindow.loadURL("http://localhost:5173");
  if (!app.isPackaged) mainWindow.webContents.openDevTools();

  // Zoom shortcuts. We own all three (in/out/reset) so Chromium's native zoom
  // (which uses a different scale) can't produce inconsistent results.
  // On Windows, Ctrl+Shift+= reports input.key="=" (not "+") because Ctrl
  // suppresses shift-character mapping — so we check both key and code.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !input.control || input.alt || input.meta) return;
    const key = input.key;
    const code = input.code;

    const zoomIn  = key === "+" || key === "=" || code === "Equal" || code === "NumpadAdd";
    const zoomOut = key === "-" || key === "_" || code === "Minus" || code === "NumpadSubtract";
    const zoomReset = !input.shift && (key === "0" || code === "Digit0" || code === "Numpad0");

    if (zoomIn) {
      event.preventDefault();
      const next = Math.min(3.0, Math.round((mainWindow.webContents.getZoomFactor() + 0.1) * 10) / 10);
      mainWindow.webContents.setZoomFactor(next);
    } else if (zoomOut) {
      event.preventDefault();
      const next = Math.max(0.3, Math.round((mainWindow.webContents.getZoomFactor() - 0.1) * 10) / 10);
      mainWindow.webContents.setZoomFactor(next);
    } else if (zoomReset) {
      event.preventDefault();
      mainWindow.webContents.setZoomFactor(1.0);
    }
  });

  // Confirm before closing
  mainWindow.on("close", (e) => {
    if (forceQuit) return;
    e.preventDefault();
    dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Quit", "Cancel"],
      defaultId: 1,
      title: "Quit Ultimate Flyer Maker",
      message: "Quit the application?",
      detail: "Choose Quit to exit cleanly. Your drafts are saved and will be here when you reopen.",
    }).then(({ response }) => {
      if (response === 0) {
        forceQuit = true;
        removeSentinel();
        mainWindow.close();
      }
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ---------- App lifecycle ---------- */
app.on("before-quit", () => {
  removeSentinel();
  stopBackend();
  shutdownSerperScorer();
});

/* ---------- IPC: native file drag (for Google Lens) ---------- */
ipcMain.on("ufm:startDrag", (event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return;
  const icon = nativeImage.createFromPath(filePath).resize({ width: 100 });
  event.sender.startDrag({ file: filePath, icon });
});

function normalizeLocalImagePath(value) {
  if (!value) return value;
  const raw = String(value);
  if (raw.startsWith("file://")) {
    try {
      return fileURLToPath(raw);
    } catch {
      return decodeURIComponent(raw.replace(/^file:\/+/, ""));
    }
  }
  return path.normalize(raw);
}

function toBackendPath(value) {
  const local = normalizeLocalImagePath(value);
  return local ? String(local).replace(/\\/g, "/") : local;
}

function stripCutoutSuffixes(nameWithoutExt) {
  return nameWithoutExt.replace(/(?:\.(?:erased|extracted|smart)-\d+)+$/, "");
}

const CUTOUT_EXPORT_ROOT = path.resolve(__dirname, "../../../exports/cutouts");

function isDerivedCutoutPath(value) {
  if (!value) return false;
  const normalized = path.normalize(String(value)).toLowerCase();
  const basename = path.basename(normalized);
  return (
    basename.includes(".cutout") ||
    basename.includes(".shadow") ||
    basename.includes(".smart-") ||
    basename.includes(".erased") ||
    normalized.startsWith(path.normalize(CUTOUT_EXPORT_ROOT).toLowerCase())
  );
}

async function fetchImageToOriginalCache(sourceUrl) {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
  const ACCEPT = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
  const referers = [
    "https://www.google.com/",
    new URL(sourceUrl).origin + "/",
    null,
  ];
  let res;
  for (const referer of referers) {
    const headers = { "User-Agent": UA, "Accept": ACCEPT };
    if (referer) headers["Referer"] = referer;
    res = await fetch(sourceUrl, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (res.status !== 403) break;
  }
  if (!res?.ok) throw new Error(`Original download failed: HTTP ${res?.status || "unknown"}`);
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.startsWith("image/")) {
    throw new Error(`Original URL did not return an image: ${contentType}`);
  }
  const ab = await res.arrayBuffer();
  let ext = ".png";
  try {
    const urlExt = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    if (/^\.(jpg|jpeg|png|webp|gif)$/i.test(urlExt)) ext = urlExt;
  } catch {}
  const outPath = path.join(CUTOUT_EXPORT_ROOT, `ufm-original-${Date.now()}${ext}`);
  await fs.promises.writeFile(outPath, Buffer.from(ab));
  return outPath;
}

/* ---------- IPC: cutout eraser ---------- */
ipcMain.handle("ufm:saveErasedCutout", async (_event, cutoutPath, pngDataUrl, options = {}) => {
  try {
    await fs.promises.mkdir(CUTOUT_EXPORT_ROOT, { recursive: true });
    const localCutoutPath = normalizeLocalImagePath(cutoutPath);
    const base64 = String(pngDataUrl || "").replace(/^data:image\/png;base64,/, "");
    if (!base64) throw new Error("Missing edited PNG data");
    const buf = Buffer.from(base64, "base64");
    const parsed = localCutoutPath ? path.parse(localCutoutPath) : null;
    const safeName = stripCutoutSuffixes(parsed?.name || "cutout").replace(/[^\w.-]+/g, "-");
    const outDir = options?.sourceMode ? CUTOUT_EXPORT_ROOT : (parsed?.dir || CUTOUT_EXPORT_ROOT);
    const outPath = path.join(outDir, `${safeName}.erased-${Date.now()}.png`);
    await fs.promises.writeFile(outPath, buf);
    return { ok: true, path: outPath };
  } catch (err) {
    log.error("[saveErasedCutout] failed:", err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("ufm:cutoutEditedImage", async (_event, basePath, pngDataUrl) => {
  try {
    const backend = getBackendInfo();
    if (!backend?.url) throw new Error("Backend not started");
    await fs.promises.mkdir(CUTOUT_EXPORT_ROOT, { recursive: true });
    const localBasePath = normalizeLocalImagePath(basePath);
    const base64 = String(pngDataUrl || "").replace(/^data:image\/png;base64,/, "");
    if (!base64) throw new Error("Missing edited PNG data");
    const buf = Buffer.from(base64, "base64");
    const form = new FormData();
    form.append("file", buf, {
      filename: "edited-cutout-source.png",
      contentType: "image/png",
    });
    const res = await fetch(`${backend.url}/cutout`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    if (!body.output_path || !fs.existsSync(body.output_path)) {
      throw new Error("Extracted cutout output missing");
    }
    const parsed = localBasePath ? path.parse(localBasePath) : null;
    const safeName = stripCutoutSuffixes(parsed?.name || "edited").replace(/[^\w.-]+/g, "-");
    const outPath = path.join(CUTOUT_EXPORT_ROOT, `${safeName}.extracted-${Date.now()}.png`);
    try {
      await fs.promises.rename(body.output_path, outPath);
    } catch (err) {
      if (err?.code === "EXDEV") {
        await fs.promises.copyFile(body.output_path, outPath);
        await fs.promises.unlink(body.output_path).catch(() => {});
      } else {
        throw err;
      }
    }
    return { ok: true, path: outPath, diagnostics: body };
  } catch (err) {
    log.error("[cutoutEditedImage] failed:", err);
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("ufm:refineCutoutWithClicks", async (_event, args) => {
  try {
    const backend = getBackendInfo();
    if (!backend?.url) throw new Error("Backend not started");
    const cutoutPath = normalizeLocalImagePath(args?.cutout_path);
    const imagePath = normalizeLocalImagePath(args?.image_path);
    if (!cutoutPath || !fs.existsSync(cutoutPath)) {
      throw new Error(`cutout_path does not exist: ${cutoutPath || "(empty)"}`);
    }
    const payload = {
      ...args,
      cutout_path: toBackendPath(cutoutPath),
      image_path: imagePath && fs.existsSync(imagePath) ? toBackendPath(imagePath) : null,
    };
    const res = await fetch(`${backend.url}/interactive-cutout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    if (!body.output_path || !fs.existsSync(body.output_path)) {
      throw new Error("Refined cutout output missing");
    }
    const cleanBase = cutoutPath.replace(/(?:\.(?:erased|extracted|smart)-\d+)+(?=\.png$)/i, "");
    const outPath = cleanBase.replace(/\.png$/i, "") + `.smart-${Date.now()}.png`;
    try {
      await fs.promises.rename(body.output_path, outPath);
    } catch (err) {
      if (err?.code === "EXDEV") {
        await fs.promises.copyFile(body.output_path, outPath);
        await fs.promises.unlink(body.output_path).catch(() => {});
      } else {
        throw err;
      }
    }
    return { ok: true, path: outPath, diagnostics: body };
  } catch (err) {
    log.error("[refineCutoutWithClicks] failed:", err);
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("ufm:restoreOriginalCutout", async (_event, args) => {
  try {
    await fs.promises.mkdir(CUTOUT_EXPORT_ROOT, { recursive: true });
    const cutoutPath = normalizeLocalImagePath(args?.cutoutPath);
    const sourcePath = normalizeLocalImagePath(args?.sourcePath);
    const sourceUrl = String(args?.sourceUrl || "").trim();
    const sourcePathIsUsable = sourcePath &&
      fs.existsSync(sourcePath) &&
      sourcePath !== cutoutPath &&
      !isDerivedCutoutPath(sourcePath);

    if (sourcePathIsUsable) {
      return { ok: true, path: sourcePath };
    }

    if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
      return { ok: true, path: await fetchImageToOriginalCache(sourceUrl) };
    }

    const reason = sourcePath && isDerivedCutoutPath(sourcePath)
      ? "Only a cutout-derived image is available; no original source URL was saved."
      : "No original image source is available";
    throw new Error(reason);
  } catch (err) {
    log.error("[restoreOriginalCutout] failed:", err);
    return { ok: false, error: String(err?.message || err) };
  }
});

/* ---------- IPC: file-based job persistence ---------- */
const JOBS_FILE = path.join(app.getPath("userData"), "flyer-jobs.json");

ipcMain.handle("ufm:saveJobs", async (_event, data) => {
  try {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(data), "utf-8");
    return { ok: true };
  } catch (err) {
    log.error("[saveJobs] failed:", err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("ufm:loadJobs", async () => {
  try {
    if (!fs.existsSync(JOBS_FILE)) return [];
    const raw = fs.readFileSync(JOBS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    log.error("[loadJobs] failed:", err);
    return [];
  }
});

/* ---------- IPC: crash recovery flag ---------- */
ipcMain.handle("ufm:didCrashLastRun", () => {
  const crashed = !!global.__ufmCrashedLastRun;
  global.__ufmCrashedLastRun = false; // consume once
  return crashed;
});

/* ---------- IPC: startup timing ---------- */
ipcMain.handle("ufm:getStartupTiming", () => global.__ufmStartupTiming ?? null);

/* ---------- IPC: request quit (triggers main window close → confirmation dialog) ---------- */
ipcMain.handle("ufm:requestQuit", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

/* ---------- IPC: open log file ---------- */
ipcMain.handle("ufm:openLogFile", async () => {
  const filePath = log.transports.file.getFile().path;
  await shell.openPath(filePath);
  return filePath;
});

/* ---------- IPC: open external URL in default browser ---------- */
ipcMain.handle("ufm:openExternal", async (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) {
    await shell.openExternal(url);
  }
});

/* ---------- IPC: batch cutout ---------- */
ipcMain.handle("batch-cutout", async (_, filePaths) => {
  const results = [];
  const totalStart = Date.now();

  for (const filePath of filePaths) {
    const flyerItem = { image: { src: filePath } };
    const start = Date.now();
    try {
      await processFlyerImage(flyerItem);
    } catch (err) {
      log.error("[batch-cutout] item failed:", filePath, err?.message ?? err);
    }
    const end = Date.now();
    results.push({
      input: filePath,
      output: flyerItem.image.src,
      seconds: ((end - start) / 1000).toFixed(2)
    });
  }

  return {
    results,
    totalSeconds: ((Date.now() - totalStart) / 1000).toFixed(2)
  };
});

/* ---------- IPC: ingestion ---------- */
ipcMain.handle("ufm:ingestPhoto", async (_, inputPath) => {
  try {
    return await ingestPhoto(inputPath);
  } catch (err) {
    log.error("[ufm:ingestPhoto]", err);
    throw err;
  }
});

ipcMain.handle("ufm:ingestPhotoPhase1", async (_, inputPath) => {
  try {
    return await ingestPhotoPhase1(inputPath);
  } catch (err) {
    log.error("[ufm:ingestPhotoPhase1]", err);
    throw err;
  }
});

// Fire-and-forget: returns { queued: true } immediately; result arrives via push channel
ipcMain.handle("ufm:startCutout", async (_, id, inputPath) => {
  ingestPhotoPhase2(inputPath)
    .then(patch => safeSend("ufm:cutoutComplete", { id, ...patch }))
    .catch(err => safeSend("ufm:cutoutError", { id, error: err?.message ?? String(err) }));
  return { queued: true };
});

ipcMain.handle("ufm:rerunCutout", async (_, id, originalPath, model) => {
  (async () => {
    try {
      // Always run on the original photo — never a cutout derivative.
      // If the file no longer exists (e.g. temp file cleaned up), bail with a clear error.
      const localOriginal = normalizeLocalImagePath(originalPath);
      if (!localOriginal || !fs.existsSync(localOriginal)) {
        throw new Error(
          `Original photo not found at "${originalPath}". ` +
          `Please re-add the product image and try again.`
        );
      }
      const cutoutResult = await runCutout(localOriginal, null, { model });
      const cutoutPath = await addShadowToCutout(cutoutResult.path, {
        lowConfidence: cutoutResult.lowConfidence,
        qualityReason: cutoutResult.qualityReason,
        borderAlpha: cutoutResult.borderAlpha,
        bboxAreaRatio: cutoutResult.bboxAreaRatio,
      });
      safeSend("ufm:cutoutComplete", { id, cutoutPath, layout: { size: "SMALL" } });
    } catch (err) {
      safeSend("ufm:cutoutError", { id, error: err?.message ?? String(err) });
    }
  })();
  return { queued: true };
});

/* ---------- IPC: parsing ---------- */
ipcMain.handle("ufm:parseDiscountXlsx", async (event, ...args) => {
  try {
    return await parseDiscountXlsx(event, ...args);
  } catch (err) {
    log.error("[ufm:parseDiscountXlsx]", err);
    throw err;
  }
});
ipcMain.handle("ufm:parseAllDepartmentsXlsx", async (event, ...args) => {
  try {
    return await parseAllDepartmentsXlsx(event, ...args);
  } catch (err) {
    log.error("[ufm:parseAllDepartmentsXlsx]", err);
    throw err;
  }
});
ipcMain.handle("ufm:exportExampleXlsx", async (event, format) => {
  try {
    return await exportExampleXlsx(event, format);
  } catch (err) {
    log.error("[ufm:exportExampleXlsx]", err);
    throw err;
  }
});
ipcMain.handle("ufm:parseDiscountText", async (event, ...args) => {
  try {
    return await parseDiscountText(event, ...args);
  } catch (err) {
    log.error("[ufm:parseDiscountText]", err);
    throw err;
  }
});

/* ---------- IPC: template import from images ---------- */
ipcMain.handle("ufm:parseTemplateFromImages", async (event, imagePaths) => {
  try {
    return await parseTemplateFromImages(event, imagePaths);
  } catch (err) {
    log.error("[ufm:parseTemplateFromImages]", err);
    throw err;
  }
});

/* ---------- IPC: export discount labels ---------- */
ipcMain.handle("ufm:exportDiscountImages", async (_event, items) => {
  try {
    return await exportDiscountImages(items);
  } catch (err) {
    log.error("[ufm:exportDiscountImages]", err);
    throw err;
  }
});

ipcMain.handle("ingestImages", async (event, ...args) => {
  try {
    return await ingestImages(event, ...args);
  } catch (err) {
    log.error("[ingestImages]", err);
    throw err;
  }
});

/* ---------- IPC: DB search (Replace → Database Results) ---------- */
ipcMain.handle("ufm:searchDatabaseByText", async (_, query, limit = 6) => {
  try {
    if (!query || !String(query).trim()) return [];
    return await searchForDiscountItem({ en: String(query).trim() }, limit);
  } catch (err) {
    console.error("[searchDatabaseByText] error:", err);
    return [];
  }
});

/* ---------- IPC: image search (Google CSE preferred, Brave fallback) ---------- */
ipcMain.handle("ufm:googleImageSearch", async (_, query) => {
  try {
    const q = String(query || "").trim();
    if (!q) return [];

    // Try Google Custom Search API first (real Google results).
    if (googleKeysPresent()) {
      const googleResults = await googleImageSearch(q, 6);
      if (googleResults && googleResults.length > 0) return googleResults;
      // null = not configured; [] = configured but no results → fall through to Brave
    }

    // Fallback: Brave image search.
    return await braveImageSearchByQuery(q, 6);
  } catch (err) {
    console.error("[googleImageSearch] error:", err);
    return [];
  }
});

/* ---------- IPC: open mini Google Search browser ---------- */
ipcMain.handle("ufm:openGoogleSearchWindow", async (_, query) => {
  const q = String(query || "").trim();
  if (!q) return;

  const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;

  // Reuse existing window if possible
  if (googleSearchWindow && !googleSearchWindow.isDestroyed()) {
    googleSearchWindow.loadURL(url);
    googleSearchWindow.show();
    googleSearchWindow.focus();
    return;
  }

  googleSearchWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  googleSearchWindow.loadURL(url);

  googleSearchWindow.on("closed", () => {
    googleSearchWindow = null;
  });
});

ipcMain.handle("ufm:downloadAndIngestFromUrl", async (_, publicUrl) => {
  if (!publicUrl || !String(publicUrl).trim()) {
    throw new Error("Missing publicUrl");
  }
  const url = String(publicUrl).trim();

  // Handle base64 data: URLs (Google thumbnail drag gives data:image/jpeg;base64,...)
  if (url.startsWith("data:image/")) {
    const [header, base64Data] = url.split(",");
    const extMatch = header.match(/data:image\/(\w+)/);
    const rawExt = extMatch ? extMatch[1].toLowerCase() : "jpg";
    const safeExt = /^(jpg|jpeg|png|gif|webp)$/.test(rawExt) ? `.${rawExt}` : ".jpg";
    const tempPath = path.join(os.tmpdir(), `ufm-download-${Date.now()}${safeExt}`);
    console.log(`[downloadAndIngest] decoding data: URL (${Math.round(base64Data.length * 3 / 4)} bytes) → ${tempPath}`);
    await fs.promises.writeFile(tempPath, Buffer.from(base64Data, "base64"));
    try {
      const result = await ingestPhoto(tempPath);
      return { path: tempPath, result };
    } catch (err) {
      await fs.promises.unlink(tempPath).catch(() => {});
      throw err;
    }
  }

  const ext = path.extname(new URL(url).pathname) || ".jpg";
  const safeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
  const tempPath = path.join(os.tmpdir(), `ufm-download-${Date.now()}${safeExt}`);

  try {
    console.log(`[downloadAndIngest] fetching: ${url}`);
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const ACCEPT = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
    // Use Electron's session.fetch so Chromium's network stack (cookies, proxy) is used.
    // Try multiple Referer strategies: some sites block google.com referer (hotlink protection),
    // others require their own origin, others work with no Referer at all.
    const referers = [
      "https://www.google.com/",
      new URL(url).origin + "/",
      null,
    ];
    let res;
    for (const referer of referers) {
      const headers = { "User-Agent": UA, "Accept": ACCEPT };
      if (referer) headers["Referer"] = referer;
      res = await fetch(url, { headers });
      if (res.status !== 403) break;
      console.log(`[downloadAndIngest] 403 with Referer=${referer ?? "none"}, retrying…`);
    }
    if (res.status === 403) throw new Error("Image blocked (403 Forbidden). Save the image to your computer and drag the local file instead.");
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    console.log(`[downloadAndIngest] content-type: ${contentType}, ext: ${safeExt}`);
    if (!contentType.startsWith("image/")) {
      throw new Error(
        `URL did not return an image (content-type: ${contentType || "unknown"}). Try right-clicking the image and saving it, then drag the local file.`
      );
    }

    const ab = await res.arrayBuffer();
    console.log(`[downloadAndIngest] downloaded ${ab.byteLength} bytes → ${tempPath}`);
    await fs.promises.writeFile(tempPath, Buffer.from(ab));
    const result = await ingestPhoto(tempPath);
    return { path: tempPath, result };
  } catch (err) {
    try {
      await fs.promises.unlink(tempPath).catch(() => {});
    } catch (_) {}
    throw err;
  }
});

/* ---------- IPC: Firestore connection test ---------- */
ipcMain.handle("ufm:testFirestore", async () => {
  try {
    const snap = await firestoreDb.collection("product_vectors").limit(3).get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { ok: true, count: snap.size, totalDocs: snap.size, sample: docs };
  } catch (err) {
    console.error("[testFirestore] error:", err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("ufm:testGemini", async () => {
  return testGeminiConnection();
});

/* ---------- IPC: file picker dialog ---------- */
ipcMain.handle("ufm:openImageDialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

/* ---------- IPC: folder picker + recursive image scan ---------- */
const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i;

async function collectImagesRecursive(dirPath) {
  const results = [];
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectImagesRecursive(full)));
    } else if (entry.isFile() && IMAGE_EXTS.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

ipcMain.handle("ufm:openFolderDialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "multiSelections"],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  const allImages = [];
  for (const dir of result.filePaths) {
    try {
      allImages.push(...(await collectImagesRecursive(dir)));
    } catch (err) {
      console.warn("[openFolderDialog] failed to scan", dir, err.message);
    }
  }
  return allImages;
});

ipcMain.handle("ufm:openXlsxDialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("ufm:resolveDroppedPaths", async (_event, paths) => {
  const allImages = [];
  for (const p of paths) {
    try {
      const stat = await fs.promises.stat(p);
      if (stat.isDirectory()) {
        allImages.push(...(await collectImagesRecursive(p)));
      } else if (stat.isFile() && IMAGE_EXTS.test(p)) {
        allImages.push(p);
      }
    } catch {
      // ignore unreadable paths
    }
  }
  return allImages;
});

/* ---------- IPC: job queue ---------- */
const jobProcessor = getJobProcessor();

ipcMain.handle("ufm:startJob", async (event, job) => {
  console.log("[main] Starting job:", job.id, job.name);
  jobProcessor.enqueue(job);
  return { queued: true, jobId: job.id };
});

ipcMain.handle("ufm:getJobQueueStatus", async () => {
  return {
    queueLength: jobProcessor.getQueueLength(),
    isProcessing: jobProcessor.isProcessing,
    currentJobId: jobProcessor.currentJobId,
  };
});

ipcMain.handle("ufm:cancelJob", async (_, jobId) => {
  jobProcessor.cancelJob(jobId);
  return { ok: true };
});

/* ---------- IPC: batch DB upload ---------- */
ipcMain.handle("ufm:confirmDbImage", async (_, imagePath, action, parsed) => {
  if (action !== "add") {
    return { ok: false, error: "Invalid action" };
  }
  if (!imagePath || typeof imagePath !== "string") {
    return { ok: false, error: "Image path required" };
  }
  return confirmSingleImageToDb(imagePath, parsed || {});
});

ipcMain.handle("ufm:startDbBatch", async (_, paths) => {
  processDbBatch(
    paths,
    (data) => safeSend("ufm:dbBatchProgress", data),
    (data) => safeSend("ufm:dbBatchComplete", data)
  ).catch((err) => {
    console.error("[startDbBatch] batch failed:", err);
    safeSend("ufm:dbBatchComplete", {
      added: 0,
      duplicates: 0,
      skipped: 0,
      errors: Array.isArray(paths) ? paths.length : 0,
      error: err.message,
    });
  });
  return { ok: true };
});

ipcMain.handle("ufm:stopDbBatch", () => {
  requestBatchStop();
  return { ok: true };
});

ipcMain.handle("ufm:saveCombinationToDb", async (_, items) => {
  saveCombinationToDb(
    items,
    (data) => safeSend("ufm:saveCombinationProgress", data),
    (data) => safeSend("ufm:saveCombinationComplete", data)
  ).catch((err) => {
    console.error("[saveCombinationToDb] failed:", err);
    safeSend("ufm:saveCombinationComplete", { saved: 0, skipped: 0, errors: Array.isArray(items) ? items.length : 0, error: err.message });
  });
  return { ok: true };
});

ipcMain.handle("ufm:getTodaysSaves", async () => {
  return getTodaysSaves();
});

let _getDbStatsInflight = null;

ipcMain.handle("ufm:getDbStats", async () => {
  if (_getDbStatsInflight) {
    // #region agent log
    fetch("http://127.0.0.1:7335/ingest/c5a1bb77-37eb-41ef-948b-74b535c107ca", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2e2f6c" },
      body: JSON.stringify({
        sessionId: "2e2f6c",
        location: "main.js:ufm:getDbStats",
        message: "IPC deduped to in-flight request",
        data: {},
        hypothesisId: "B",
        timestamp: Date.now(),
        runId: "post-fix",
      }),
    }).catch(() => {});
    // #endregion
    return _getDbStatsInflight;
  }

  const LOG = (step, msg) => console.log(`[ufm:getDbStats IPC] [${step}]`, msg);
  const ipcId = `ipc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // #region agent log
  const { debugFirestoreInFlight } = await import("./ingestion/firebase.js");
  fetch("http://127.0.0.1:7335/ingest/c5a1bb77-37eb-41ef-948b-74b535c107ca", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2e2f6c" },
    body: JSON.stringify({
      sessionId: "2e2f6c",
      location: "main.js:ufm:getDbStats",
      message: "IPC handler start",
      data: { ipcId, firestoreInFlight: debugFirestoreInFlight },
      hypothesisId: "B",
      timestamp: Date.now(),
      runId: "post-fix",
    }),
  }).catch(() => {});
  // #endregion
  LOG("1", "IPC received.");

  _getDbStatsInflight = (async () => {
    try {
      const result = await getDbStats();
      LOG("2", "Success. Returning count=" + result.count);
      return result;
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn("[ufm:getDbStats IPC] [FAIL]", msg);
      return { count: 0, error: msg };
    } finally {
      _getDbStatsInflight = null;
    }
  })();

  return _getDbStatsInflight;
});

ipcMain.handle("ufm:checkDbStorage", async () => {
  try {
    return await checkDbStorageConsistency();
  } catch (err) {
    log.error("[ufm:checkDbStorage]", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
});

ipcMain.handle("ufm:fixDbStorage", async (_, report) => {
  try {
    return await fixDbStorageConsistency(report);
  } catch (err) {
    log.error("[ufm:fixDbStorage]", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
});

ipcMain.handle("ufm:scanNonProducts", async () => {
  scanAndRemoveNonProducts(
    (data) => safeSend("ufm:scanNonProductsProgress", data),
    (data) => safeSend("ufm:scanNonProductsComplete", data)
  ).catch((err) => {
    console.error("[scanNonProducts] Failed:", err);
    safeSend("ufm:scanNonProductsComplete", {
      scanned: 0,
      deleted: 0,
      errors: 1,
      error: err.message,
    });
  });
  return { ok: true };
});

ipcMain.handle("ufm:promoteSerperResults", async (_, items) => {
  promoteSerperResults(items).catch((err) =>
    console.warn("[promoteSerperResults] Background promotion failed:", err.message)
  );
  return { ok: true };
});

ipcMain.handle("ufm:recordSerperRejection", async (_, signal) => {
  recordSerperRejection(signal).catch((err) =>
    console.warn("[recordSerperRejection] Failed:", err.message)
  );
  return { ok: true };
});

ipcMain.handle("ufm:recordManualGoogleAccepted", async (_, signal) => {
  recordManualGoogleAccepted(signal).catch((err) =>
    console.warn("[recordManualGoogleAccepted] Failed:", err.message)
  );
  return { ok: true };
});

ipcMain.handle("ufm:getSerperLearningStats", async () => {
  try {
    return await getSerperLearningStats();
  } catch (err) {
    console.warn("[getSerperLearningStats] Failed:", err.message);
    return null;
  }
});

ipcMain.handle("ufm:reembedAllProducts", async () => {
  reembedAllProducts((data) => safeSend("ufm:reembedProgress", data))
    .then((result) => safeSend("ufm:reembedComplete", result))
    .catch((err) => safeSend("ufm:reembedComplete", { updated: 0, total: 0, errors: 1, error: err.message }));
  return { ok: true };
});

ipcMain.handle("ufm:cleanMessyTitles", async () => {
  cleanMessyTitleProducts(
    (data) => safeSend("ufm:cleanMessyTitlesProgress", data),
    (data) => safeSend("ufm:cleanMessyTitlesComplete", data)
  ).catch((err) => {
    console.error("[cleanMessyTitles] Failed:", err);
    safeSend("ufm:cleanMessyTitlesComplete", { deleted: 0, total: 0, errors: 1, error: err.message });
  });
  return { ok: true };
});

ipcMain.handle("ufm:deleteDbProduct", async (_, productId) => {
  await deleteProductFromDb(productId);
  return { ok: true };
});


ipcMain.handle("ufm:clearCutoutCache", async () => {
  const cutoutDir = path.resolve(__dirname, "../../../exports/cutouts");
  try {
    const files = await fs.promises.readdir(cutoutDir);
    await Promise.all(files.map((f) => fs.promises.unlink(path.join(cutoutDir, f))));
    return { cleared: files.length };
  } catch (err) {
    return { cleared: 0, error: err?.message || String(err) };
  }
});

ipcMain.handle("ufm:getCutoutCacheInfo", async () => {
  const cutoutDir = path.resolve(__dirname, "../../../exports/cutouts");
  try {
    const files = await fs.promises.readdir(cutoutDir);
    let sizeBytes = 0;
    await Promise.all(
      files.map(async (f) => {
        try {
          const stat = await fs.promises.stat(path.join(cutoutDir, f));
          sizeBytes += stat.size;
        } catch {}
      })
    );
    return { count: files.length, sizeBytes };
  } catch {
    return { count: 0, sizeBytes: 0 };
  }
});

/* ---------- IPC: App paths ---------- */
ipcMain.handle("ufm:getAppPaths", () => {
  const userDataPath = path.join(app.getPath("userData"), "firebase-service-account.json");
  const bundledPath = path.join(
    app.isPackaged ? process.resourcesPath : app.getAppPath(),
    "backend", "config", "firebase-service-account.json"
  );
  const candidates = [process.env.FIREBASE_CREDENTIALS, userDataPath, bundledPath];
  const foundPath = candidates.find(p => p && fs.existsSync(p));
  return {
    userData: app.getPath("userData"),
    firebaseCredential: userDataPath,
    firebaseCredentialExists: !!foundPath,
  };
});

/* ---------- IPC: API key config ---------- */
ipcMain.handle("ufm:getMissingKeys", () => global.__ufmMissingKeys ?? []);

ipcMain.handle("ufm:getConfig", () => {
  const stored = readUserConfig();
  return {
    requiredKeys: REQUIRED_KEYS.map(({ key, label, description, url }) => ({
      key, label, description, url,
      value: stored[key] ? "***" : "",
      isSet: !!(process.env[key] || stored[key]),
    })),
    optionalKeys: OPTIONAL_KEYS.map(({ key, label, description, url }) => ({
      key, label, description, url,
      value: stored[key] ? "***" : "",
      isSet: !!(process.env[key] || stored[key]),
    })),
  };
});

ipcMain.handle("ufm:saveConfig", (_, patch) => {
  const allowed = [...REQUIRED_KEYS, ...OPTIONAL_KEYS].map(k => k.key);
  const safe = Object.fromEntries(
    Object.entries(patch).filter(([k]) => allowed.includes(k) && typeof patch[k] === "string")
  );
  writeUserConfig(safe);
  global.__ufmMissingKeys = getMissingRequiredKeys().map(k => k.key);
  return { ok: true, missingKeys: global.__ufmMissingKeys };
});

ipcMain.handle("ufm:getRembgModel", () => {
  return readUserConfig().UFM_REMBG_MODEL || getResourceProfile().rembgModel;
});

ipcMain.handle("ufm:setRembgModel", (_, model) => {
  writeUserConfig({ UFM_REMBG_MODEL: String(model) });
  return { ok: true };
});

ipcMain.handle("ufm:getQuotaStatus", async () => {
  try {
    // Check credential paths in priority order (userData first, then bundled)
    const candidates = [
      process.env.FIREBASE_CREDENTIALS,
      path.join(app.getPath("userData"), "firebase-service-account.json"),
      path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), "backend", "config", "firebase-service-account.json"),
    ];
    const saPath = candidates.find(p => p && fs.existsSync(p));
    if (!saPath) {
      return getQuotaStatus();
    }
    const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
    const projectId  = sa.project_id;
    const bucketName = `${projectId}.firebasestorage.app`;
    return await getLiveQuotaStatus(projectId, bucketName, saPath);
  } catch (err) {
    console.warn("[ufm:getQuotaStatus] Live fetch failed, falling back to local:", err.message);
    return getQuotaStatus();
  }
});

/* ---------- Native context menu ---------- */
ipcMain.on("ufm:showContextMenu", (event, { itemId, actions }) => {
  const template = actions.map((action) => ({
    label: action.label,
    enabled: action.enabled !== false,
    click: () => {
      event.sender.send("ufm:contextMenuAction", { itemId, action: action.id });
    },
  }));
  const menu = Menu.buildFromTemplate(template);
  const win = BrowserWindow.fromWebContents(event.sender);
  menu.popup({ window: win });
});

/* ---------- Env validation ---------- */
const REQUIRED_KEYS = [
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek API Key", description: "Required for product name/price parsing", url: "https://platform.deepseek.com/api_keys" },
];
const OPTIONAL_KEYS = [
  { key: "SERPER_API_KEY", label: "Serper API Key", description: "Enables Google image search for products", url: "https://serper.dev/api-key" },
];

function getMissingRequiredKeys() {
  return REQUIRED_KEYS.filter(({ key }) => !String(process.env[key] || "").trim());
}

function validateEnv() {
  // PYTHON_BIN still required in dev (packaged app uses bundled binary)
  if (!app.isPackaged && !String(process.env.PYTHON_BIN || "").trim()) {
    throw new Error("Missing PYTHON_BIN environment variable.\n\nCopy .env.example to .env and set PYTHON_BIN to your Python 3.11 path.");
  }
  // Required API keys are now handled via in-app setup — don't quit here
  global.__ufmMissingKeys = getMissingRequiredKeys().map(k => k.key);
}

/* ---------- App bootstrap ---------- */
app.whenReady().then(async () => {
  const phases = {};
  phases.whenReady = Date.now() - PROCESS_T0;

  // Show splash immediately so the user sees something right away.
  createSplashWindow();

  try {
    // 0️⃣ Load user config (userData/ufm.config.json) then validate env
    loadUserConfig();
    validateEnv();
    log.info(`UFM starting — electron ${process.versions.electron}, node ${process.versions.node}`);

    // Check for crash from last run — no dialog; renderer shows progress overlay and auto-resumes
    const crashed = didCrashLastRun();
    if (crashed) {
      global.__ufmCrashedLastRun = true;
    }
    // Write sentinel — removed on clean exit
    writeSentinel();

    // 1️⃣ Start backend (selector-based)
    updateSplash("Starting image processing service…");
    const backend = await startBackend("cutout");
    phases.backendSpawn = Date.now() - PROCESS_T0;

    // 2️⃣ Wait for backend health
    updateSplash("Waiting for image processing service to be ready…");
    await waitForBackend(backend, (msg) => updateSplash(msg));
    phases.backendHealthy = Date.now() - PROCESS_T0;

    // 2b. Backend confirmed ready — now start the health watch
    startHealthWatch(backend);

    // 3️⃣ Init Firebase (idempotent; returns null if no credentials)
    updateSplash("Connecting to database…");
    const fbApp = initFirebase();
    phases.firebase = Date.now() - PROCESS_T0;

    // 3b. Load Serper learning weights (non-blocking; falls back to static scoring on error)
    initSerperScorer().catch(err => console.warn("[serperScorer] Init failed:", err.message));

    // 3c. Verify Firestore + kick off background embedding migration
    if (fbApp) {
      console.log("[firebase] [post-init] Running test query: product_vectors.limit(1)...");
      const adminT0 = Date.now();
      firestoreDb.collection("product_vectors").limit(1).get()
        .then((snap) => {
          console.log("[firebase] [post-init] ✅ Test query OK. Sample size:", snap.size);
          // #region agent log
          fetch("http://127.0.0.1:7335/ingest/c5a1bb77-37eb-41ef-948b-74b535c107ca", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2e2f6c" },
            body: JSON.stringify({
              sessionId: "2e2f6c",
              location: "main.js:post-init",
              message: "admin.firestore test ok",
              data: { ms: Date.now() - adminT0, client: "admin.firestore" },
              hypothesisId: "A",
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
        })
        .catch((err) => {
          console.warn("[firebase] [post-init] ❌ Test query failed:", err?.message?.slice(0, 100));
          // #region agent log
          fetch("http://127.0.0.1:7335/ingest/c5a1bb77-37eb-41ef-948b-74b535c107ca", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2e2f6c" },
            body: JSON.stringify({
              sessionId: "2e2f6c",
              location: "main.js:post-init",
              message: "admin.firestore test fail",
              data: { ms: Date.now() - adminT0, err: String(err?.message || err).slice(0, 120) },
              hypothesisId: "A",
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
        });

      // Re-embedding is triggered manually via the "Re-embed Products" button in DbUploadView.
    } else {
      console.warn("[firebase] [post-init] Skipping test query — Firebase not configured.");
    }

    // 4️⃣ Register IPC (backend info)
    registerBackendIpc();
    registerBackendProxyIpc();

    // 5️⃣ Wait for Vite dev server then create window (avoids ERR_CONNECTION_REFUSED when run with npm run dev)
    updateSplash("Loading interface…");
    await waitForVite("127.0.0.1", 5173, 60, 500);
    phases.viteReady = Date.now() - PROCESS_T0;
    createWindow();
    phases.windowCreated = Date.now() - PROCESS_T0;

    const totalMs = Date.now() - PROCESS_T0;
    log.info(
      `[startup] Main process ready in ${(totalMs / 1000).toFixed(2)}s` +
      ` | whenReady: ${phases.whenReady}ms` +
      ` | backend-spawn: ${phases.backendSpawn}ms` +
      ` | backend-healthy: ${phases.backendHealthy}ms` +
      ` | firebase: ${phases.firebase}ms` +
      ` | vite: ${phases.viteReady}ms` +
      ` | window: ${phases.windowCreated}ms`
    );

    // Store timing (including t0Absolute) so the renderer can compute its own delta
    global.__ufmStartupTiming = { totalMs, t0Absolute: PROCESS_T0, phases };

    // Close splash after window is visible
    setTimeout(() => closeSplash(), 400);

    // 6️⃣ Set up job processor event forwarding to renderer
    jobProcessor.on("progress", (jobId, progress) => {
      safeSend("ufm:jobProgress", { jobId, progress });
    });
    jobProcessor.on("complete", (jobId, result) => {
      safeSend("ufm:jobComplete", { jobId, result });
    });
    jobProcessor.on("error", (jobId, error) => {
      safeSend("ufm:jobError", { jobId, error: error?.message || String(error) });
    });
    jobProcessor.on("started", (jobId, data) => {
      safeSend("ufm:jobStarted", { jobId, ...data });
    });
    jobProcessor.on("itemComplete", (jobId, data) => {
      safeSend("ufm:jobItemComplete", { jobId, ...data });
    });
    jobProcessor.on("aborted", (jobId) => {
      safeSend("ufm:jobAborted", { jobId });
    });
  } catch (err) {
    log.error("App startup failed:", err);
    closeSplash();
    await dialog.showMessageBox({
      type: "error",
      title: "Ultimate Flyer Maker — Startup Failed",
      message: "The application could not start.",
      detail: err?.message || "An unexpected error occurred.",
      buttons: ["Quit"],
      defaultId: 0,
    });
    app.quit();
  }
});


app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
