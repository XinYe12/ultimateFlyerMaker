import { nativeImage } from "electron";
import fs from "fs";
import path from "path";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const STANDARD_DEPT_KEYS = [
  "grocery", "meat", "produce", "frozen", "seafood",
  "hot_food", "dairy", "bakery", "sushi",
];

function readImageAsBase64(imagePath) {
  const ext = path.extname(imagePath).toLowerCase().replace(".", "");
  const mimeType =
    ext === "png" ? "image/png" :
    ext === "webp" ? "image/webp" :
    "image/jpeg";
  const data = fs.readFileSync(imagePath, { encoding: "base64" });
  return { data, mimeType };
}

function normalizeDeptKey(raw) {
  if (!raw) return "grocery";
  const k = raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, "");
  if (STANDARD_DEPT_KEYS.includes(k)) return k;
  if (k.includes("hot") || k.includes("food")) return "hot_food";
  if (k.includes("frozen") || k.includes("dairy")) return "frozen";
  if (k.includes("sea") || k.includes("fish")) return "seafood";
  if (k.includes("meat") || k.includes("beef") || k.includes("pork")) return "meat";
  if (k.includes("produce") || k.includes("fruit") || k.includes("veg")) return "produce";
  if (k.includes("bak")) return "bakery";
  if (k.includes("sush")) return "sushi";
  return k || "grocery";
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v ?? lo)));
}

function safeHex(v, fallback) {
  if (!v) return fallback;
  const s = String(v).trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

async function callGeminiForLayout(imagePath, width, height) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const { data, mimeType } = readImageAsBase64(imagePath);

  const prompt = `You are analyzing a grocery store weekly flyer page image (${width}×${height} pixels) to produce a complete, reusable empty template layout.

Examine the image carefully and return ONLY valid JSON — no markdown, no code fences, no explanation.

{
  "pageBackground": "#ffffff",

  "staticZones": [
    {
      "label": "Header",
      "color": "#cc2222",
      "textColor": "#ffffff",
      "x": 0, "y": 0, "width": 1650, "height": 240,
      "text": "UNITED SUPERMARKET",
      "fontSize": 72
    }
  ],

  "departments": [
    {
      "key": "grocery",
      "label": "GROCERY",
      "labelColor": "#cc2222",
      "labelTextColor": "#ffffff",
      "labelRegion": { "x": 0, "y": 240, "width": 55, "height": 2160 },
      "productRegion": { "x": 55, "y": 240, "width": 1595, "height": 2160 },
      "rows": 5,
      "cols": 4,
      "cardStyle": {
        "backgroundColor": "#ffffff",
        "borderRadius": 6,
        "borderWidth": 1,
        "borderColor": "#e2e8f0",
        "hasShadow": false,
        "orientation": "vertical",
        "titleFontSize": 26,
        "metaFontSize": 18,
        "titleColor": "#1e293b",
        "priceColor": "#cc2222",
        "pricePosition": "bottom-right",
        "imagePercent": 60
      }
    }
  ]
}

FIELD DEFINITIONS:

pageBackground — the color of the page area behind and between product cells (usually white).

staticZones — ALL structural non-product areas: store header bar, address/date strip, footer, decorative bands, watermarks.
  label   — short description (e.g. "Header", "Address Bar", "Footer")
  color   — background hex color of this zone
  textColor — main text color in this zone
  x/y/width/height — pixel bounding box
  text    — the most prominent visible text (store name, tagline, etc.), empty string if none
  fontSize — estimated font size in px of the "text" field above

departments — each distinct department section (GROCERY, MEAT, PRODUCE, FROZEN, SEAFOOD, HOT FOOD, DAIRY, BAKERY, SUSHI…)
  key     — snake_case identifier; use: grocery meat produce frozen seafood hot_food dairy bakery sushi
  label   — exact text shown on the department banner
  labelColor / labelTextColor — colors of the department banner strip
  labelRegion — bounding box of the colored banner strip itself (NOT the products)
  productRegion — bounding box of the product grid ONLY, excluding the banner strip
  rows    — count of product rows in this section
  cols    — count of product columns per row

  cardStyle — the visual appearance of each individual product cell:
    backgroundColor  — cell background color (what you see behind the product image and text)
    borderRadius     — corner rounding in px (0 = sharp rectangle)
    borderWidth      — border line thickness in px (0 = no border)
    borderColor      — border color
    hasShadow        — true if cards have a visible drop shadow
    orientation      — "vertical" if image is above title+price; "horizontal" if image is left of title+price; "top" if title is above image
    titleFontSize    — estimated px size of the product name text, scaled to ${width}×${height}
    metaFontSize     — estimated px size of the unit + regular price line (smaller secondary text)
    titleColor       — product name text color
    priceColor       — main price number color
    pricePosition    — where the price sits: "bottom-right", "bottom-left", "bottom-center", or "right"
    imagePercent     — approximate % of the cell's image dimension occupied by the product photo area

RULES:
- All x/y/width/height must be integers; x+width ≤ ${width}; y+height ≤ ${height}
- labelRegion may be null if no banner strip is visible
- Estimate font sizes proportional to the full ${width}×${height} image (not to any scaled preview)
- Return ONLY the JSON object, nothing else`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 4096 },
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${body}`);
    }

    const json = await res.json();
    const candidate = json?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      throw new Error(`Gemini stopped early: finishReason=${candidate.finishReason}`);
    }
    const text = candidate?.content?.parts?.[0]?.text ?? "";
    if (!text) throw new Error("Gemini returned empty content");

    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function buildPage(layout, width, height, pageIndex) {
  const departmentAreas = [];
  const boxes = [];
  let uid = 0;

  // Static zones → visual boxes (header, footer, address bars, etc.)
  for (const zone of (layout.staticZones ?? [])) {
    if (!zone) continue;
    boxes.push({
      id: `static_${uid++}`,
      label: String(zone.label || "Zone"),
      departmentKey: "_header",
      color: safeHex(zone.color, "#334155"),
      textColor: safeHex(zone.textColor, "#ffffff"),
      x: clamp(zone.x, 0, width - 1),
      y: clamp(zone.y, 0, height - 1),
      width: clamp(zone.width, 10, width),
      height: clamp(zone.height, 10, height),
      rows: 1,
      boxType: "color",
      content: String(zone.text || zone.label || ""),
      fontSize: clamp(zone.fontSize, 8, 200) || 14,
    });
  }

  // Departments → department areas + label banner boxes
  for (const dept of (layout.departments ?? [])) {
    if (!dept) continue;
    const key = normalizeDeptKey(dept.key);
    const label = String(dept.label || key).toUpperCase();
    const rows = Math.max(1, parseInt(dept.rows ?? 4, 10));
    const cols = Math.max(1, parseInt(dept.cols ?? 4, 10));

    const pr = dept.productRegion;
    if (!pr) continue;

    // Build cardStyle from Gemini's detected values
    const cs = dept.cardStyle;
    const cardStyle = cs ? {
      backgroundColor: safeHex(cs.backgroundColor, "#ffffff"),
      borderRadius: clamp(cs.borderRadius, 0, 100) || 0,
      borderWidth: clamp(cs.borderWidth, 0, 20) || 0,
      borderColor: safeHex(cs.borderColor, "#e2e8f0"),
      hasShadow: !!cs.hasShadow,
      orientation: ["vertical", "horizontal", "top"].includes(cs.orientation) ? cs.orientation : "vertical",
      titleFontSize: cs.titleFontSize ? clamp(cs.titleFontSize, 6, 300) : undefined,
      metaFontSize: cs.metaFontSize ? clamp(cs.metaFontSize, 6, 200) : undefined,
      titleColor: safeHex(cs.titleColor, "#1e293b"),
      priceColor: safeHex(cs.priceColor, "#1e293b"),
      pricePosition: ["bottom-right", "bottom-left", "bottom-center", "right"].includes(cs.pricePosition)
        ? cs.pricePosition : "bottom-right",
      imagePercent: cs.imagePercent ? clamp(cs.imagePercent, 10, 90) : undefined,
    } : undefined;

    departmentAreas.push({
      id: `${key}_${uid++}`,
      departmentKey: key,
      label,
      rows,
      cols,
      productRegion: {
        x: clamp(pr.x, 0, width - 1),
        y: clamp(pr.y, 0, height - 1),
        width: clamp(pr.width, 1, width),
        height: clamp(pr.height, 1, height),
      },
      ...(cardStyle ? { cardStyle } : {}),
    });

    // Department label banner box
    const lr = dept.labelRegion;
    if (lr) {
      boxes.push({
        id: `label_${key}_${uid++}`,
        label,
        departmentKey: key,
        color: safeHex(dept.labelColor, "#334155"),
        textColor: safeHex(dept.labelTextColor, "#ffffff"),
        x: clamp(lr.x, 0, width - 1),
        y: clamp(lr.y, 0, height - 1),
        width: clamp(lr.width, 4, width),
        height: clamp(lr.height, 10, height),
        rows: 1,
        boxType: "color",
        content: label,
        fontSize: 14,
      });
    }
  }

  return {
    pageId: `p${pageIndex + 1}`,
    canvasWidth: width,
    canvasHeight: height,
    // No backgroundImage — this is an empty template, not a photo overlay
    backgroundColor: safeHex(layout.pageBackground, "#ffffff"),
    boxes,
    departmentAreas,
  };
}

export async function parseTemplateFromImages(_event, imagePaths) {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    throw new Error("No images provided");
  }

  const pages = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];

    const img = nativeImage.createFromPath(imgPath);
    const { width, height } = img.getSize();
    if (!width || !height) {
      throw new Error(`Could not read dimensions for image: ${path.basename(imgPath)}`);
    }

    const layout = await callGeminiForLayout(imgPath, width, height);
    pages.push(buildPage(layout, width, height, i));
  }

  return {
    templateId: `imported_${Date.now()}`,
    isCustom: true,
    name: "Imported Template",
    pages,
  };
}
