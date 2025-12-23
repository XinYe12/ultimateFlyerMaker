// server/routes/identifyProductRoute.js
import express from "express";
import multer from "multer";
import fs from "fs";
import { searchBrave, buildBraveQueryFromParsed } from "../services/braveSearchService.js";
import { parseProductTitle } from "../parseTitleDeepSeek.js";
import { searchProductsByText } from "../services/productSearchService.js"; // YOU WILL CREATE THIS
import { analyzeImageAndParse } from "../services/imageAnalysisService.js"; // YOU ALREADY HAVE MOST OF THIS LOGIC

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/**
 * Unified Product Identification Endpoint
 * Supports:
 *   - text only
 *   - image only
 *   - both text + image (text overrides)
 */
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const title = req.body.title?.trim() || "";
    const hasImage = !!req.file;
    const filePath = req.file?.path || null;

    // --------------------
    // CASE 1: TEXT ONLY
    // --------------------
    if (title && !hasImage) {
      console.log("🟦 TEXT ONLY MODE");
      const matches = await searchProductsByText(title);
      return res.json({
        mode: "text-only",
        query: title,
        matches
      });
    }

   // --------------------
  // CASE 2: IMAGE ONLY
  // --------------------
    if (!title && hasImage) {
      console.log("🟩 IMAGE ONLY MODE");

      const parsed = await analyzeImageAndParse(filePath);
      console.log("🧠 parsed =", parsed);

      const queryText =
        parsed.title_ai ||
        parsed.title ||
        parsed.ocrText ||
        "";

      console.log("🧠 queryText =", queryText);

      const firestoreMatches = await searchProductsByText(queryText);
      console.log("🔥 Firestore matches =", firestoreMatches.length);

      const braveResults = await searchBrave(
        buildBraveQueryFromParsed(parsed, queryText),
        { count: 5 }
      );

      return res.json({
        mode: "image-only",
        parsed,
        matches: firestoreMatches,
        braveResults,
      });
    }



    // --------------------
    // CASE 3: BOTH TEXT + IMAGE
    // --------------------
    console.log("🟧 IMAGE + TEXT MODE");

    // 1) TRUST USER TEXT
    const textMatches = await searchProductsByText(title);

    // 2) OPTIONAL: Check if image title disagrees (not required now)
    let parsedImage = null;
    if (hasImage) {
      parsedImage = await analyzeImageAndParse(filePath);
    }

    return res.json({
      mode: "image+text",
      userText: title,
      parsedImage,
      matches: textMatches
    });

  } catch (err) {
    console.error("❌ identify-product failed:", err);
    res.status(500).json({ error: "Identify product failed" });
  }
});

export default router;
