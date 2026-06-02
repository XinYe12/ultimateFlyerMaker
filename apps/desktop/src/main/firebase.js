// ✅ FIREBASE ADMIN — ELECTRON-SAFE SINGLETON
// Returns null from initFirebase() if no credentials found — app starts without Firebase.

import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { app } from "electron";

/**
 * Credential resolution priority:
 *  1. FIREBASE_CREDENTIALS env var (absolute path)
 *  2. <userData>/firebase-service-account.json  (end-user drop location)
 *  3. <appPath>/backend/config/firebase-service-account.json  (dev/bundled copy)
 */
function resolveServiceAccountPath() {
  if (process.env.FIREBASE_CREDENTIALS && fs.existsSync(process.env.FIREBASE_CREDENTIALS)) {
    return process.env.FIREBASE_CREDENTIALS;
  }
  const userData = path.join(app.getPath("userData"), "firebase-service-account.json");
  if (fs.existsSync(userData)) return userData;

  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const bundled = path.join(base, "backend", "config", "firebase-service-account.json");
  if (fs.existsSync(bundled)) return bundled;

  return null;
}

function applyPreferRest() {
  try {
    const fsDb = admin.apps.length ? getFirestore(admin.app()) : null;
    if (fsDb) fsDb.settings({ preferRest: true });
  } catch (err) {
    console.warn("[firebase main] preferRest settings:", err?.message);
  }
}

export function initFirebase() {
  console.log("[firebase main] initFirebase() called. admin.apps.length=" + admin.apps.length);
  if (admin.apps.length > 0) {
    console.log("[firebase main] Firebase already initialized, skipping.");
    applyPreferRest();
    return admin.app();
  }

  const serviceAccountPath = resolveServiceAccountPath();
  if (!serviceAccountPath) {
    console.warn(
      "[firebase main] ⚠️ No service account credentials found. " +
      "Firebase features disabled. Drop firebase-service-account.json into your app data folder."
    );
    return null;
  }

  console.log("[firebase main] Service account path:", serviceAccountPath);
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
  console.log("[firebase main] Initializing app, project_id=" + serviceAccount.project_id);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
  });
  applyPreferRest();

  console.log("[firebase main] App initialized.");
  return admin.app();
}

export { admin };
