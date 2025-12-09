import "../config/loadEnv.js";
import "../config/firebase.js";   // <-- IMPORTANT
import { addProductFromImage } from "../services/productService.js";

async function run() {
  const [productId, name, imagePath] = process.argv.slice(2);

  if (!productId || !name || !imagePath) {
    console.log("❌ Usage: node scripts/addProductFromImage.js <id> <name> <imagePath>");
    process.exit(1);
  }

  console.log("📸 Generating embedding...");
  const result = await addProductFromImage(productId, name, imagePath);

  console.log("✅ Product stored:");
  console.log(result);
}

run();
