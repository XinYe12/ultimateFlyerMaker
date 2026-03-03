import { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage } from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import { fileURLToPath } from "url";
import "dotenv/config";

import { processFlyerImage } from "./imagePipeline.js";
import { ingestPhoto } from "./ingestion/ingestPhoto.js";
import { parseDiscountText } from "./ipc/parseDiscountText.js";
import { exportDiscountImages } from "./ipc/exportDiscountImages.js";
import { parseDiscountXlsx } from "./ipc/parseDiscountXlsx.js";
import { ingestImages } from "./ipc/ingestImages.js";
import { getJobProcessor } from "./jobs/JobProcessor.js";
import { searchForDiscountItem } from "./ingestion/searchService.js";
import { braveImageSearchByQuery } from "./ingestion/braveSearchService.js";
import { googleImageSearch, googleKeysPresent } from "./ingestion/googleImageSearchService.js";
import os from "os";

import { startBackend, stopBackend, startHealthWatch } from "./startBackend.js";
import { waitForBackend } from "./waitForBackend.js";
import { initFirebase, admin } from "./firebase.js";
import { registerBackendIpc } from "./ipc/backend.js";
import { registerBackendProxyIpc } from "./ipc/backendProxy.js";
import { processDbBatch, getDbStats, checkDbStorageConsistency, fixDbStorageConsistency, confirmSingleImageToDb, scanAndRemoveNonProducts, deleteProductFromDb } from "./ipc/batchIngestToDB.js";
import { getQuotaStatus, getLiveQuotaStatus } from "./ipc/quotaTracker.js";
import { checkOllamaStatus } from "./ingestion/imageEmbeddingService.js";
import "./net/longFetch.js";
import log from "./logger.js";

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
    height: 240,
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
});

/* ---------- IPC: native file drag (for Google Lens) ---------- */
ipcMain.on("ufm:startDrag", (event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return;
  const icon = nativeImage.createFromPath(filePath).resize({ width: 100 });
  event.sender.startDrag({ file: filePath, icon });
});

/* ---------- IPC: crash recovery flag ---------- */
ipcMain.handle("ufm:didCrashLastRun", () => {
  const crashed = !!global.__ufmCrashedLastRun;
  global.__ufmCrashedLastRun = false; // consume once
  return crashed;
});

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

/* ---------- IPC: parsing ---------- */
ipcMain.handle("ufm:parseDiscountXlsx", async (event, ...args) => {
  try {
    return await parseDiscountXlsx(event, ...args);
  } catch (err) {
    log.error("[ufm:parseDiscountXlsx]", err);
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
ipcMain.handle("ufm:searchDatabaseByText", async (_, query) => {
  try {
    if (!query || !String(query).trim()) return [];
    return await searchForDiscountItem({ en: String(query).trim() }, 6);
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
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  const safeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
  const tempPath = path.join(os.tmpdir(), `ufm-download-${Date.now()}${safeExt}`);

  try {
    console.log(`[downloadAndIngest] fetching: ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    console.log(`[downloadAndIngest] content-type: ${contentType}, ext: ${safeExt}`);
    if (!contentType.startsWith("image/")) {
      throw new Error(
        `URL did not return an image (content-type: ${contentType || "unknown"})`
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
    const db = admin.firestore();
    const snap = await db.collection("product_vectors").limit(3).get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Strip embedding arrays to keep the response small
    for (const doc of docs) {
      if (doc.embedding) doc.embedding = `[${doc.embedding.length} floats]`;
    }
    return { ok: true, count: snap.size, totalDocs: snap.size, sample: docs };
  } catch (err) {
    console.error("[testFirestore] error:", err);
    return { ok: false, error: err.message };
  }
});

/* ---------- IPC: file picker dialog ---------- */
ipcMain.handle("ufm:openImageDialog", async () => {
  const result = await dialog.showOpenDialog({
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
  const result = await dialog.showOpenDialog({
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
  const result = await dialog.showOpenDialog({
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

/* ---------- IPC: batch DB upload ---------- */
ipcMain.handle("ufm:confirmDbImage", async (_, imagePath, action, parsed, embedding) => {
  if (action !== "add") {
    return { ok: false, error: "Invalid action" };
  }
  if (!imagePath || typeof imagePath !== "string") {
    return { ok: false, error: "Image path required" };
  }
  return confirmSingleImageToDb(imagePath, parsed || {}, embedding || []);
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

const DB_STATS_TIMEOUT_MS = 10000;

ipcMain.handle("ufm:getDbStats", async () => {
  const LOG = (step, msg) => console.log(`[ufm:getDbStats IPC] [${step}]`, msg);
  LOG("1", "IPC received. Starting " + DB_STATS_TIMEOUT_MS + "ms timeout race...");
  const timeout = new Promise((_, reject) =>
    setTimeout(() => {
      console.warn("[ufm:getDbStats IPC] [TIMEOUT] " + DB_STATS_TIMEOUT_MS + "ms elapsed, aborting.");
      reject(new Error("Connection timed out (10s). Check VPN/network."));
    }, DB_STATS_TIMEOUT_MS)
  );
  try {
    const result = await Promise.race([getDbStats(), timeout]);
    LOG("2", "Success. Returning count=" + result.count);
    return result;
  } catch (err) {
    const msg = err?.message || String(err);
    console.warn("[ufm:getDbStats IPC] [FAIL]", msg);
    return { count: 0, error: msg };
  }
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

ipcMain.handle("ufm:deleteDbProduct", async (_, productId) => {
  await deleteProductFromDb(productId);
  return { ok: true };
});

ipcMain.handle("ufm:checkOllamaStatus", async () => {
  try {
    return await checkOllamaStatus();
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
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

ipcMain.handle("ufm:getQuotaStatus", async () => {
  try {
    const saPath = path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      "backend", "config", "firebase-service-account.json"
    );
    if (!fs.existsSync(saPath)) {
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

/* ---------- Env validation ---------- */
function validateEnv() {
  const required = [
    ["DEEPSEEK_API_KEY", "Required for OCR text parsing and discount text input"],
    // PYTHON_BIN is only required in dev; packaged app uses the bundled binary.
    ...(!app.isPackaged ? [["PYTHON_BIN", "Required to start the image processing backend"]] : []),
  ];
  const missing = required.filter(([key]) => !String(process.env[key] || "").trim());
  if (missing.length > 0) {
    const lines = missing.map(([k, desc]) => `  ${k} — ${desc}`).join("\n");
    throw new Error(`Missing required environment variables:\n${lines}\n\nCopy .env.example to .env and fill in your values.`);
  }
}

/* ---------- App bootstrap ---------- */
app.whenReady().then(async () => {
  // Show splash immediately so the user sees something right away.
  createSplashWindow();

  try {
    // 0️⃣ Validate required environment variables before doing anything else
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

    // 2️⃣ Wait for backend health
    updateSplash("Waiting for image processing service to be ready…");
    await waitForBackend(backend);

    // 2b. Backend confirmed ready — now start the health watch
    startHealthWatch(backend);

    // 3️⃣ Init Firebase (idempotent)
    updateSplash("Connecting to database…");
    initFirebase();

    // 3b. Verify Firestore in background — do not block window from opening
    console.log("[firebase] [post-init] Running test query: product_vectors.limit(1)...");
    admin.firestore().collection("product_vectors").limit(1).get()
      .then(snap => console.log("[firebase] [post-init] ✅ Test query OK. Sample size:", snap.size))
      .catch(err => console.warn("[firebase] [post-init] ❌ Test query failed:", err?.message?.slice(0, 100)));

    // 4️⃣ Register IPC (backend info)
    registerBackendIpc();
    registerBackendProxyIpc();

    // 5️⃣ Wait for Vite dev server then create window (avoids ERR_CONNECTION_REFUSED when run with npm run dev)
    updateSplash("Loading interface…");
    await waitForVite("127.0.0.1", 5173, 60, 500);
    createWindow();

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
    jobProcessor.on("preflight", (jobId, data) => {
      safeSend("ufm:jobPreflight", { jobId, ...data });
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
