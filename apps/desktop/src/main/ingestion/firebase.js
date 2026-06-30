// ✅ ELECTRON MAIN — SAFE, DEV + PROD, WINDOWS-SAFE
// Lazy graceful init: app starts even without credentials; DB calls fail with a clear message.

import { readFileSync, existsSync, appendFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { app } from "electron";
import admin from "firebase-admin";

const LOG = (step, msg) => console.log(`[firebase] [${step}]`, msg);

/** Serialize Firestore I/O — parallel .get() calls on one client cause hangs on Windows. */
let _serial = Promise.resolve();
export function runFirestoreSerial(fn) {
  const run = _serial.then(() => fn());
  _serial = run.catch(() => {});
  return run;
}

/**
 * Queue a Firestore op, then start its timeout only once it reaches the front of the queue.
 * (Timeouts must NOT start at enqueue time — that caused false timeouts under load.)
 */
export function runFirestoreTimed(fn, timeoutMs, onTimeout) {
  return runFirestoreSerial(() => {
    if (!timeoutMs) return fn();
    let timeoutId;
    const timerP = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        onTimeout?.();
        reject(new Error(`Firestore timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return Promise.race([fn(), timerP]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  });
}

// #region agent log
const _DEBUG_LOG_CANDIDATES = [
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../debug-2e2f6c.log"),
  path.join(app.getAppPath(), "debug-2e2f6c.log"),
  path.join(app.getPath("userData"), "debug-2e2f6c.log"),
  path.join(process.cwd(), "debug-2e2f6c.log"),
];
let _debugLogPath = null;
function _resolveDebugLogPath() {
  if (_debugLogPath) return _debugLogPath;
  for (const p of _DEBUG_LOG_CANDIDATES) {
    try {
      appendFileSync(p, "", { flag: "a" });
      _debugLogPath = p;
      console.log("[firebase] debug log →", p);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}
const _dbgLog = (location, message, data, hypothesisId) => {
  if (app.isPackaged) return;
  const payload = {
    sessionId: "2e2f6c",
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
  };
  const logPath = _resolveDebugLogPath();
  if (logPath) {
    try {
      appendFileSync(logPath, `${JSON.stringify(payload)}\n`, "utf8");
    } catch {
      /* ignore */
    }
  }
  fetch("http://127.0.0.1:7335/ingest/c5a1bb77-37eb-41ef-948b-74b535c107ca", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2e2f6c" },
    body: JSON.stringify(payload),
  }).catch(() => {});
};
export let debugFirestoreInFlight = 0;
export function debugFirestoreTrack(op, phase, extra = {}) {
  if (phase === "start") debugFirestoreInFlight += 1;
  else if (phase === "end") debugFirestoreInFlight = Math.max(0, debugFirestoreInFlight - 1);
  _dbgLog("firebase.js:track", `firestore ${phase}`, { op, inFlight: debugFirestoreInFlight, ...extra }, "B");
}
// #endregion

/**
 * Credential resolution priority:
 *  1. FIREBASE_CREDENTIALS env var (absolute path)
 *  2. <userData>/firebase-service-account.json  (end-user drop location)
 *  3. <appPath>/backend/config/firebase-service-account.json  (dev/bundled copy)
 */
function resolveCredentialPath() {
  if (process.env.FIREBASE_CREDENTIALS && existsSync(process.env.FIREBASE_CREDENTIALS)) {
    LOG("creds", "Using FIREBASE_CREDENTIALS env var: " + process.env.FIREBASE_CREDENTIALS);
    return process.env.FIREBASE_CREDENTIALS;
  }
  const userData = path.join(app.getPath("userData"), "firebase-service-account.json");
  if (existsSync(userData)) {
    LOG("creds", "Using userData credential: " + userData);
    return userData;
  }
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, "backend", "config", "firebase-service-account.json")
    : path.join(app.getAppPath(), "backend", "config", "firebase-service-account.json");
  if (existsSync(bundled)) {
    LOG("creds", "Using bundled credential: " + bundled);
    return bundled;
  }
  return null;
}

function makeUnconfiguredProxy() {
  const msg =
    "[firebase] No service account credentials found. " +
    "Place firebase-service-account.json in your app data folder or set FIREBASE_CREDENTIALS.";
  return new Proxy({}, {
    get() { throw new Error(msg); },
    apply() { throw new Error(msg); },
  });
}

let db;
try {
  const credPath = resolveCredentialPath();
  if (!credPath) {
    LOG("init", "⚠️ No credentials found — Firestore disabled");
    db = makeUnconfiguredProxy();
  } else {
    const serviceAccount = JSON.parse(readFileSync(credPath, "utf8"));
    const projectId = serviceAccount.project_id;
    const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
    const emulator = process.env.FIRESTORE_EMULATOR_HOST;
    LOG("init", `project_id=${projectId} databaseId=${databaseId} emulator=${emulator || "(none)"}`);

    if (emulator) LOG("init", "FIRESTORE_EMULATOR_HOST set → using emulator: " + emulator);

    const fbApp = !getApps().length
      ? initializeApp({
          credential: cert(serviceAccount),
          storageBucket: `${projectId}.firebasestorage.app`,
        })
      : getApps()[0];

    db = databaseId !== "(default)"
      ? getFirestore(fbApp, databaseId)
      : getFirestore(fbApp);

    // Switch to HTTP/1.1 REST transport. gRPC channels go stale on Windows
    // (NAT/proxy drops the TCP connection and the channel never reconnects).
    // All our Firestore calls are one-shot .get() queries so REST is fine.
    db.settings({ preferRest: true });

    LOG("init", "Firestore client ready (REST transport). Collection: product_vectors");
    // #region agent log
    _dbgLog(
      "firebase.js:init",
      "ingestion Firestore ready",
      {
        preferRest: true,
        modularApps: getApps().length,
        adminApps: admin.apps.length,
        sameApp: getApps()[0]?.name === admin.apps[0]?.name,
      },
      "A"
    );
    // #endregion
  }
} catch (err) {
  LOG("init", "❌ Firebase init failed: " + err.message);
  db = makeUnconfiguredProxy();
}

export { db };
