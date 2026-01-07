import { app, BrowserWindow, ipcMain } from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import { fileURLToPath } from "url";
import { dialog, Menu, shell } from "electron";
import { processFlyerImage } from "./imagePipeline.js";
import { ingestPhoto } from "./ingestion/ingestPhoto.js";
import "dotenv/config";
import { parseDiscountText } from "./ipc/parseDiscountText.js";
import { exportDiscountImages } from "./ipc/exportDiscountImages.js";
import { parseDiscountXlsx } from "./ipc/parseDiscountXlsx.js";
import { ingestImages } from "./ipc/ingestImages.js";
import { startBackend, stopBackend } from "./startBackend.js";
import { waitForBackend } from "./waitForBackend.js";
import { initFirebase } from "./firebase.js";

app.on("before-quit", () => {
  stopBackend();
});


console.log("🔥 MAIN sees DEEPSEEK_API_KEY =", process.env.DEEPSEEK_API_KEY);
/* ---------- ESM __dirname fix (MUST BE FIRST) ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- Project paths ---------- */
const PROJECT_ROOT = path.resolve(__dirname, "../../../../");
const SERVICES_PATH = path.join(PROJECT_ROOT, "services");

/* ---------- Python environment (authoritative) ---------- */
process.env.PYTHONPATH = SERVICES_PATH;

/* ---------- Electron window ---------- */
let mainWindow = null;

function createWindow() {
  console.log("PRELOAD PATH =", path.join(__dirname, "preload.cjs"));

  const preloadPath = path.resolve(__dirname, "preload.cjs");
  console.log("✅ PRELOAD PATH =", preloadPath);

  console.log("USING PRELOAD:", preloadPath);

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

/* ---------- CUTOUT service launcher (DEV / macOS) ---------- */
function startCutoutService() {
  if (process.platform !== "darwin") return;

  const pythonPath =
    "/Users/xuxinye/Documents/projects/ultimate flyer make/services/cutout/.venv/bin/python";

  spawn(
    pythonPath,
    [
      "-m",
      "uvicorn",
      "cutout_service.server:app",
      "--host",
      "127.0.0.1",
      "--port",
      "17890",
      "--log-level",
      "info"
    ],
    {
      cwd: path.join(SERVICES_PATH, "cutout", "src"),
      env: {
        ...process.env,
        PYTHONPATH: SERVICES_PATH
      },
      stdio: "inherit"
    }
  );
}

async function ensureCutoutAlive() {
  const res = await fetch("http://127.0.0.1:17890/health");
  if (!res.ok) throw new Error("CUTOUT not healthy");
}

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
ipcMain.handle(
  "ufm:parseDiscountXlsx",
  parseDiscountXlsx
);

ipcMain.handle(
  "ufm:parseDiscountText",
  parseDiscountText
);


/* ---------- IPC: export discount labels ---------- */
ipcMain.handle("ufm:exportDiscountImages", (_event, items) => {
  return exportDiscountImages(items);
});

ipcMain.handle("ingestImages", ingestImages);

app.whenReady().then(async () => {
  // 1️⃣ Start backend (Python / FastAPI)
  startBackend();
  initFirebase();          // 🔥 ADD THIS

  // 2️⃣ Wait until backend is healthy
  await waitForBackend({ port: 8000 });

  // 3️⃣ Create Electron window
  createWindow();
});


app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
