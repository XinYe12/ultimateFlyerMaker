import canvasPkg from "@napi-rs/canvas";
import fs from "fs";
import { classifyPrice } from "../discount/priceClassifier.js";

const { createCanvas } = canvasPkg;

function drawOutlinedText(ctx, text, x, y, font, strokeWidth) {
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "#e60000";
  ctx.lineWidth = strokeWidth;
  ctx.strokeText(text, x, y);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

export function renderPriceImage({
  afterPrice,
  beforePrice,
  priceUnit = "EA",
  outputPath
}) {
  // ---------- PRICE CLASSIFICATION ----------
  const parsed = classifyPrice(afterPrice);

  // ✅ HARD GUARD: no valid sale price → render nothing
  if (!parsed || !parsed.price) {
    return;
  }

  // 🔒 UNIT OVERRIDE (CRITICAL)
  // Unit is PRODUCT data, NOT price data
  const unit = priceUnit ? priceUnit.toUpperCase() : "";

  // Force SINGLE when unit is LB (produce)
  if (unit === "LB") {
    parsed.type = "SINGLE";
  }

  const canvas = createCanvas(1000, 420);
  const ctx = canvas.getContext("2d");

  const baseY = 260;
  let x = 80;

  // ---------- MULTI BUY ----------
  if (parsed.type === "MULTI") {
    drawOutlinedText(ctx, parsed.qty, x, baseY, "150px Anton", 26);
    x += ctx.measureText(parsed.qty).width + 16;

    drawOutlinedText(ctx, "FOR", x, baseY, "120px Anton", 26);
    x += ctx.measureText("FOR").width + 24;
  }

  // ---------- PRICE ----------
  const [intPart, decimalPart = ""] = parsed.price.split(".");

  // $
  drawOutlinedText(ctx, "$", x - 36, baseY - 110, "90px Anton", 24);

  // BIG NUMBER
  drawOutlinedText(ctx, intPart, x, baseY, "240px Anton", 24);
  const bigWidth = ctx.measureText(intPart).width;

  // decimals
  if (decimalPart) {
    drawOutlinedText(
      ctx,
      decimalPart,
      x + bigWidth + 6,
      baseY - 110,
      "110px Anton",
      28
    );
  }

  // ---------- UNIT ----------
  // ONLY render unit for SINGLE prices
  // NEVER auto-insert EA
  if (parsed.type === "SINGLE" && unit) {
    drawOutlinedText(
      ctx,
      unit,
      x + bigWidth + 14,
      baseY,
      "100px Anton",
      28
    );
  }

  // ---------- REG PRICE ----------
  if (beforePrice) {
    drawOutlinedText(
      ctx,
      `REG: ${beforePrice}`,
      80,
      baseY + 70,
      "76px Anton",
      18
    );
  }

  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
}
