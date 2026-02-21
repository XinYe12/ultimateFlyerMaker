// ✅ ELECTRON MAIN — SAFE, DEV + PROD, WINDOWS-SAFE

import { readFileSync, existsSync } from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { app } from "electron";

const LOG = (step, msg) => console.log(`[firebase] [${step}]`, msg);

/**
 * NEVER resolve credentials relative to src/main.
 * ALWAYS resolve from app root / resources.
 */
function resolveFirebaseCredentialPath() {
  LOG("1", "Resolving credential path...");
  const p = !app.isPackaged
    ? path.join(app.getAppPath(), "backend", "config", "firebase-service-account.json")
    : path.join(process.resourcesPath, "backend", "config", "firebase-service-account.json");
  LOG("1", "Resolved path: " + p);
  return p;
}

const CRED_PATH = resolveFirebaseCredentialPath();
LOG("2", "Credential file exists: " + existsSync(CRED_PATH));

const serviceAccount = JSON.parse(readFileSync(CRED_PATH, "utf8"));
const projectId = serviceAccount.project_id;
LOG("2", "Loaded service account, project_id: " + projectId);

const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
LOG("3", "databaseId=" + databaseId + " | emulator=" + (emulator || "(none)"));

LOG("4", "Initializing Firebase app...");
const fbApp = !getApps().length
  ? initializeApp({
      credential: cert(serviceAccount),
      storageBucket: `${projectId}.firebasestorage.app`,
    })
  : getApps()[0];
LOG("4", "Firebase app initialized. storageBucket: " + projectId + ".firebasestorage.app");

if (emulator) {
  LOG("5", "FIRESTORE_EMULATOR_HOST set → using emulator: " + emulator);
}
LOG("5", "Getting Firestore client (project=" + projectId + ", database=" + databaseId + ")...");
export const db = databaseId !== "(default)"
  ? getFirestore(fbApp, databaseId)
  : getFirestore(fbApp);
LOG("5", "Firestore client ready. Collection: product_vectors");
