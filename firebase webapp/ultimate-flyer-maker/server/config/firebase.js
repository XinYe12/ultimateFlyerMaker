import dotenv from "dotenv";
dotenv.config();

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Absolute path to service account
const CRED_PATH = path.resolve(__dirname, "../credentials.json");
console.log("🔥 Using Firebase credentials:", CRED_PATH);

// Load service account JSON
const serviceAccount = JSON.parse(readFileSync(CRED_PATH, "utf8"));

// Initialize ONLY if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

// ✔ Firestore ALWAYS uses the default database
export const db = getFirestore(); 
