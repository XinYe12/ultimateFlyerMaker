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
import { searchByText } from "./ingestion/searchService.js";
import { braveImageSearchByQuery } from "./ingestion/braveSearchService.js";
import { googleImageSearch, googleKeysPresent } from "./ingestion/googleImageSearchService.js";
import os from "os";

import { startBackend, stopBackend } from "./startBackend.js";
import { waitForBackend } from "./waitForBackend.js";
import { initFirebase, admin } from "./firebase.js";
import { registerBackendIpc } from "./ipc/backend.js";
import { registerBackendProxyIpc } from "./ipc/backendProxy.js";
import "./net/longFetch.js";

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

/* ---------- Electron window ---------- */
let mainWindow = null;
let googleSearchWindow = null;
let forceQuit = false;

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
  mainWindow.webContents.openDevTools();

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

/* ---------- IPC: batch cutout ---------- */
ipcMain.handle("batch-cutout", async (_, filePaths) => {
  const results = [];
  const totalStart = Date.now();

  for (const filePath of filePaths) {
    const flyerItem = { image: { src: filePath } };

    const start = Date.now();
    await processFlyerImage(flyerItem);
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
  return ingestPhoto(inputPath);
});

/* ---------- IPC: parsing ---------- */
ipcMain.handle("ufm:parseDiscountXlsx", parseDiscountXlsx);
ipcMain.handle("ufm:parseDiscountText", parseDiscountText);

/* ---------- IPC: export discount labels ---------- */
ipcMain.handle("ufm:exportDiscountImages", (_event, items) => {
  return exportDiscountImages(items);
});

ipcMain.handle("ingestImages", ingestImages);

/* ---------- IPC: DB search (Replace → Database Results) ---------- */
ipcMain.handle("ufm:searchDatabaseByText", async (_, query) => {
  try {
    if (!query || !String(query).trim()) return [];
    return await searchByText(String(query).trim(), 6, 0.15);
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
    const res = await fetch(url, { timeout: 15000 });
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

/* ---------- App bootstrap ---------- */
app.whenReady().then(async () => {
  try {
    // 0️⃣ Check for crash from last run — no dialog; renderer shows progress overlay and auto-resumes
    const crashed = didCrashLastRun();
    if (crashed) {
      global.__ufmCrashedLastRun = true;
    }
    // Write sentinel — removed on clean exit
    writeSentinel();

    // 1️⃣ Start backend (selector-based)
    const backend = await startBackend("cutout");

    // 2️⃣ Wait for backend health
    await waitForBackend(backend);

    // 3️⃣ Init Firebase (idempotent)
    initFirebase();

    // 3b. Verify Firestore in background — do not block window from opening
    admin.firestore().collection("product_vectors").limit(1).get()
      .then(snap => console.log("[firebase] ✅ Firestore connected. product_vectors sample size:", snap.size))
      .catch(err => console.warn("[firebase] ⚠️ Firestore check failed (connection or permissions):", err.message));

    // 4️⃣ Register IPC (backend info)
    registerBackendIpc();
    registerBackendProxyIpc();

    // 5️⃣ Wait for Vite dev server then create window (avoids ERR_CONNECTION_REFUSED when run with npm run dev)
    await waitForVite("127.0.0.1", 5173, 60, 500);
    createWindow();

    // 6️⃣ Set up job processor event forwarding to renderer
    jobProcessor.on("progress", (jobId, progress) => {
      mainWindow?.webContents.send("ufm:jobProgress", { jobId, progress });
    });
    jobProcessor.on("complete", (jobId, result) => {
      mainWindow?.webContents.send("ufm:jobComplete", { jobId, result });
    });
    jobProcessor.on("error", (jobId, error) => {
      mainWindow?.webContents.send("ufm:jobError", { jobId, error: error?.message || String(error) });
    });
  } catch (err) {
    console.error("❌ App startup failed:", err);
    dialog.showErrorBox(
      "Startup Error",
      err?.message || "Failed to start application"
    );
    app.quit();
  }
});


app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
