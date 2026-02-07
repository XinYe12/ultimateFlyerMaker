import fs from "fs";
import path from "path";
import canvasPkg from "@napi-rs/canvas";
import { fileURLToPath } from "url";

const { createCanvas, GlobalFonts } = canvasPkg;

/* ---------- FONT SETUP ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_DIR = path.resolve(__dirname, "../../../assets/fonts");

// Product titles: Maven Pro Bold only (no Chinese)
let TITLE_FONT_FAMILY = "Bebas";
try {
  GlobalFonts.registerFromPath(
    path.join(FONT_DIR, "Maven Pro Bold.OTF"),
    "Maven Pro"
  );
  TITLE_FONT_FAMILY = "Maven Pro";
} catch {
  GlobalFonts.registerFromPath(
    path.join(FONT_DIR, "BebasNeue-Regular.ttf"),
    "Bebas"
  );
}

/* ---------- DRAW HELPERS ---------- */
// Product titles: solid black text, NO border
function drawTitleText(ctx, text, x, y, font) {
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.fillStyle = "#000000";
  ctx.fillText(text, x, y);
}

function wrapEnglish(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").split(" ").filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const w = ctx.measureText(test).width;

    if (w <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  return lines.slice(0, maxLines);
}

/* ---------- MAIN ---------- */
// NOTE: `regularPrice` is optional and, when provided, is rendered on the same line as `size`
export function renderTitleImage({ en = "", zh = "", size = "", regularPrice = "", outputPath }) {
  const width = 1000;
  const height = 300;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const EN_FONT = `75px "${TITLE_FONT_FAMILY}"`;
  ctx.font = EN_FONT;

  const enLines = wrapEnglish(ctx, String(en).toUpperCase(), 920, 2);

  const x = 40;
  let y = 80;

  const LINE_HEIGHT = 68;

  // English title (Maven Pro Bold only; no Chinese)
  enLines.forEach((line) => {
    drawTitleText(ctx, line, x, y, EN_FONT);
    y += LINE_HEIGHT;
  });

  // Size + regular price on ONE line, same style
  if (size || regularPrice) {
    let footer = "";
    if (size) footer += String(size);
    if (regularPrice) {
      const regText = String(regularPrice).trim();
      footer += footer ? `   REG: ${regText}` : `REG: ${regText}`;
    }
    drawTitleText(ctx, footer, x, y, `64px "${TITLE_FONT_FAMILY}"`);
  }

  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));

  // Return the file path so callers can store it
  return outputPath;
}
