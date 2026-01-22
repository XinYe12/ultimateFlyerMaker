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
  priceUnit = "",
  outputPath
}) {
  // ---------- PRICE CLASSIFICATION ----------
  let parsed = classifyPrice(afterPrice);

  // ---------- FALLBACK (CRITICAL) ----------
  if (!parsed && typeof afterPrice === "string") {
    const m = afterPrice.match(/(\d+\.\d{2})/);
    if (m) {
      parsed = {
        type: "SINGLE",
        price: m[1],
        unit: ""
      };
    } else {
      return;
    }
  }


  // 🔒 UNIT OVERRIDE (PRODUCT DATA WINS)
  const unit =
    parsed.unit
      ? parsed.unit.toUpperCase()
      : priceUnit
      ? priceUnit.toUpperCase()
      : "";

  // 🔒 RENDER MODE (DO NOT MUTATE parsed)
  const renderType = parsed.type;

  const canvas = createCanvas(1000, 420);
  const ctx = canvas.getContext("2d");

  const baseY = 260;
  let x = 80;

  // ---------- MULTI BUY ----------
  if (renderType === "MULTI") {
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
// ---------- UNIT ----------
// NEVER render ORDER next to the main price (prevents overlap)
if (renderType === "SINGLE" && unit) {
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
    // strip unit from REG if SALE already shows it
    // ---------- REG PRICE Y POSITION ----------
    const regY =
      renderType === "MULTI"
        ? baseY + 110
        : baseY + 70;

      const regText =
        unit && typeof beforePrice === "string"
          ? beforePrice.replace(/\/\s*(order|ea|lb|case|box|pack|pkg)/i, "")
          : beforePrice;

      drawOutlinedText(
        ctx,
        `REG: ${regText}`,
        80,
        regY,
        "76px Anton",
        18
      );

  }


  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
}
