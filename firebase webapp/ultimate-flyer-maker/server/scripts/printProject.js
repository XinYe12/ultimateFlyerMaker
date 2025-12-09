import { db } from "../config/firebase.js";
import { getApps } from "firebase-admin/app";

const app = getApps()[0];

console.log("🔥 Firebase Admin SDK loaded.");
console.log("➡ Project ID (service account):", app.options.credential.projectId);
console.log("➡ Database URL:", app.options.databaseURL || "(none)");

try {
  const collections = await db.listCollections();
  console.log("📚 Collections in this project:");
  collections.forEach(c => console.log(" -", c.id));
} catch (err) {
  console.error("❌ Error listing collections:", err);
}
