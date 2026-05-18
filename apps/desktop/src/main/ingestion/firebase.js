// ✅ ELECTRON MAIN — SAFE, DEV + PROD, WINDOWS-SAFE
// Lazy graceful init: app starts even without credentials; DB calls fail with a clear message.

import { readFileSync, existsSync } from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { app } from "electron";

const LOG = (step, msg) => console.log(`[firebase] [${step}]`, msg);

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
  }
} catch (err) {
  LOG("init", "❌ Firebase init failed: " + err.message);
  db = makeUnconfiguredProxy();
}

export { db };
