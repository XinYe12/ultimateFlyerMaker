import { spawn } from "child_process";
import path from "path";
import { app } from "electron";
import "dotenv/config";
import fetch from "node-fetch";
import { BACKENDS } from "./backendRegistry.js";

let backendProcess = null;
let backendInfo = null;

async function isBackendAlive(host, port) {
  try {
    const res = await fetch(`http://${host}:${port}/health`, {
      timeout: 500,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startBackend(name = "cutout") {
  if (backendInfo) return backendInfo;

  const cfg = BACKENDS[name];
  if (!cfg) {
    throw new Error(`Unknown backend: ${name}`);
  }

  if (!cfg.port) {
    throw new Error("Backend port must be fixed in backendRegistry");
  }

  const backendRoot = path.join(app.getAppPath(), "backend", "src");
  const port = cfg.port;

  const pythonBin = process.env.PYTHON_BIN;
  if (!pythonBin) {
    throw new Error("PYTHON_BIN is not set");
  }

  // reuse existing backend if already running
  if (await isBackendAlive(cfg.host, port)) {
    backendInfo = {
      name,
      pid: null,
      host: cfg.host,
      port,
      url: `http://${cfg.host}:${port}`,
    };
    return backendInfo;
  }

backendProcess = spawn(
  pythonBin,
  [
    "-m",
    "uvicorn",
    "cutout_service.server:app",
    "--host",
    cfg.host,
    "--port",
    String(port),
  ],
  {
    cwd: backendRoot,
    env: {
      ...process.env,
      PATH: [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/usr/bin",
        "/bin",
        process.env.PATH || "",
      ].join(":"),
      PYTHONPATH: backendRoot,
    },
    stdio: "inherit",
  }
);


  backendProcess.on("exit", () => {
    backendProcess = null;
    backendInfo = null;
  });

  backendProcess.on("error", () => {
    backendProcess = null;
    backendInfo = null;
  });

  backendInfo = {
    name,
    pid: backendProcess.pid,
    host: cfg.host,
    port,
    url: `http://${cfg.host}:${port}`,
  };

  return backendInfo;
}

export function stopBackend() {
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    backendProcess = null;
    backendInfo = null;
  }
}

export function getBackendInfo() {
  return backendInfo;
}

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
  }
});

process.on("exit", () => {
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
  }
});
