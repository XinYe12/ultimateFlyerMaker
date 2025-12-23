import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import FormData from "form-data";

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

export async function runCutout(inputPath) {
  fs.mkdirSync(PROJECT_CUTOUT_DIR, { recursive: true });

  const outPath = getCutoutPath(inputPath);

  const form = new FormData();
  form.append("file", fs.createReadStream(inputPath));

  const res = await fetch("http://127.0.0.1:17890/cutout", {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    throw new Error(`CUTOUT failed: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log("✅ CUTOUT WRITTEN:", outPath);

  return outPath;
}
