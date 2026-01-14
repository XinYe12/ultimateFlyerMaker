import fs from "fs";
import path from "path";
import { getBackendInfo } from "./startBackend.js";

/**
 * Single source of truth for project cutout assets
 */
const PROJECT_CUTOUT_DIR = path.resolve(
  process.cwd(),
  "apps/desktop/project_assets/cutouts"
);

function getCutoutPath(inputPath) {
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(PROJECT_CUTOUT_DIR, `${base}.cutout.png`);
}

/**
 * Runs cutout via backend proxy (NO hardcoded host/port)
 */
export async function runCutout(inputPath) {
  fs.mkdirSync(PROJECT_CUTOUT_DIR, { recursive: true });

  const outPath = getCutoutPath(inputPath);

  const backend = getBackendInfo();
  if (!backend) {
    throw new Error("Backend not started");
  }

  const res = await fetch(`${backend.url}/cutout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filePath: inputPath }),
  });

  if (!res.ok) {
    throw new Error(`CUTOUT failed: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log("✅ CUTOUT WRITTEN:", outPath);

  return outPath;
}
