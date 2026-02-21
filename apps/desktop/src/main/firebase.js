// ✅ FIREBASE ADMIN — ELECTRON-SAFE SINGLETON

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { app } from "electron";

function resolveServiceAccountPath() {
  const base = app.isPackaged
    ? process.resourcesPath
    : app.getAppPath();

  return path.join(
    base,
    "backend",
    "config",
    "firebase-service-account.json"
  );
}

export function initFirebase() {
  console.log("[firebase main] initFirebase() called. admin.apps.length=" + admin.apps.length);
  if (admin.apps.length > 0) {
    console.log("[firebase main] Firebase already initialized (by ingestion/firebase.js), skipping.");
    return admin.app();
  }

  const serviceAccountPath = resolveServiceAccountPath();
  console.log("[firebase main] Service account path:", serviceAccountPath);
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`[firebase] service account NOT FOUND: ${serviceAccountPath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
  console.log("[firebase main] Initializing app, project_id=" + serviceAccount.project_id);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
  });

  console.log("[firebase main] App initialized.");
  return admin.app();
}

export { admin };
