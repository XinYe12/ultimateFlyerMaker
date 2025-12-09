import express from "express";
import multer from "multer";
import { db } from "../config/firebase.js";
import { getQueryEmbeddingFromImage } from "../services/queryEmbeddingService.js";
import { getStorage } from "firebase-admin/storage";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ------------------------------
   COSINE SIMILARITY
--------------------------------*/
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/* ------------------------------
   MAIN ROUTE (DEBUG VERSION)
--------------------------------*/
router.post("/", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    console.log("📸 Received query image:", req.file.originalname);

    const mimeType = req.file.mimetype || "image/png";
    const queryEmbedding = await getQueryEmbeddingFromImage(
      req.file.buffer,
      mimeType
    );

    console.log("🔎 queryEmbedding length:", queryEmbedding.length);
    console.log("📥 Loading product_vectors...");

    const snap = await db.collection("product_vectors").get();
    const scored = [];
    let withEmbedding = 0;
    let withoutEmbedding = 0;

    snap.forEach((doc) => {
      const data = doc.data();

      if (!Array.isArray(data.embedding) || !data.embedding.length) {
        withoutEmbedding++;
        return;
      }

      withEmbedding++;

      const score = cosineSimilarity(queryEmbedding, data.embedding);

      // 🔍 PRINT SIMILARITY HERE
      console.log("🔢", doc.id, "→", score.toFixed(4));

      scored.push({
        id: doc.id,
        englishTitle: data.englishTitle || "",
        chineseTitle: data.chineseTitle || "",
        size: data.size || "",
        brand: data.brand || "",
        category: data.category || "",
        imageUrl: data.publicUrl || "",
        imageStoragePath: data.imageStoragePath || "",
        embedding: data.embedding,
        score,
      });
    });

    console.log("✅ Docs with embeddings:", withEmbedding);
    console.log("⚠️ Docs without embeddings:", withoutEmbedding);

    // -----------------------------------
    // 🔥 RAW TOP 5 (NO DEDUPE, NO URL CHECKS)
    // -----------------------------------
    const top5 = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log("🔥 RAW TOP 5:", top5.map((x) => x.id));

    return res.json({ results: top5 });

  } catch (err) {
    console.error("❌ Error in /search-by-image:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
