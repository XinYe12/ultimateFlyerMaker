import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { app } from "electron";

let initialized = false;

export function initFirebase() {
  if (initialized) return;

  const isDev = !app.isPackaged;

  const serviceAccountPath = isDev
    ? path.join(app.getAppPath(), "backend", "config", "firebase-service-account.json")
    : path.join(process.resourcesPath, "backend", "config", "firebase-service-account.json");

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Firebase service account NOT FOUND at: ${serviceAccountPath}`
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf-8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  initialized = true;
}

export { admin };
