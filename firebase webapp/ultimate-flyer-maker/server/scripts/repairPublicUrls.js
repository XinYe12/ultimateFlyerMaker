/**
 * One-time Firestore repair script to add publicUrl to all product_vectors docs.
 * Run with: node repairPublicUrls.js
 */

import admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

// ---- LOAD FIREBASE SERVICE KEY ----
const serviceAccount = JSON.parse(
  fs.readFileSync("./credentials/service-key.json", "utf-8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "flyer-maker-ai-478503.firebasestorage.app",
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function repairPublicUrls() {
  console.log("🔧 Starting repair of Firestore publicUrl fields...");

  const snap = await db.collection("product_vectors").get();
  console.log(`📦 Found ${snap.size} products`);

  let updatedCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const id = doc.id;

    const storagePath = data.imageStoragePath;
    const existingUrl = data.publicUrl;

    if (!storagePath) {
      console.log(`⚠️ [${id}] No imageStoragePath — skipping.`);
      continue;
    }

    if (existingUrl && existingUrl.startsWith("https")) {
      console.log(`✔️ [${id}] Already has publicUrl — skipping.`);
      continue;
    }

    try {
      const file = bucket.file(storagePath);

      // generate new download token
      const newToken = uuidv4();

      // update file metadata
      await file.setMetadata({
        metadata: {
          firebaseStorageDownloadTokens: newToken,
        },
      });

      // build public URL
      const publicUrl =
        "https://firebasestorage.googleapis.com/v0/b/" +
        bucket.name +
        "/o/" +
        encodeURIComponent(storagePath) +
        "?alt=media&token=" +
        newToken;

      // update Firestore
      await doc.ref.update({ publicUrl });

      updatedCount++;
      console.log(`✨ [${id}] Repaired publicUrl`);

    } catch (err) {
      console.error(`❌ [${id}] Failed to update publicUrl:`, err);
    }
  }

  console.log(`\n🏁 Done! Updated ${updatedCount} documents.`);
}

repairPublicUrls();
