import { searchByImage } from "../services/searchService.js";

export async function searchByImageController(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const localPath = req.file.path;

    const results = await searchByImage(localPath);

    return res.json({
      success: true,
      results,
    });

  } catch (err) {
    console.error("❌ Search error:", err);
    res.status(500).json({ error: "Search failed", details: err.message });
  }
}
