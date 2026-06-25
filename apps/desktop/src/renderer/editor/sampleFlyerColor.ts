export type RegionRect = { x: number; y: number; width: number; height: number };

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(imageUrl);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load flyer image"));
      img.src = imageUrl;
    });
    imageCache.set(imageUrl, pending);
  }
  return pending;
}

function clampChannel(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(c => clampChannel(c).toString(16).padStart(2, "0")).join("")}`;
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

async function samplePixels(
  imageUrl: string,
  region: RegionRect,
  mode: "average" | "median"
): Promise<string> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const w = Math.max(1, Math.min(Math.floor(region.width), img.naturalWidth - x));
  const h = Math.max(1, Math.min(Math.floor(region.height), img.naturalHeight - y));

  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  }

  if (rs.length === 0) return "#ffffff";

  if (mode === "average") {
    const n = rs.length;
    const r = rs.reduce((s, v) => s + v, 0) / n;
    const g = gs.reduce((s, v) => s + v, 0) / n;
    const b = bs.reduce((s, v) => s + v, 0) / n;
    return rgbToHex(r, g, b);
  }

  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return rgbToHex(median(rs), median(gs), median(bs));
}

export async function sampleRegionColor(imageUrl: string, region: RegionRect): Promise<string> {
  return samplePixels(imageUrl, region, "median");
}

export async function samplePointColor(imageUrl: string, x: number, y: number): Promise<string> {
  return samplePixels(imageUrl, { x, y, width: 1, height: 1 }, "average");
}

/** Find dominant text-like color in crop that contrasts with background. */
export async function sampleTextColorFromRegion(
  imageUrl: string,
  region: RegionRect,
  backgroundHex: string
): Promise<string | null> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const w = Math.max(1, Math.min(Math.floor(region.width), img.naturalWidth - x));
  const h = Math.max(1, Math.min(Math.floor(region.height), img.naturalHeight - y));

  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const bg = hexToRgb(backgroundHex) ?? { r: 255, g: 255, b: 255 };
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 160) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 240 || lum < 15) continue;
    const key = `${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  let best: { r: number; g: number; b: number; score: number } | null = null;
  for (const bucket of buckets.values()) {
    const r = bucket.r / bucket.count;
    const g = bucket.g / bucket.count;
    const b = bucket.b / bucket.count;
    const dist = colorDistance(bg, { r, g, b });
    const score = dist * Math.sqrt(bucket.count);
    if (!best || score > best.score) {
      best = { r, g, b, score };
    }
  }

  if (!best || best.score < 40) return null;
  return rgbToHex(best.r, best.g, best.b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export async function cropRegionToDataUrl(imageUrl: string, region: RegionRect): Promise<string> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const w = Math.max(1, Math.min(Math.floor(region.width), img.naturalWidth - x));
  const h = Math.max(1, Math.min(Math.floor(region.height), img.naturalHeight - y));

  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}
