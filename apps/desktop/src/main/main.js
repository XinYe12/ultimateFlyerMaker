import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from "electron";
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

/* ---------- Electron window ---------- */
let mainWindow = null;

function createWindow() {
  const preloadPath = path.resolve(__dirname, "preload.cjs");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  mainWindow.loadURL("http://localhost:5173");
  mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ---------- App lifecycle ---------- */
app.on("before-quit", () => {
  stopBackend();
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

ipcMain.handle("ufm:downloadAndIngestFromUrl", async (_, publicUrl) => {
  if (!publicUrl || !String(publicUrl).trim()) {
    throw new Error("Missing publicUrl");
  }
  const url = String(publicUrl).trim();
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  const safeExt = /^\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
  const tempPath = path.join(os.tmpdir(), `ufm-download-${Date.now()}${safeExt}`);

  try {
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const ab = await res.arrayBuffer();
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
    // 1️⃣ Start backend (selector-based)
    const backend = await startBackend("cutout");

    // 2️⃣ Wait for backend health
    await waitForBackend(backend);

    // 3️⃣ Init Firebase (idempotent)
    initFirebase();

    // 3b. Verify Firestore connection (log only; do not block startup)
    try {
      const db = admin.firestore();
      const snap = await db.collection("product_vectors").limit(1).get();
      console.log("[firebase] ✅ Firestore connected. product_vectors sample size:", snap.size);
    } catch (err) {
      console.warn("[firebase] ⚠️ Firestore check failed (connection or permissions):", err.message);
    }

    // 4️⃣ Register IPC (backend info)
    registerBackendIpc();
    registerBackendProxyIpc();


    // 5️⃣ Create window
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
