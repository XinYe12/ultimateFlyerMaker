import fs from "fs";
import path from "path";
import sharp from "sharp";
import { app } from "electron";
import { automationCellRectsForArea } from "../../../../shared/flyer/layout/automationDepartmentRects.js";

const VALID_FIELD_KINDS = new Set([
  "date_range", "store_name", "address", "footer", "decorative", "custom",
]);

function safeHex(v, fallback) {
  if (!v) return fallback;
  const s = String(v).trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

function rectSvg(r) {
  const rx = r.radius > 0 ? Math.min(r.radius, r.width / 2, r.height / 2) : 0;
  if (r.stroke && r.strokeWidth > 0) {
    const inset = r.strokeWidth / 2;
    const innerRx = rx > 0 ? Math.max(0, rx - inset) : 0;
    let attrs = `x="${r.x + inset}" y="${r.y + inset}" width="${Math.max(0, r.width - r.strokeWidth)}" height="${Math.max(0, r.height - r.strokeWidth)}" fill="${r.fill}" stroke="${r.stroke}" stroke-width="${r.strokeWidth}"`;
    if (innerRx > 0) attrs = attrs.replace(' fill="', ` rx="${innerRx}" fill="`);
    return `<rect ${attrs}/>`;
  }
  let attrs = `x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${r.fill}"`;
  if (rx > 0) attrs += ` rx="${rx}"`;
  return `<rect ${attrs}/>`;
}

export function getUnderprintDir(templateId) {
  return path.join(app.getPath("userData"), "templates", "underprints", templateId);
}

/**
 * Mask product grid cells on the source flyer image to produce an underprint.
 */
export async function generateUnderprint(sourcePath, outputPath, width, height, departmentAreas) {
  const defs = [];
  const shapes = [];

  for (let areaIdx = 0; areaIdx < (departmentAreas ?? []).length; areaIdx++) {
    const area = departmentAreas[areaIdx];
    const pr = area.productRegion;
    if (!pr) continue;

    const rs = area.regionStyle ?? {};
    const cs = area.cardStyle ?? {};
    const regionBg = safeHex(rs.backgroundColor, safeHex(cs.backgroundColor, "#ffffff"));
    const regionRadius = Math.max(0, parseInt(rs.borderRadius ?? 0, 10));
    const cellBg = safeHex(cs.backgroundColor, "#ffffff");
    const borderW = Math.max(0, parseInt(cs.borderWidth ?? 0, 10));
    const borderColor = safeHex(cs.borderColor, "#e2e8f0");
    const radius = Math.max(0, parseInt(cs.borderRadius ?? 0, 10));

    const clipId = `dept-clip-${areaIdx}`;
    const clipRx = regionRadius > 0 ? Math.min(regionRadius, pr.width / 2, pr.height / 2) : 0;
    if (clipRx > 0) {
      defs.push(`<clipPath id="${clipId}"><rect x="${pr.x}" y="${pr.y}" width="${pr.width}" height="${pr.height}" rx="${clipRx}"/></clipPath>`);
    }

    // Department background (not clipped — defines the visible region)
    shapes.push(rectSvg({
      x: pr.x,
      y: pr.y,
      width: pr.width,
      height: pr.height,
      fill: regionBg,
      stroke: null,
      strokeWidth: 0,
      radius: regionRadius,
    }));

    const cells = automationCellRectsForArea(area);
    const cellShapes = [];
    for (const cell of cells) {
      if (cell.width <= 0 || cell.height <= 0) continue;
      const cx = Math.max(pr.x, cell.x);
      const cy = Math.max(pr.y, cell.y);
      const cx2 = Math.min(pr.x + pr.width, cell.x + cell.width);
      const cy2 = Math.min(pr.y + pr.height, cell.y + cell.height);
      const cw = cx2 - cx;
      const ch = cy2 - cy;
      if (cw <= 0 || ch <= 0) continue;
      cellShapes.push(rectSvg({
        x: cx,
        y: cy,
        width: cw,
        height: ch,
        fill: cellBg,
        stroke: borderW > 0 ? borderColor : null,
        strokeWidth: borderW,
        radius,
      }));
    }

    if (clipRx > 0 && cellShapes.length) {
      shapes.push(`<g clip-path="url(#${clipId})">${cellShapes.join("")}</g>`);
    } else {
      shapes.push(...cellShapes);
    }
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const pipeline = sharp(sourcePath).resize(width, height, { fit: "fill" });

  if (shapes.length === 0) {
    await pipeline.png().toFile(outputPath);
    return outputPath;
  }

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${shapes.join("")}</svg>`;

  await pipeline
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

export function normalizeFieldKind(raw) {
  const k = String(raw || "custom").toLowerCase();
  return VALID_FIELD_KINDS.has(k) ? k : "custom";
}

/** Copy underprint assets into permanent template storage. */
export async function persistTemplateAssets(_event, templateId, pages) {
  const destDir = path.join(app.getPath("userData"), "templates", templateId);
  await fs.promises.mkdir(destDir, { recursive: true });

  const updatedPages = [];

  for (let i = 0; i < (pages ?? []).length; i++) {
    const p = pages[i];
    let backgroundImage = p.backgroundImage;

    if (backgroundImage && !String(backgroundImage).startsWith("data:")) {
      const src = normalizeFilePath(backgroundImage);
      if (src && fs.existsSync(src)) {
        const dest = path.join(destDir, `underprint_p${i + 1}.png`);
        await fs.promises.copyFile(src, dest);
        backgroundImage = dest;
      }
    }

    updatedPages.push({ ...p, backgroundImage });
  }

  return updatedPages;
}

function normalizeFilePath(raw) {
  if (!raw) return null;
  let p = String(raw);
  if (p.startsWith("file:///")) p = p.slice(8);
  else if (p.startsWith("file://")) p = p.slice(7);
  return path.normalize(p);
}

export async function regenerateUnderprint(_event, payload) {
  const {
    sourcePath,
    outputPath,
    canvasWidth,
    canvasHeight,
    departmentAreas,
  } = payload ?? {};

  if (!sourcePath) throw new Error("sourcePath is required");

  const out = outputPath ?? path.join(
    path.dirname(sourcePath),
    `underprint_${Date.now()}.png`
  );

  return generateUnderprint(
    sourcePath,
    out,
    canvasWidth,
    canvasHeight,
    departmentAreas ?? []
  );
}
