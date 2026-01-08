// ✅ ELECTRON MAIN — SAFE, DEV + PROD, WINDOWS-SAFE

import { readFileSync } from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { app } from "electron";

/**
 * NEVER resolve credentials relative to src/main.
 * ALWAYS resolve from app root / resources.
 */
function resolveFirebaseCredentialPath() {
  // Dev mode (electron + vite)
  if (!app.isPackaged) {
    return path.join(
      app.getAppPath(),
      "backend",
      "config",
      "firebase-service-account.json"
    );
  }

  // Production (future-safe)
  return path.join(
    process.resourcesPath,
    "backend",
    "config",
    "firebase-service-account.json"
  );
}

const CRED_PATH = resolveFirebaseCredentialPath();

console.log("[firebase] loading credentials from:", CRED_PATH);

// Load service account
const serviceAccount = JSON.parse(readFileSync(CRED_PATH, "utf8"));

// Init once
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export const db = getFirestore();
