import express from "express";
import multer from "multer";
import { db } from "../config/firebase.js";
import { computePHash } from "../services/phash.js";   // <-- we add this

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Hamming distance for hex pHash
function hammingDistance(hex1, hex2) {
  const b1 = BigInt("0x" + hex1);
  const b2 = BigInt("0x" + hex2);
  const xor = b1 ^ b2;
  return xor.toString(2).split("1").length - 1;
}

router.post("/", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const bytes = req.file.buffer;

    // ---- 1) Compute pHash for uploaded file ----
    const pHash = await computePHash(bytes);

    // ---- 2) Compare to Firestore ----
    const snap = await db.collection("product_vectors").get();

    let nearest = null;
    let minDist = Infinity;

    snap.forEach((doc) => {
      const data = doc.data();
      if (!data.pHash) return;

      const dist = hammingDistance(data.pHash, pHash);
      if (dist < minDist) {
        minDist = dist;
        nearest = { id: data.id, dist };
      }
    });

    // ---- 3) Apply threshold ----
    if (nearest && minDist <= 10) {
      return res.json({
        duplicate: true,
        matchedId: nearest.id,
        distance: minDist,
      });
    }

    // Unique
    return res.json({
      duplicate: false,
      pHash,
    });

  } catch (err) {
    console.error("❌ /check-duplicate-image error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
