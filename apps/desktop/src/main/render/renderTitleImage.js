import fs from "fs";
import path from "path";
import canvasPkg from "@napi-rs/canvas";
import { fileURLToPath } from "url";

const { createCanvas, GlobalFonts } = canvasPkg;

/* ---------- FONT SETUP ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_DIR = path.resolve(__dirname, "../../../assets/fonts");

GlobalFonts.registerFromPath(
  path.join(FONT_DIR, "BebasNeue-Regular.ttf"),
  "Bebas"
);
GlobalFonts.registerFromPath(
  path.join(FONT_DIR, "SourceHanSans-Heavy.otf"),
  "SourceHan"
);
GlobalFonts.registerFromPath(
  path.join(FONT_DIR, "Anton-Regular.ttf"),
  "Anton"
);

/* ---------- DRAW HELPERS ---------- */
function drawOutlinedText(ctx, text, x, y, font, strokeWidth) {
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = strokeWidth;
  ctx.strokeText(text, x, y);

  ctx.fillStyle = "#ffffff";
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
      lines.push(line);
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
export function renderTitleImage({ en = "", zh = "", size = "", outputPath }) {
  const width = 1000;
  const height = 700;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d"); // ✅ FIX: ctx DEFINED HERE

  const EN_FONT = "82px Bebas";
  ctx.font = EN_FONT;

  const enLines = wrapEnglish(
    ctx,
    String(en).toUpperCase(),
    820,
    3
  );

  const x = 80;
  let y = 160;

  const EN_LINE_HEIGHT = 72;
  const CN_LINE_HEIGHT = 72;
  const SIZE_LINE_HEIGHT = 72;

  // ENGLISH
  enLines.forEach(line => {
    drawOutlinedText(ctx, line, x, y, EN_FONT, 12);
    y += EN_LINE_HEIGHT;
  });

  // CHINESE
  if (zh) {
    drawOutlinedText(ctx, zh, x, y, "70px SourceHan", 12);
    y += CN_LINE_HEIGHT;
  }

  // SIZE
  if (size) {
    drawOutlinedText(ctx, size, x, y, "72px Anton", 12);
    y += SIZE_LINE_HEIGHT;
  }

  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
}
