import { spawn } from "child_process";
import http from "http";
import fs from "fs";
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

// ── Diagnostic state (reset on each startBackend call) ────────────────────────
let stderrLines = [];
let backendExitedEarly = false;
let backendExitCode = null;

/** Returns stderr collected since the last startBackend() call. */
export function getBackendDiagnostics() {
  return {
    stderr: stderrLines.join(""),
    exitedEarly: backendExitedEarly,
    exitCode: backendExitCode,
  };
}

// ── Resolve the command to run (packaged binary vs Python) ────────────────────
function resolveBackendCommand(cfg) {
  // In a packaged app, prefer the bundled PyInstaller binary.
  if (app.isPackaged) {
    const ext = process.platform === "win32" ? ".exe" : "";

    // PyInstaller --onedir layout: resources/backend/cutout_service/cutout_service[.exe]
    const oneDirBin = path.join(
      process.resourcesPath, "backend", "cutout_service", `cutout_service${ext}`
    );
    // PyInstaller --onefile layout: resources/backend/cutout_service[.exe]
    const oneFileBin = path.join(
      process.resourcesPath, "backend", `cutout_service${ext}`
    );

    const binaryPath = fs.existsSync(oneDirBin) ? oneDirBin : oneFileBin;
    if (fs.existsSync(binaryPath)) {
      console.log("[startBackend] Using bundled binary:", binaryPath);
      return {
        cmd: binaryPath,
        args: ["--host", cfg.host, "--port", String(cfg.port)],
        cwd: path.dirname(binaryPath),
        env: { ...process.env },
      };
    }
    console.warn("[startBackend] Packaged binary not found; falling back to Python");
  }

  // Development / unpackaged: use PYTHON_BIN from .env
  const pythonBin = process.env.PYTHON_BIN;
  if (!pythonBin) {
    throw new Error(
      "PYTHON_BIN is not set.\n\nAdd it to your .env file pointing to Python 3.11.\nExample: PYTHON_BIN=/usr/local/bin/python3.11"
    );
  }

  const backendRoot = path.join(app.getAppPath(), "backend", "src");
  return {
    cmd: pythonBin,
    args: [
      "-m", "uvicorn", "cutout_service.server:app",
      "--host", cfg.host,
      "--port", String(cfg.port),
    ],
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
  };
}

// ── Health helpers ─────────────────────────────────────────────────────────────
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

// ── startBackend ───────────────────────────────────────────────────────────────
export async function startBackend(name = "cutout") {
  if (backendInfo) return backendInfo;

  // Reset diagnostics for this launch attempt
  stderrLines = [];
  backendExitedEarly = false;
  backendExitCode = null;

  const cfg = BACKENDS[name];
  if (!cfg) throw new Error(`Unknown backend: ${name}`);
  if (!cfg.port) throw new Error("Backend port must be fixed in backendRegistry");

  // Reuse if already running externally
  if (await isBackendAlive(cfg.host, cfg.port)) {
    backendInfo = {
      name,
      pid: null,
      host: cfg.host,
      port: cfg.port,
      url: `http://${cfg.host}:${cfg.port}`,
    };
    startHealthWatch(cfg);
    return backendInfo;
  }

  const { cmd, args, cwd, env } = resolveBackendCommand(cfg);

  backendProcess = spawn(cmd, args, {
    cwd,
    env,
    // inherit stdout so backend logs appear in terminal during dev;
    // pipe stderr so we can capture it for diagnostics.
    stdio: ["ignore", "inherit", "pipe"],
  });

  // Collect stderr for diagnostics, and forward it to the parent's stderr
  // so it still appears in the terminal during development.
  backendProcess.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    stderrLines.push(chunk.toString());
    if (stderrLines.length > 200) stderrLines.shift();
  });

  backendProcess.on("exit", (code) => {
    // Only flag as early exit while waitForBackend could still be polling.
    // (After health is confirmed, restarts are handled by startHealthWatch.)
    if (!backendInfo?.healthy) {
      backendExitedEarly = true;
      backendExitCode = code;
    }
    backendProcess = null;
    backendInfo = null;
  });

  backendProcess.on("error", (err) => {
    console.error("[startBackend] spawn error:", err.message);
    stderrLines.push(`spawn error: ${err.message}\n`);
    backendExitedEarly = true;
    backendExitCode = -1;
    backendProcess = null;
    backendInfo = null;
  });

  backendInfo = {
    name,
    pid: backendProcess.pid,
    host: cfg.host,
    port: cfg.port,
    url: `http://${cfg.host}:${cfg.port}`,
    healthy: false, // set to true by waitForBackend on success
  };

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
