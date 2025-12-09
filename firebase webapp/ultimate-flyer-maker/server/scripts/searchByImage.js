import dotenv from "dotenv";
dotenv.config();

import { searchByImage } from "../services/searchService.js";

const queryImagePath = process.argv[2];

if (!queryImagePath) {
  console.error("❌ Usage: node scripts/searchByImage.js <imagePath>");
  process.exit(1);
}

async function run() {
  console.log("🔍 Searching for best match...");
  const result = await searchByImage(queryImagePath);

  console.log("✅ Best match:");
  console.log(result);
}

run();
