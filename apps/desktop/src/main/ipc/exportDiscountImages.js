import path from "path";
import fs from "fs";
import { app } from "electron";
import { renderTitleImage } from "../render/renderTitleImage.js";
import { renderPriceImage } from "../render/renderPriceImage.js";

export async function exportDiscountImages(items) {
  if (!Array.isArray(items)) {
    throw new Error("❌ exportDiscountImages received NON-array");
  }

  if (items.length === 0) {
    throw new Error("❌ exportDiscountImages received EMPTY array");
  }

  // 🔥 GUARANTEED VISIBLE LOCATION
  const outputDir = path.join(
    app.getPath("desktop"),
    "UFM_Discount_Labels"
  );

  fs.mkdirSync(outputDir, { recursive: true });

  console.log("📁 EXPORT DIR =", outputDir);
  console.log("🔥 EXPORTING", items.length, "ITEMS");

  items.forEach((item, index) => {
    const base = `item_${index + 1}`;

    const titlePath = path.join(outputDir, `${base}_title.png`);
    const pricePath = path.join(outputDir, `${base}_price.png`);

    renderTitleImage({
      en: item.en,
      zh: item.zh,
      size: item.size || "",
      outputPath: titlePath
    });
    const outputPath = path.join(
    outputDir,
    `price_${index}.png`
    );
    renderPriceImage({
      afterPrice: item.salePrice,
      beforePrice: item.regularPrice,
      priceUnit: item.unit,
      outputPath
    });

  });

  console.log("✅ EXPORT COMPLETE");
}
