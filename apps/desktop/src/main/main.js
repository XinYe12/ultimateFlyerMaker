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



/* ---------- __dirname fix (ESM) ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- Electron window ---------- */
let mainWindow = null;

function createWindow() {
  const preloadPath = path.resolve(
    __dirname,
    "preload.js"
  );

  console.log("USING PRELOAD:", preloadPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
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
      cwd: path.join(process.cwd(), "../../services/cutout/src"),
      env: {
        ...process.env,
        PYTHONPATH: path.join(process.cwd(), "../../services/cutout/src")
      },
      stdio: "inherit"
    }
  );
}

async function ensureCutoutAlive() {
  const res = await fetch("http://127.0.0.1:17890/health");
  if (!res.ok) throw new Error("CUTOUT not healthy");
}


/* ---------- IPC: batch cutout (SINGLE SOURCE OF TRUTH) ---------- */
ipcMain.handle("batch-cutout", async (_, filePaths) => {
  console.log("IPC batch-cutout CALLED");
  console.log("FILES:", filePaths);

  const results = [];
  const totalStart = Date.now();

  for (const filePath of filePaths) {
    console.log("CUTOUT START:", filePath);

    const flyerItem = { image: { src: filePath } };

    const start = Date.now();
    await processFlyerImage(flyerItem);
    const end = Date.now();

    console.log("CUTOUT DONE:", filePath);

    results.push({
      input: filePath,
      output: flyerItem.image.src,
      seconds: ((end - start) / 1000).toFixed(2)
    });
  }

  const totalEnd = Date.now();
  console.log("BATCH DONE");

  return {
    results,
    totalSeconds: ((totalEnd - totalStart) / 1000).toFixed(2)
  };
});


ipcMain.handle("ufm:ingestPhoto", async (_, inputPath) => {
  return ingestPhoto(inputPath);
});
/* ---------- App lifecycle ---------- */
app.whenReady().then(() => {
  startCutoutService();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
