import { db } from "../config/firebase.js";

const list = async () => {
  const collections = await db.listCollections();
  console.log("🔥 Firestore Collections:");
  collections.forEach(c => console.log(" -", c.id));
};

list();
