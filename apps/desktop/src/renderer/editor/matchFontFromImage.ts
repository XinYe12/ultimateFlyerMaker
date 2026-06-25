import { FONT_OPTIONS, type FontOption } from "./fontOptions";
import { cropRegionToDataUrl, type RegionRect } from "./sampleFlyerColor";

export type FontMatchResult = {
  fontFamily: string;
  label: string;
  confidence: number;
};

const MATCH_THRESHOLD = 0.42;

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load crop"));
    img.src = dataUrl;
  });
}

function toGrayscale(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

function sobelEdges(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx =
        -gray[idx - w - 1] + gray[idx - w + 1]
        - 2 * gray[idx - 1] + 2 * gray[idx + 1]
        - gray[idx + w - 1] + gray[idx + w + 1];
      const gy =
        -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1]
        + gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1];
      out[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }
  return out;
}

function compareEdgeMaps(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function renderFontSample(
  text: string,
  fontFamily: string,
  fontSize: number,
  width: number,
  height: number
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  ctx.font = `bold ${fontSize}px ${fontFamily || "sans-serif"}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2, width * 0.9);
  return ctx.getImageData(0, 0, width, height);
}

export async function matchClosestFont(
  cropDataUrl: string,
  sampleText: string,
  fontSize: number,
  options: FontOption[] = FONT_OPTIONS.filter(o => o.value !== "")
): Promise<FontMatchResult | null> {
  const cropImg = await loadImageFromDataUrl(cropDataUrl);
  const w = cropImg.naturalWidth;
  const h = cropImg.naturalHeight;
  if (w < 8 || h < 8) return null;

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = w;
  cropCanvas.height = h;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) return null;
  cropCtx.drawImage(cropImg, 0, 0);
  const cropData = cropCtx.getImageData(0, 0, w, h);
  const cropGray = toGrayscale(cropData.data, w, h);
  const cropEdges = sobelEdges(cropGray, w, h);

  const scaledFontSize = Math.max(12, Math.min(fontSize, h * 0.75));

  let best: FontMatchResult | null = null;
  for (const opt of options) {
    const sample = renderFontSample(sampleText, opt.value, scaledFontSize, w, h);
    if (!sample) continue;
    const sampleGray = toGrayscale(sample.data, w, h);
    const sampleEdges = sobelEdges(sampleGray, w, h);
    const score = compareEdgeMaps(cropEdges, sampleEdges);
    if (!best || score > best.confidence) {
      best = { fontFamily: opt.value, label: opt.label, confidence: score };
    }
  }

  return best;
}

export async function matchFontFromFlyerRegion(
  imageUrl: string,
  region: RegionRect,
  sampleText: string,
  fontSize: number
): Promise<FontMatchResult | null> {
  const cropDataUrl = await cropRegionToDataUrl(imageUrl, region);
  return matchClosestFont(cropDataUrl, sampleText, fontSize);
}

export function isFontMatchConfident(result: FontMatchResult | null): boolean {
  return !!result && result.confidence >= MATCH_THRESHOLD;
}

export { MATCH_THRESHOLD };
