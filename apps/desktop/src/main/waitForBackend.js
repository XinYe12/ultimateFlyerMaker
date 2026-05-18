import http from "http";
import { getBackendDiagnostics } from "./startBackend.js";

const MAX_RETRIES = 360;  // 3 minutes total (360 × 500 ms) — first run downloads rembg model (~1 GB)
const INTERVAL_MS = 500;

function parseSplashMessage(stderr) {
  // tqdm download bar: "  15%|#####  | 144M/973M [00:10<00:53, 15.5MB/s]"
  const dlMatch = stderr.match(/\s*(\d+)%\|[^|]*\|\s*([\d.]+\s*\w+)\/([\d.]+\s*\w+)/);
  if (dlMatch) {
    return `Downloading AI model: ${dlMatch[1]}% (${dlMatch[2]} / ${dlMatch[3]})\nFirst run only — this won't happen again.`;
  }
  // Model load message
  if (stderr.includes("loading rembg model") || stderr.includes("birefnet")) {
    return "Loading background removal model…\nFirst run only — this won't happen again.";
  }
  return null;
}

export function waitForBackend(backend, onProgress) {
  if (!backend?.url) {
    return Promise.reject(
      new Error("waitForBackend called without backend.url")
    );
  }

  const url = `${backend.url}/health`;
  let attempts = 0;
  let lastSplashMsg = null;

  return new Promise((resolve, reject) => {
    const check = () => {
      // Short-circuit immediately if the backend process already died.
      const diag = getBackendDiagnostics();
      if (diag.exitedEarly) {
        reject(buildStartupError(backend.name, diag));
        return;
      }

      attempts++;

      // After 3 s, start forwarding download/model-load progress to splash
      if (onProgress && attempts > 6 && diag.stderr) {
        const msg = parseSplashMessage(diag.stderr);
        if (msg && msg !== lastSplashMsg) {
          lastSplashMsg = msg;
          onProgress(msg);
        }
      }

      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          let data = "";
          res.on("data", chunk => { data += chunk; });
          res.on("end", () => {
            try {
              const body = JSON.parse(data);
              if (body.ready) {
                console.log(`✅ Backend [${backend.name}] is healthy and ready`);
                if (backend.healthy !== undefined) backend.healthy = true;
                resolve();
              } else {
                retry();
              }
            } catch {
              retry();
            }
          });
        } else {
          retry();
        }
      });

      req.on("error", retry);
      req.end();
    };

    const retry = () => {
      if (attempts >= MAX_RETRIES) {
        reject(buildStartupError(backend.name, getBackendDiagnostics()));
        return;
      }
      setTimeout(check, INTERVAL_MS);
    };

    check();
  });
}

/**
 * Builds a user-friendly Error from backend diagnostic data.
 * Parses common Python failure patterns into actionable messages.
 */
function buildStartupError(name, diag) {
  const stderr = (diag.stderr || "").trim();

  // Python import failed ─────────────────────────────────────────────────────
  if (stderr.includes("ModuleNotFoundError") || stderr.includes("No module named")) {
    const match = stderr.match(/No module named '([^']+)'/);
    const mod = match ? match[1] : "a required package";
    return new Error(
      `Image processing service failed: Python package "${mod}" is not installed.\n\n` +
      `Fix: activate your virtual environment and run:\n` +
      `  pip install -r apps/desktop/backend/requirements.txt`
    );
  }

  // Port conflict ────────────────────────────────────────────────────────────
  if (
    stderr.includes("Address already in use") ||
    stderr.includes("address already in use") ||
    stderr.includes("Only one usage of each socket")
  ) {
    return new Error(
      `Image processing service failed: port ${name === "cutout" ? process.env.UFM_PORT || 17890 : ""} is already in use.\n\n` +
      `Fix: quit any other running instances of the app, then relaunch.`
    );
  }

  // Python binary not found / bad PYTHON_BIN ────────────────────────────────
  if (
    stderr.includes("command not found") ||
    stderr.includes("No such file or directory") ||
    diag.exitCode === 127 ||
    diag.exitCode === 2
  ) {
    return new Error(
      `Image processing service failed: Python executable not found.\n\n` +
      `Fix: check that PYTHON_BIN in your .env file points to a valid Python 3.11 binary.\n` +
      `Current value: ${process.env.PYTHON_BIN || "(not set)"}`
    );
  }

  // Permission denied ────────────────────────────────────────────────────────
  if (stderr.includes("Permission denied") || diag.exitCode === 126) {
    return new Error(
      `Image processing service failed: permission denied when launching the backend.\n\n` +
      `Fix: make sure the Python binary and backend files are executable.`
    );
  }

  // Process crashed with output ──────────────────────────────────────────────
  if (diag.exitedEarly && stderr) {
    const tail = stderr.length > 800 ? "…\n" + stderr.slice(-800) : stderr;
    return new Error(
      `Image processing service crashed on startup (exit code ${diag.exitCode ?? "?"}):\n\n${tail}`
    );
  }

  // Generic timeout — no stderr captured ────────────────────────────────────
  return new Error(
    `Image processing service [${name}] did not become ready within 3 minutes.\n\n` +
    (stderr
      ? `Last output:\n${stderr.slice(-400)}`
      : "No output was captured. Verify that PYTHON_BIN is set correctly in your .env file.")
  );
}
