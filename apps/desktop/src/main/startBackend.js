import { spawn } from "child_process";
import http from "http";
import path from "path";
import { app } from "electron";
import "dotenv/config";
import fetch from "node-fetch";
import { BACKENDS } from "./backendRegistry.js";

let backendProcess = null;
let backendInfo = null;
let healthInterval = null;
let consecutiveFailures = 0;
let isRestarting = false;
const HEALTH_INTERVAL_MS = 60_000; // check once per minute — exit event handles crashes
const FAILURE_THRESHOLD = 3;

function isBackendAlive(host, port) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value, reason) => {
      if (settled) return;
      settled = true;
      if (!value) console.warn("[isBackendAlive] failed:", reason);
      resolve(value);
    };

    const req = http.get(
      { host, port, path: "/health", agent: false },
      (res) => {
        res.resume();
        done(res.statusCode === 200, `status ${res.statusCode}`);
      }
    );
    req.setTimeout(3000, () => { req.destroy(); done(false, "timeout"); });
    req.on("error", (err) => done(false, err.message));
  });
}

function stopHealthWatch() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
  consecutiveFailures = 0;
}

export function startHealthWatch(cfg) {
  if (healthInterval) return;
  consecutiveFailures = 0;

  healthInterval = setInterval(async () => {
    if (isRestarting) return;

    const alive = await isBackendAlive(cfg.host, cfg.port);
    if (alive) {
      consecutiveFailures = 0;
      return;
    }

    consecutiveFailures++;
    console.warn(`[backend] health check failed (${consecutiveFailures}/${FAILURE_THRESHOLD})`);
    if (consecutiveFailures < FAILURE_THRESHOLD) return;

    isRestarting = true;
    consecutiveFailures = 0;
    console.error("[backend] unhealthy — attempting restart");
    stopHealthWatch();

    if (backendProcess) {
      try { backendProcess.kill("SIGTERM"); } catch {}
      backendProcess = null;
    }
    backendInfo = null;

    try {
      const newInfo = await startBackend(cfg.name);
      console.log("[backend] restart succeeded, pid:", newInfo.pid);
      startHealthWatch(cfg);
    } catch (err) {
      console.error("[backend] restart failed:", err.message);
    } finally {
      isRestarting = false;
    }
  }, HEALTH_INTERVAL_MS);
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
    startHealthWatch(cfg);
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

  // Health watch is started by the caller (main.js) after waitForBackend confirms readiness.
  // Exception: reuse path starts it immediately since backend is already confirmed alive.
  return backendInfo;
}

export function stopBackend() {
  stopHealthWatch();
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
