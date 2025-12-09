// routes/searchByPhotoRoute.js
import express from "express";
import multer from "multer";
import fs from "fs";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// -------------------------------------------
// POST /api/search-by-photo
// -------------------------------------------
// This route now ONLY receives the image and returns it as base64.
// The frontend or another part of the backend can decide what to do next.
router.post("/search-by-photo", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const filePath = req.file.path;
    const imageBuffer = fs.readFileSync(filePath);

    console.log("📸 Received image:", filePath);

    // Convert to Base64 so the frontend can preview or send it anywhere
    const base64 = imageBuffer.toString("base64");

    // Cleanup
    fs.unlinkSync(filePath);

    return res.json({
      ok: true,
      base64,
      message: "Image received successfully.",
    });
  } catch (err) {
    console.error("❌ ERROR in /search-by-photo:", err);
    return res.status(500).json({
      error: "Search-by-photo failed",
      detail: err.message,
    });
  }
});

export default router;
