import path from "path";
import fs from "fs";
import { app } from "electron";
import { renderTitleImage } from "../render/renderTitleImage.js";
import { renderPriceImage } from "../render/renderPriceImage.js";

export async function exportDiscountImages(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("exportDiscountImages: invalid items");
  }

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

    // ---------- TITLE DATA ----------
    const en = item.en ?? item.english_name ?? "";
    const zh = item.zh ?? item.chinese_name ?? "";
    const size = item.size ?? "";

    renderTitleImage({
      en,
      zh,
      size,
      outputPath: titlePath
    });

    // ---------- PRICE DATA ----------
    const salePrice =
      item.salePrice ??
      item.sale_price ??
      "";

    const regularPrice =
      item.regularPrice ??
      item.regular_price ??
      "";

    const unit = item.unit ?? "";

    console.log("🧾 FINAL PRICE DATA", {
      sale: salePrice,
      regular: regularPrice,
      unit
    });

    // 🔒 ALWAYS attempt to render price image
    // renderPriceImage itself decides whether to draw or skip
    renderPriceImage({
      afterPrice: salePrice,
      beforePrice: regularPrice,
      priceUnit: unit,
      outputPath: pricePath
    });
  });

  console.log("✅ EXPORT COMPLETE");
}
