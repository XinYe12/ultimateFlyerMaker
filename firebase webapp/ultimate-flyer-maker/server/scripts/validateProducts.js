/**
 * Production validator for product_vectors consistency.
 * Checks:
 *  - publicUrl exists and is valid
 *  - imageStoragePath exists
 *  - Storage file exists
 *  - download token exists
 *
 * Run with: node scripts/validateProducts.js
 */

import admin from "firebase-admin";
import fs from "fs";
import fetch from "node-fetch";

const serviceAccount = JSON.parse(
  fs.readFileSync("./credentials/service-key.json", "utf-8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "flyer-maker-ai-478503.firebasestorage.app",
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function validate() {
  console.log("🔍 Starting full dataset validation...\n");

  const snap = await db.collection("product_vectors").get();
  console.log(`📦 Found ${snap.size} product documents\n`);

  const results = {
    ok: [],
    missingPublicUrl: [],
    missingStoragePath: [],
    missingToken: [],
    missingFileInStorage: [],
    badUrlFormat: [],
  };

  for (const doc of snap.docs) {
    const id = doc.id;
    const data = doc.data();

    const publicUrl = data.publicUrl || "";
    const storagePath = data.imageStoragePath || "";

    // ---------- Check publicUrl ----------
    if (!publicUrl || !publicUrl.startsWith("https://firebasestorage.googleapis.com")) {
      results.missingPublicUrl.push(id);
      console.log(`❗ [${id}] Missing or invalid publicUrl`);
      continue;
    }

    // ---------- Check URL contains token ----------
    if (!publicUrl.includes("token=")) {
      results.missingToken.push(id);
      console.log(`❗ [${id}] Missing token in publicUrl`);
    }

    // ---------- Check imageStoragePath ----------
    if (!storagePath || typeof storagePath !== "string" || storagePath.trim() === "") {
      results.missingStoragePath.push(id);
      console.log(`❗ [${id}] Missing imageStoragePath`);
      continue;
    }

    // ---------- Check Storage file exists ----------
    const file = bucket.file(storagePath);

    try {
      const [exists] = await file.exists();
      if (!exists) {
        results.missingFileInStorage.push(id);
        console.log(`❗ [${id}] Storage object not found: ${storagePath}`);
        continue;
      }
    } catch (err) {
      results.missingFileInStorage.push(id);
      console.log(`❌ [${id}] Error checking storage: ${err.message}`);
      continue;
    }

    // ---------- URL format validation ----------
    try {
      const response = await fetch(publicUrl, { method: "HEAD" });
      if (!response.ok) {
        results.badUrlFormat.push(id);
        console.log(`❗ [${id}] publicUrl is invalid or does not load`);
        continue;
      }
    } catch (err) {
      results.badUrlFormat.push(id);
      console.log(`❗ [${id}] publicUrl request failed`);
      continue;
    }

    results.ok.push(id);
  }

  // ---------- Summary ----------
  console.log("\n====== VALIDATION SUMMARY ======\n");

  console.log(`✔ Valid products: ${results.ok.length}\n`);
  
  console.log(`❗ Missing publicUrl: ${results.missingPublicUrl.length}`);
  console.log(results.missingPublicUrl, "\n");

  console.log(`❗ Missing imageStoragePath: ${results.missingStoragePath.length}`);
  console.log(results.missingStoragePath, "\n");

  console.log(`❗ Missing token in URL: ${results.missingToken.length}`);
  console.log(results.missingToken, "\n");

  console.log(`❗ Storage file missing: ${results.missingFileInStorage.length}`);
  console.log(results.missingFileInStorage, "\n");

  console.log(`❗ publicUrl unreachable: ${results.badUrlFormat.length}`);
  console.log(results.badUrlFormat, "\n");

  console.log("🏁 Validation complete.\n");
}

validate();
