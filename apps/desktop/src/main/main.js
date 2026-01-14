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

import { startBackend, stopBackend } from "./startBackend.js";
import { waitForBackend } from "./waitForBackend.js";
import { initFirebase } from "./firebase.js";
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

/* ---------- App bootstrap ---------- */
app.whenReady().then(async () => {
  try {
    // 1️⃣ Start backend (selector-based)
    const backend = await startBackend("cutout");

    // 2️⃣ Wait for backend health
    await waitForBackend(backend);

    // 3️⃣ Init Firebase (idempotent)
    initFirebase();

    // 4️⃣ Register IPC (backend info)
    registerBackendIpc();
    registerBackendProxyIpc();


    // 5️⃣ Create window
    createWindow();
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
