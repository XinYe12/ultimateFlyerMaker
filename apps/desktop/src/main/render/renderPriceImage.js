import canvasPkg from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { classifyPrice } from "../discount/priceClassifier.js";

const { createCanvas, GlobalFonts } = canvasPkg;

/* ---------- FONT: Trade Winds (bold display) for price labels ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_DIR = path.resolve(__dirname, "../../../assets/fonts");

let PRICE_FONT_FAMILY = "Anton";
try {
  GlobalFonts.registerFromPath(
    path.join(FONT_DIR, "TradeWinds.OTF"),
    "Trade Winds"
  );
  PRICE_FONT_FAMILY = "Trade Winds";
} catch {
  GlobalFonts.registerFromPath(
    path.join(FONT_DIR, "Anton-Regular.ttf"),
    "Anton"
  );
}

function drawOutlinedText(ctx, text, x, y, font, strokeWidth) {
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.lineJoin = "round";

  // Price labels: black text with a white border AND a very slim black outline outside
  // Outer slim black stroke
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(1, strokeWidth - 6);
  ctx.strokeText(text, x, y);

  // Inner white stroke
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = strokeWidth;
  ctx.strokeText(text, x, y);

  // Black fill
  ctx.fillStyle = "#000000";
  ctx.fillText(text, x, y);
}

export function renderPriceImage({
  afterPrice,
  beforePrice,
  priceUnit = "",
  outputPath,
}) {
  // ---------- PRICE CLASSIFICATION ----------
  let parsed = classifyPrice(afterPrice);

  // ---------- FALLBACK (CRITICAL) ----------
  if (!parsed && typeof afterPrice === "string") {
    // Try to extract any price pattern
    const m = afterPrice.match(/(\d+\.?\d*)/);
    if (m) {
      let price = m[1];
      // Ensure 2 decimal places
      if (!price.includes('.')) {
        price = price + '.00';
      } else if (price.split('.')[1].length === 1) {
        price = price + '0';
      }
      parsed = {
        type: "SINGLE",
        price: price,
        unit: ""
      };
    }
  }

  // If still no parsed price, write empty canvas and return
  if (!parsed) {
    const canvas = createCanvas(1000, 480);
    fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
    return outputPath;
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

  // Extra vertical headroom so tall digits + thick strokes are never clipped
  const PAD_TOP = 200;  // Increased from 120 to ensure no clipping
  const canvasH = 680;
  const canvas = createCanvas(1000, canvasH);
  const ctx = canvas.getContext("2d");

  const Pf = (size) => `${size}px "${PRICE_FONT_FAMILY}"`;

  // ---------- LAYOUT CONSTANTS ----------
  const MAIN  = 400;                      // big integer part
  const DEC   = Math.round(MAIN * 2 / 3); // decimal size (slightly smaller)
  const SMALL = 100;                      // qty/ and unit (/EA)

  // Baselines:
  // - baseY: where the big integer (MAIN) sits
  // - decY:  raise decimals toward the top-right of the MAIN glyph
  const baseY = canvasH - PAD_TOP;        // main-number baseline
  const decY  = baseY - MAIN * 0.6;       // decimals float near the top-right
  // unit baseline = baseY

  // ---------- MEASURE TOTAL WIDTH FOR CENTERING ----------
  const [intPart, decimalPart = ""] = parsed.price.split(".");

  let totalWidth = 0;

  // Measure qty/ if MULTI
  let qtyWidth = 0;
  if (renderType === "MULTI") {
    ctx.font = Pf(SMALL);
    qtyWidth = ctx.measureText(`${parsed.qty}/`).width + 8;
    totalWidth += qtyWidth;
  }

  // Measure main integer
  ctx.font = Pf(MAIN);
  const bigWidth = ctx.measureText(intPart).width;
  totalWidth += bigWidth;

  // Measure decimal
  let decWidth = 0;
  if (decimalPart) {
    ctx.font = Pf(DEC);
    decWidth = ctx.measureText(decimalPart).width;
    totalWidth += 8 + decWidth;
  }

  // Measure unit
  if (renderType === "SINGLE" && unit) {
    ctx.font = Pf(SMALL);
    totalWidth += 8 + ctx.measureText(`/${unit}`).width;
  }

  // Center the price, then shift left
  let x = (1000 - totalWidth) / 2 - 100;

  // ---------- MULTI: "qty/" at bottom-left ----------
  if (renderType === "MULTI") {
    const qtySlash = `${parsed.qty}/`;
    drawOutlinedText(ctx, qtySlash, x, baseY, Pf(SMALL), 14);
    x += qtyWidth;
  }

  // ---------- MAIN INTEGER ----------
  drawOutlinedText(ctx, intPart, x, baseY, Pf(MAIN), 24);

  // ---------- RIGHT COLUMN: decimal (top) + unit (bottom) ----------
  const rightX = x + bigWidth + 8;

  if (decimalPart) {
    drawOutlinedText(ctx, decimalPart, rightX, decY, Pf(DEC), 18);
  }

  // NEVER show unit for multi-buy; only for single prices
  if (renderType === "SINGLE" && unit) {
    drawOutlinedText(ctx, `/${unit}`, rightX, baseY, Pf(SMALL), 14);
  }

  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));

  // Return the file path so callers can store it
  return outputPath;
}
