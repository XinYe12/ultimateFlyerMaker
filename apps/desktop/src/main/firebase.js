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
  // 🔒 REAL singleton guard (Firebase-native)
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccountPath = resolveServiceAccountPath();

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `[firebase] service account NOT FOUND: ${serviceAccountPath}`
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf-8")
  );

  console.log("[firebase] initializing with:", serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin.app();
}

export { admin };
