// apps/desktop/apps/desktop/src/main/ingestion/firebase.js
// ✅ ELECTRON MAIN VERSION — COPY / PASTE AS-IS

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
  credentials.json MUST live here:
  apps/desktop/apps/desktop/src/main/credentials.json
*/

const CRED_PATH = path.resolve(__dirname, "../credentials.json");

// Load service account
const serviceAccount = JSON.parse(readFileSync(CRED_PATH, "utf8"));

// Init once
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export const db = getFirestore();
